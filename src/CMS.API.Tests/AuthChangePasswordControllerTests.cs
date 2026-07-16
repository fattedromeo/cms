using System.Security.Claims;
using CMS.API.Controllers;
using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.JsonWebTokens;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// Unit tests for <c>POST /api/auth/change-password</c> (<see cref="AuthController.ChangePassword"/>).
/// </summary>
/// <remarks>
/// Fixtures use <b>hard-coded</b> SHA-256 digests rather than calling
/// <see cref="PasswordHasher"/> to build the expected value — reusing the hasher to compute what the
/// controller is checked against would make these pass even if the hasher and the verify path drifted
/// together. <see cref="PasswordHasherTests"/> pins the hasher itself against NIST vectors.
/// </remarks>
public class AuthChangePasswordControllerTests
{
    private const string CurrentPassword = "P@ssw0rd!";

    /// <summary>SHA-256("P@ssw0rd!"), computed independently.</summary>
    private const string CurrentHash = "0e44ce7308af2b3de5232e4616403ce7d49ba2aec83f79c196409556422a4927";

    /// <summary>
    /// A policy-compliant new password: 11 chars, all four classes (S/P upper, digit 0, symbol !).
    /// </summary>
    /// <remarks>
    /// The obvious "correct-horse" would NOT do — lowercase + hyphen is only two classes, so the
    /// policy rightly rejects it. Any fixture here has to satisfy the rule under test.
    /// </remarks>
    private const string NewPassword = "Str0ng!Pass";

    /// <summary>SHA-256("Str0ng!Pass"), computed independently.</summary>
    private const string NewHash = "0091569c1459c60d9d0349571aedf0eba40755795da76232b50e0e217e79da18";

    private readonly Mock<IAuthRepository> _auth = new(MockBehavior.Strict);
    private readonly Mock<ISigningKeyProvider> _keys = new(MockBehavior.Strict);
    // Strict, no setup: changing your own password uses the password you typed, never the configured
    // DEFAULT one. Any read of SysConfig here would mean the two flows had been confused.
    private readonly Mock<ISysConfigRepository> _sysConfig = new(MockBehavior.Strict);

