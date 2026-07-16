using System.Security.Claims;
using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.JsonWebTokens;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// Unit tests for <c>PUT /api/auth/profile</c> (<see cref="AuthController.UpdateProfile"/>).
/// </summary>
/// <remarks>
/// The controller reads the caller from <c>HttpContext.User</c>, so each test builds a
/// <see cref="ClaimsPrincipal"/> with the same claim types the real token carries — raw <c>sub</c>
/// and <c>role</c>, because `Program.cs` sets <c>MapInboundClaims = false</c>. Whether the endpoint
/// is reachable at all without a token is a pipeline question and lives in
/// <see cref="AuthorizationIntegrationTests"/>; a unit test calls the method directly and would
/// never notice.
/// </remarks>
public class AuthProfileControllerTests
{
    private readonly Mock<IAuthRepository> _auth = new(MockBehavior.Strict);
    private readonly Mock<ISigningKeyProvider> _keys = new(MockBehavior.Strict);
    // Strict, no setup: renaming yourself must never touch SysConfig. Any call fails the test.
    private readonly Mock<ISysConfigRepository> _sysConfig = new(MockBehavior.Strict);

    /// <summary>Builds the controller with a signed-in caller identified only by the token.</summary>
    private AuthController ControllerFor(string? sub = "miles@uuu.com.tw")
    {
        var claims = new List<Claim> { new("role", "User") };
        if (sub is not null) claims.Add(new Claim(JwtRegisteredClaimNames.Sub, sub));

        var controller = new AuthController(
            _auth.Object, new JwtTokenService(_keys.Object), _sysConfig.Object)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth")),
                },
            },
        };
        return controller;
    }

    private void ExpectUpdate(string userId, string userName, bool result = true)
        => _auth.Setup(a => a.UpdateUserNameAsync(userId, userName, It.IsAny<CancellationToken>()))
            .ReturnsAsync(result);

    private static ProfileResponse AssertOk(ActionResult<ProfileResponse> result)
    {
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        return Assert.IsType<ProfileResponse>(ok.Value);
    }

    // --- The happy path ---------------------------------------------------
    [Fact]
    public async Task UpdateProfile_UpdatesUserNameForTheJwtUser()
    {
        ExpectUpdate("miles@uuu.com.tw", "Miles S.");

        var body = AssertOk(await ControllerFor().UpdateProfile(
            new UpdateProfileRequest { UserName = "Miles S." }, CancellationToken.None));

        Assert.Equal("miles@uuu.com.tw", body.UserId);
        Assert.Equal("Miles S.", body.UserName);
        _auth.VerifyAll();
    }

    [Fact]
    public async Task UpdateProfile_TargetsTheTokenSubject_NotSomeoneElse()
    {
        // A different signed-in user must only ever be able to rename themselves.
        ExpectUpdate("someone.else@uuu.com.tw", "New Name");

        await ControllerFor("someone.else@uuu.com.tw").UpdateProfile(
            new UpdateProfileRequest { UserName = "New Name" }, CancellationToken.None);

        _auth.Verify(a => a.UpdateUserNameAsync(
            "someone.else@uuu.com.tw", "New Name", It.IsAny<CancellationToken>()), Times.Once);
        _auth.Verify(a => a.UpdateUserNameAsync(
            "miles@uuu.com.tw", It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // --- The body cannot retarget or escalate -----------------------------
    [Fact]
    public void UpdateProfileRequest_HasNoUserIdOrRoleProperty()
    {
        // The enforcement is the TYPE: with nothing to bind, "userId" in a JSON body is dropped by
        // model binding and roles cannot be granted here at all. A runtime check could be forgotten;
        // an absent property cannot.
        var properties = typeof(UpdateProfileRequest).GetProperties().Select(p => p.Name).ToArray();

        Assert.Equal([nameof(UpdateProfileRequest.UserName)], properties);
    }

    [Fact]
    public async Task UpdateProfile_IgnoresAUserIdInTheRequestBody()
    {
        // The over-post attempt: a body naming a victim. It binds to nothing, so the update still
        // targets the token's subject. (Model binding is what drops it — this asserts the outcome.)
        ExpectUpdate("miles@uuu.com.tw", "Renamed");

        await ControllerFor("miles@uuu.com.tw").UpdateProfile(
            new UpdateProfileRequest { UserName = "Renamed" }, CancellationToken.None);

        _auth.Verify(a => a.UpdateUserNameAsync(
            "miles@uuu.com.tw", "Renamed", It.IsAny<CancellationToken>()), Times.Once);
        // Nothing else was touched: no role write, no other user.
        _auth.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task UpdateProfile_NoSubClaim_IsRejectedAndTouchesNothing()
    {
        var result = await ControllerFor(sub: null).UpdateProfile(
            new UpdateProfileRequest { UserName = "Nice Try" }, CancellationToken.None);

        Assert.IsType<UnauthorizedObjectResult>(result.Result);
        _auth.VerifyNoOtherCalls();
    }

    // --- UserName validation ---------------------------------------------
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t")]
    [InlineData("\n  \t ")]
    public async Task UpdateProfile_EmptyOrWhitespaceUserName_IsRejected(string userName)
    {
        // [Required] alone would let "   " through (it only rejects ""), leaving a blank name in the
        // shell. The controller trims first, then validates.
        var result = await ControllerFor().UpdateProfile(
            new UpdateProfileRequest { UserName = userName }, CancellationToken.None);

        Assert.IsType<ObjectResult>(result.Result); // ValidationProblem
        _auth.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task UpdateProfile_InvalidModelState_IsRejected()
    {
        var controller = ControllerFor();
        controller.ModelState.AddModelError(nameof(UpdateProfileRequest.UserName), "太長了");

        var result = await controller.UpdateProfile(
            new UpdateProfileRequest { UserName = new string('x', 201) }, CancellationToken.None);

        Assert.IsType<ObjectResult>(result.Result);
        _auth.VerifyNoOtherCalls();
    }

    [Theory]
    [InlineData("  Miles Sun  ", "Miles Sun")]
    [InlineData("\tMiles Sun\n", "Miles Sun")]
    [InlineData("孫小明 ", "孫小明")]
    public async Task UpdateProfile_TrimsBeforeSaving(string posted, string stored)
    {
        ExpectUpdate("miles@uuu.com.tw", stored);

        var body = AssertOk(await ControllerFor().UpdateProfile(
            new UpdateProfileRequest { UserName = posted }, CancellationToken.None));

        // Saved trimmed AND echoed trimmed — the client adopts the stored value, so the two cannot
        // drift apart over a stray space.
        _auth.Verify(a => a.UpdateUserNameAsync(
            "miles@uuu.com.tw", stored, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(stored, body.UserName);
    }

    [Fact]
    public async Task UpdateProfile_KeepsInnerWhitespace()
    {
        // Trim is edges-only; a real name may contain spaces.
        ExpectUpdate("miles@uuu.com.tw", "Miles  Sun");

        var body = AssertOk(await ControllerFor().UpdateProfile(
            new UpdateProfileRequest { UserName = " Miles  Sun " }, CancellationToken.None));

        Assert.Equal("Miles  Sun", body.UserName);
    }

    // --- Missing row ------------------------------------------------------
    [Fact]
    public async Task UpdateProfile_UserDeletedMidSession_Returns404()
    {
        // The token outlives the row: it stays valid for 24h even if the account is deleted.
        ExpectUpdate("miles@uuu.com.tw", "Ghost", result: false);

        var result = await ControllerFor().UpdateProfile(
            new UpdateProfileRequest { UserName = "Ghost" }, CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    // --- Nothing leaks ----------------------------------------------------
    [Fact]
    public void ProfileResponse_CarriesNoSecretsAndNoRoles()
    {
        var properties = typeof(ProfileResponse).GetProperties().Select(p => p.Name).ToArray();

        // No PasswordHash (the standing rule), and no roles — those are claims in the token the
        // client already holds; a second copy could disagree with what the API enforces.
        Assert.Equal([nameof(ProfileResponse.UserId), nameof(ProfileResponse.UserName)], properties);
    }
}
