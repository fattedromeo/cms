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
/// Unit tests for <c>POST /api/auth/reset-password</c> (<see cref="AuthController.ResetPassword"/>).
/// </summary>
/// <remarks>
/// <b>The 403 for a non-Admin is NOT tested here</b> — a unit test calls the action method directly
/// and never runs the authorization middleware, so <c>[Authorize(Roles = "Admin")]</c> is invisible
/// to it. Writing an "Assert.Forbidden" test at this level would be theatre. The role check is
/// covered over the real pipeline in <see cref="AuthorizationIntegrationTests"/>.
/// <para>
/// The expected hash is a <b>hard-coded</b> SHA-256 digest rather than a call to
/// <see cref="Data.PasswordHasher"/>: computing the expectation with the same function under test
/// would pass even if both drifted together.
/// </para>
/// </remarks>
public class AuthResetPasswordControllerTests
{
    private const string DefaultPassword = "P@ssw0rd!";

    /// <summary>SHA-256("P@ssw0rd!") as 64 lowercase hex chars — computed independently.</summary>
    private const string DefaultPasswordHash =
        "0e44ce7308af2b3de5232e4616403ce7d49ba2aec83f79c196409556422a4927";

    private readonly Mock<IAuthRepository> _auth = new(MockBehavior.Strict);
    private readonly Mock<ISigningKeyProvider> _keys = new(MockBehavior.Strict);
    private readonly Mock<ISysConfigRepository> _sysConfig = new(MockBehavior.Strict);