    private AuthController ControllerFor(string? sub = "miles@uuu.com.tw")
    {
        var claims = new List<Claim> { new("role", "User") };
        if (sub is not null) claims.Add(new Claim(JwtRegisteredClaimNames.Sub, sub));

        return new AuthController(
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
    }

    private void ExistingUser(string hash = CurrentHash, string userId = "miles@uuu.com.tw")
        => _auth.Setup(a => a.FindByUserIdAsync(userId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new UserCredential(userId, "Miles Sun", hash, true, ["User"]));

    private Task<IActionResult> Change(
        string current = CurrentPassword, string @new = NewPassword, string? confirm = null,
        string? sub = "miles@uuu.com.tw")
        => ControllerFor(sub).ChangePassword(
            new ChangePasswordRequest
            {
                CurrentPassword = current,
                NewPassword = @new,
                ConfirmNewPassword = confirm ?? @new,
            },
            CancellationToken.None);

    private void VerifyNothingWasWritten()
        => _auth.Verify(a => a.UpdatePasswordAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()),
            Times.Never);

    private static string MessageOf(IActionResult result)
    {
        var payload = Assert.IsType<BadRequestObjectResult>(result).Value!;
        return payload.GetType().GetProperty("message")!.GetValue(payload)!.ToString()!;
    }

    // --- Success -----------------------------------------------------------
    [Fact]
    public async Task ValidChange_SetsHashOfTheNewPasswordAndTouchesPasswordUpdatedTime()
    {
        ExistingUser();
        DateTime? written = null;
        _auth.Setup(a => a.UpdatePasswordAsync(
                "miles@uuu.com.tw", NewHash, It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .Callback<string, string, DateTime?, CancellationToken>((_, _, at, _) => written = at)
            .ReturnsAsync(true);

        var before = DateTime.UtcNow;
        var result = await Change();

        Assert.IsType<NoContentResult>(result);
        // Exactly SHA256(new password) — asserted via the Setup's NewHash argument match above.
        _auth.VerifyAll();
        Assert.InRange(written!.Value, before.AddSeconds(-5), DateTime.UtcNow.AddSeconds(5));
    }

    [Fact]
    public async Task ValidChange_StampsUtc_NotLocalTime()
    {
        // The column is a naive `datetime` and the UI renders it by appending 'Z', so a local
        // timestamp would display 8h in the future in UTC+8. Decided with the user.
        ExistingUser();
        DateTime? written = null;
        _auth.Setup(a => a.UpdatePasswordAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .Callback<string, string, DateTime?, CancellationToken>((_, _, at, _) => written = at)
            .ReturnsAsync(true);

        await Change();

        // Guards the actual mistake: DateTime.Now would be ~8h off UtcNow in this timezone.
        Assert.InRange(written!.Value, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(1));
    }

    [Fact]
    public async Task ValidChange_TargetsTheTokenUser_NotABodyField()
    {
        ExistingUser(userId: "someone.else@uuu.com.tw");
        _auth.Setup(a => a.UpdatePasswordAsync(
                "someone.else@uuu.com.tw", NewHash, It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        Assert.IsType<NoContentResult>(await Change(sub: "someone.else@uuu.com.tw"));
        _auth.VerifyAll();
    }

    [Fact]
    public void ChangePasswordRequest_HasNoUserIdAndNoHashProperty()
    {
        // The account cannot be retargeted, and no hash can be posted in: enforced by the type.
        var properties = typeof(ChangePasswordRequest).GetProperties().Select(p => p.Name).ToArray();

        Assert.Equal(
            [
                nameof(ChangePasswordRequest.CurrentPassword),
                nameof(ChangePasswordRequest.NewPassword),
                nameof(ChangePasswordRequest.ConfirmNewPassword),
            ],
            properties);
    }

    // --- 1. Wrong current password ----------------------------------------
    [Fact]
    public async Task WrongCurrentPassword_ChangesNothing()
    {
        ExistingUser();

        var result = await Change(current: "not-my-password");

        Assert.Equal("目前密碼不正確。", MessageOf(result));
        VerifyNothingWasWritten();
    }

    [Fact]
    public async Task WrongCurrentPassword_Is400_Not401()
    {
        // ⚠️ A 401 would make the Angular interceptor clear session storage and redirect to /login,
        // throwing the user out of the form over a typo. Rejections here are always 400.
        ExistingUser();

        var result = await Change(current: "not-my-password");

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.IsNotType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public async Task CurrentPasswordIsNotTrimmed()
    {
        // Whitespace is part of a password: " P@ssw0rd!" is not "P@ssw0rd!". Trimming here would let
        // a near-miss authenticate.
        ExistingUser();

        var result = await Change(current: " " + CurrentPassword);

        Assert.Equal("目前密碼不正確。", MessageOf(result));
        VerifyNothingWasWritten();
    }

    [Fact]
    public async Task WrongCurrentPassword_IsCheckedBeforeComplexity()
    {
        // Order matters: a bad current password must not be told whether the new one was acceptable.
        ExistingUser();

        var result = await Change(current: "wrong", @new: "weak");

        Assert.Equal("目前密碼不正確。", MessageOf(result));
    }

    // --- 2. Complexity -----------------------------------------------------
    [Theory]
    [InlineData("Ab1!xyz")]     // 7 chars, four classes
    [InlineData("Abc1")]        // far too short
    [InlineData("")]            // empty
    public async Task NewPasswordShorterThanEight_IsRejected(string newPassword)
    {
        ExistingUser();

        var result = await Change(@new: newPassword);

        Assert.Equal(PasswordPolicy.ViolationMessage, MessageOf(result));
        VerifyNothingWasWritten();
    }

    [Theory]
    [InlineData("abcdefghij")]  // lower only
    [InlineData("ABCDEFGHIJ")]  // upper only
    [InlineData("1234567890")]  // digit only
    [InlineData("abcdefgh12")]  // lower + digit  => 2 classes
    [InlineData("abcdefghIJ")]  // lower + upper  => 2 classes
    public async Task NewPasswordWithFewerThanThreeClasses_IsRejected(string newPassword)
    {
        ExistingUser();

        var result = await Change(@new: newPassword);

        Assert.Equal(PasswordPolicy.ViolationMessage, MessageOf(result));
        VerifyNothingWasWritten();
    }

    [Fact]
    public async Task ComplexityFailure_ReturnsTheSpecifiedBilingualMessage()
    {
        ExistingUser();

        var message = MessageOf(await Change(@new: "abcdefgh"));

        Assert.Contains("密碼長度至少需 8 碼", message);
        Assert.Contains("大寫英文／小寫英文／數字／符號", message);
        Assert.Contains("at least 3 of the 4 classes", message);
    }

    // --- 3. Confirmation ---------------------------------------------------
    [Fact]
    public async Task NewAndConfirmMismatch_IsRejected()
    {
        ExistingUser();

        var result = await Change(@new: "Abcdefg1!", confirm: "Abcdefg1?");

        Assert.Equal("新密碼與確認密碼不一致。", MessageOf(result));
        VerifyNothingWasWritten();
    }

    [Fact]
    public async Task ConfirmComparisonIsCaseSensitive()
    {
        // Two passwords differing only in case are different passwords.
        ExistingUser();

        var result = await Change(@new: "Abcdefg1!", confirm: "abcdefg1!");

        Assert.Equal("新密碼與確認密碼不一致。", MessageOf(result));
        VerifyNothingWasWritten();
    }

    [Fact]
    public async Task MismatchIsCheckedAfterComplexity()
    {
        // A weak password reports the policy, not the mismatch — the policy is the more useful fact
        // and both are wrong anyway.
        ExistingUser();

        var result = await Change(@new: "weak", confirm: "different");

        Assert.Equal(PasswordPolicy.ViolationMessage, MessageOf(result));
    }

    // --- Identity / missing row -------------------------------------------
    [Fact]
    public async Task NoSubClaim_IsRejectedAndReadsNothing()
    {
        var result = await Change(sub: null);

        Assert.IsType<UnauthorizedObjectResult>(result);
        _auth.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task UserDeletedMidSession_Returns404()
    {
        _auth.Setup(a => a.FindByUserIdAsync("miles@uuu.com.tw", It.IsAny<CancellationToken>()))
            .ReturnsAsync((UserCredential?)null);

        Assert.IsType<NotFoundObjectResult>(await Change());
        VerifyNothingWasWritten();
    }

    [Fact]
    public async Task UserDeletedBetweenCheckAndWrite_Returns404()
    {
        ExistingUser();
        _auth.Setup(a => a.UpdatePasswordAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        Assert.IsType<NotFoundObjectResult>(await Change());
    }

    // --- Nothing hashed leaves the server ----------------------------------
    [Fact]
    public async Task SuccessResponse_HasNoBodyAtAll()
    {
        // 204: nothing to carry a hash back in.
        ExistingUser();
        _auth.Setup(a => a.UpdatePasswordAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        Assert.IsType<NoContentResult>(await Change());
    }

    [Fact]
    public async Task FailureMessages_NeverQuoteAHashOrAPassword()
    {
        ExistingUser();

        var message = MessageOf(await Change(current: "not-my-password"));

        Assert.DoesNotContain(CurrentHash, message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(CurrentPassword, message, StringComparison.Ordinal);
        Assert.DoesNotContain("not-my-password", message, StringComparison.Ordinal);
    }
}