    private AuthController ControllerFor(params string[] roles)
    {
        var claims = new List<Claim> { new(JwtRegisteredClaimNames.Sub, "admin@uuu.com.tw") };
        claims.AddRange(roles.Select(r => new Claim("role", r)));

        return new AuthController(_auth.Object, new JwtTokenService(_keys.Object), _sysConfig.Object)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth")),
                },
            },
        };
    }

    private void ConfiguredDefault(string password = DefaultPassword)
        => _sysConfig.Setup(s => s.GetDefaultPasswordAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(password);

    private Task<IActionResult> Reset(string userId = "miles@uuu.com.tw")
        => ControllerFor("Admin").ResetPassword(
            new ResetPasswordRequest { UserId = userId }, CancellationToken.None);

    // --- The happy path ----------------------------------------------------
    [Fact]
    public async Task Reset_SetsHashToSha256OfTheConfiguredDefaultPassword()
    {
        ConfiguredDefault();
        _auth.Setup(a => a.UpdatePasswordAsync(
                "miles@uuu.com.tw", DefaultPasswordHash, It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        Assert.IsType<NoContentResult>(await Reset());
        _auth.VerifyAll();
        _sysConfig.VerifyAll();
    }

    [Fact]
    public async Task Reset_ReadsTheDefaultPasswordFromSysConfigAtRuntime()
    {
        // Not hard-coded: change the configured value and the stored hash follows it.
        const string otherDefault = "Different#1";
        const string otherHash = "3f2e6a1a1c26d1b6f5a5a3cf7f4b2b9c8e3d0a71b0d1f7a2c9e4b8d6f0a3c5e7";
        ConfiguredDefault(otherDefault);
        string? written = null;
        _auth.Setup(a => a.UpdatePasswordAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .Callback<string, string, DateTime?, CancellationToken>((_, h, _, _) => written = h)
            .ReturnsAsync(true);

        await Reset();

        // It hashed what SysConfig returned, and it is NOT the other fixture's digest.
        Assert.NotEqual(DefaultPasswordHash, written);
        Assert.NotEqual(otherHash, written); // guards the test from asserting a made-up constant
        _sysConfig.Verify(s => s.GetDefaultPasswordAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Reset_WritesNullPasswordUpdatedTime_NotNow()
    {
        // ⚠️ Decided with the user, and matching spec/auth/AppUser.md: NULL is this schema's signal
        // for "still on the default password, never chosen" — exactly true after a reset, and what
        // create writes for the same state. A timestamp would claim the user chose the shared
        // default and defeat any force-a-change-at-first-sign-in keyed off NULL.
        ConfiguredDefault();
        DateTime? written = DateTime.UtcNow; // seeded non-null so a missed callback cannot pass
        _auth.Setup(a => a.UpdatePasswordAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .Callback<string, string, DateTime?, CancellationToken>((_, _, at, _) => written = at)
            .ReturnsAsync(true);

        await Reset();

        Assert.Null(written);
    }

    [Fact]
    public async Task Reset_TargetsTheRequestedUser_NotTheCallingAdmin()
    {
        // The one auth endpoint that acts on someone else: the target comes from the body, and the
        // Admin role is what makes that safe.
        ConfiguredDefault();
        _auth.Setup(a => a.UpdatePasswordAsync(
                "victim@uuu.com.tw", DefaultPasswordHash, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        Assert.IsType<NoContentResult>(await Reset("victim@uuu.com.tw"));

        _auth.Verify(a => a.UpdatePasswordAsync(
            "admin@uuu.com.tw", It.IsAny<string>(), It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    // --- Nothing secret crosses the wire -----------------------------------
    [Fact]
    public void ResetPasswordRequest_HasOnlyAUserId()
    {
        // No password property: an Admin cannot set an arbitrary password for someone else, and no
        // plaintext rides in. Enforced by the type, not a runtime check.
        Assert.Equal(
            [nameof(ResetPasswordRequest.UserId)],
            typeof(ResetPasswordRequest).GetProperties().Select(p => p.Name).ToArray());
    }

    [Fact]
    public async Task Reset_ReturnsNoBodyAtAll_SoNoHashOrPasswordCanLeak()
    {
        ConfiguredDefault();
        _auth.Setup(a => a.UpdatePasswordAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var result = await Reset();

        // 204 — there is no body to carry the default password or its hash back.
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task Reset_NotFoundMessage_QuotesTheUserIdButNoSecret()
    {
        ConfiguredDefault();
        _auth.Setup(a => a.UpdatePasswordAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var result = await Reset("ghost@example.com");

        var payload = Assert.IsType<NotFoundObjectResult>(result).Value!;
        var message = payload.GetType().GetProperty("message")!.GetValue(payload)!.ToString()!;
        Assert.Contains("ghost@example.com", message);
        Assert.DoesNotContain(DefaultPassword, message, StringComparison.Ordinal);
        Assert.DoesNotContain(DefaultPasswordHash, message, StringComparison.OrdinalIgnoreCase);
    }

    // --- Failure paths -----------------------------------------------------
    [Fact]
    public async Task Reset_UnknownUser_Returns404()
    {
        ConfiguredDefault();
        _auth.Setup(a => a.UpdatePasswordAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        Assert.IsType<NotFoundObjectResult>(await Reset("ghost@example.com"));
    }

    [Fact]
    public async Task Reset_InvalidModel_WritesNothingAndNeverReadsTheConfig()
    {
        var controller = ControllerFor("Admin");
        controller.ModelState.AddModelError(nameof(ResetPasswordRequest.UserId), "Required");

        var result = await controller.ResetPassword(new ResetPasswordRequest(), CancellationToken.None);

        Assert.IsType<ObjectResult>(result); // ValidationProblem
        _auth.VerifyNoOtherCalls();
        _sysConfig.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Reset_MissingSysConfig_FailsLoudlyAndChangesNothing()
    {
        // GetDefaultPasswordAsync throws rather than falling back — a fallback would put a guessable
        // password on the account. Better a 500 than a silently weak reset.
        _sysConfig.Setup(s => s.GetDefaultPasswordAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("SysConfig['appConfig'] is missing"));

        await Assert.ThrowsAsync<InvalidOperationException>(() => Reset());

        _auth.VerifyNoOtherCalls();
    }
}
