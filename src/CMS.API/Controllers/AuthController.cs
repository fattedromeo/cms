using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.JsonWebTokens;

namespace CMS.API.Controllers;

/// <summary>Login / token issuance, and the signed-in user's own profile.</summary>
/// <remarks>
/// <para>
/// Route is lowercase to match the existing convention (<c>api/app-users</c>, <c>api/lookups</c>).
/// ASP.NET routing is case-insensitive, so <c>POST /api/Auth/login</c> reaches this action too.
/// </para>
/// <para>
/// ⚠️ <b><see cref="AllowAnonymousAttribute"/> lives on <see cref="Login"/> alone — never move it up
/// to the controller.</b> The authorization middleware asks
/// <c>endpoint.Metadata.GetMetadata&lt;IAllowAnonymous&gt;()</c>, which finds a controller-level
/// attribute <i>regardless of what the action declares</i>, so a class-level
/// <c>[AllowAnonymous]</c> silently defeats <c>[Authorize]</c> on <see cref="UpdateProfile"/> and
/// lets anonymous callers into the action body.
/// </para>
/// <para>
/// <b>Measured on this controller</b>, both ways: with the attribute at class level an
/// unauthenticated <c>PUT /api/auth/profile</c> ran the action and returned this class's own
/// <c>invalid credentials</c> 401 with <b>no <c>WWW-Authenticate</c> header</b>; with it on
/// <see cref="Login"/> only, the request never reaches the action and the pipeline answers
/// <c>401</c> + <c>WWW-Authenticate: Bearer</c>. <b>Status alone cannot tell those apart</b> — which
/// is exactly why this is easy to "verify" wrongly, and why the tests assert the challenge header
/// and that the repository was never called, not merely the 401.
/// </para>
/// </remarks>
[ApiController]
[Route("api/auth")]
[Produces("application/json")]
public class AuthController : ControllerBase
{
    /// <summary>
    /// The single failure message for every rejected login.
    /// </summary>
    /// <remarks>
    /// Unknown UserId, disabled account and wrong password all return this exact 401. Saying which
    /// check failed would turn the endpoint into an account-enumeration oracle: "wrong password"
    /// confirms the account exists, and "account disabled" confirms both that it exists and that the
    /// password was right.
    /// </remarks>
    private const string InvalidCredentialsMessage = "invalid credentials";

    private readonly IAuthRepository _auth;
    private readonly IJwtTokenService _tokens;
    private readonly ISysConfigRepository _sysConfig;

    public AuthController(IAuthRepository auth, IJwtTokenService tokens, ISysConfigRepository sysConfig)
    {
        _auth = auth;
        _tokens = tokens;
        _sysConfig = sysConfig;
    }

    /// <summary>
    /// Authenticate against AppUser and issue a 24-hour JWT access token.
    /// </summary>
    /// <remarks>
    /// Checks, all of which fail to the same generic 401: the UserId must exist (case-insensitively,
    /// per the column collation), IsActive must be true, and SHA-256 of the supplied password must
    /// equal the stored PasswordHash.
    /// </remarks>
    [HttpPost("login")]
    [AllowAnonymous] // The one opt-out from Program.cs's global policy: login cannot need a token.
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        var user = await _auth.FindByUserIdAsync(request.UserId, ct);

        if (user is null) return InvalidCredentials();          // unknown UserId
        if (!user.IsActive) return InvalidCredentials();        // disabled account
        if (!HashMatches(request.Password, user.PasswordHash))  // wrong password
            return InvalidCredentials();

        var accessToken = await _tokens.CreateAccessTokenAsync(user, ct);

        // UserId echoes the STORED value, not request.UserId — the lookup is case-insensitive, so
        // a client posting "MILES@UUU.COM.TW" must still be told its canonical id.
        return Ok(new LoginResponse
        {
            UserId = user.UserId,
            UserName = user.UserName,
            AccessToken = accessToken
        });
    }

    /// <summary>
    /// Update the signed-in user's own display name. 個人資料 My Profile.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The account updated is the one in the token, never one named in the body.</b>
    /// <see cref="UpdateProfileRequest"/> has no UserId property at all, so there is nothing to
    /// over-post — a JSON body carrying <c>"userId"</c> is simply dropped by model binding. Roles are
    /// likewise unreachable from here: the repository's UPDATE touches only the UserName column and
    /// never AppUserRole.
    /// </para>
    /// <para>
    /// The token's own <c>name</c> claim is NOT reissued and goes stale until the next login. That is
    /// harmless — nothing server-side reads it (authorization uses <c>sub</c> and <c>role</c>), and
    /// the client renders the name from the stored profile, which this response refreshes. Reissuing
    /// would silently restart the 24h clock.
    /// </para>
    /// </remarks>
    [HttpPut("profile")]
    [Authorize]
    [ProducesResponseType(typeof(ProfileResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ProfileResponse>> UpdateProfile(
        [FromBody] UpdateProfileRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        // Identity comes from the validated token. MapInboundClaims is off (see Program.cs), so the
        // claim type is the raw "sub" rather than the ClaimTypes.NameIdentifier schema URI — reading
        // the wrong one here would return null and 401 every caller.
        var userId = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (string.IsNullOrEmpty(userId)) return Unauthorized(new { message = InvalidCredentialsMessage });

        // Trim BEFORE validating: [Required] accepts "   " (it only rejects ""), so a whitespace-only
        // name would otherwise reach the DB and render as a blank user in the shell.
        var userName = (request.UserName ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(userName))
        {
            ModelState.AddModelError(nameof(UpdateProfileRequest.UserName), "請輸入使用者名稱。");
            return ValidationProblem(ModelState);
        }

        var updated = await _auth.UpdateUserNameAsync(userId, userName, ct);
        // The token is valid but its account is gone — deleted mid-session, since the token outlives
        // any change to the row.
        if (!updated) return NotFound(new { message = "找不到使用者。" });

        // Echo the STORED value so the client adopts the trimmed name rather than its own input.
        return Ok(new ProfileResponse { UserId = userId, UserName = userName });
    }

    /// <summary>
    /// Change the signed-in user's own password. 變更密碼.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Steps, in order: the current password must hash to the stored value; the new password must
    /// satisfy <see cref="PasswordPolicy"/>; new and confirm must match. Only then are
    /// <c>PasswordHash</c> and <c>PasswordUpdatedTime</c> written — a failure at any step changes
    /// nothing.
    /// </para>
    /// <para>
    /// ⚠️ <b>Every rejection is a 400, never a 401 — including a wrong current password.</b> A 401
    /// here would be read by the Angular interceptor as "your session died": it would clear session
    /// storage and bounce the user to the login page, losing the form, on nothing worse than a typo.
    /// The 401s on this controller belong to <see cref="Login"/> alone.
    /// </para>
    /// <para>
    /// 🔐 No hash crosses the wire in either direction: the request carries plaintext (the server
    /// must hash it to compare), and the reply is a bare 204 with no body to leak one.
    /// </para>
    /// </remarks>
    [HttpPost("change-password")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ChangePassword(
        [FromBody] ChangePasswordRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        var userId = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (string.IsNullOrEmpty(userId)) return Unauthorized(new { message = InvalidCredentialsMessage });

        var user = await _auth.FindByUserIdAsync(userId, ct);
        // A valid token whose account no longer exists — the token outlives the row for up to 24h.
        if (user is null) return NotFound(new { message = "找不到使用者。" });

        // 1. Current password. Note it is NOT trimmed — unlike a display name, whitespace is part of
        //    a password, and trimming would let " x" authenticate as "x".
        if (!HashMatches(request.CurrentPassword ?? string.Empty, user.PasswordHash))
            return BadRequest(new { message = "目前密碼不正確。" });

        // 2. Complexity of the new password. Same rule the Angular form applies, but this is the one
        //    that decides — a client can post whatever it likes.
        if (!PasswordPolicy.IsSatisfiedBy(request.NewPassword))
            return BadRequest(new { message = PasswordPolicy.ViolationMessage });

        // 3. Confirmation. Ordinal: two passwords differing only in case are different passwords.
        if (!string.Equals(request.NewPassword, request.ConfirmNewPassword, StringComparison.Ordinal))
            return BadRequest(new { message = "新密碼與確認密碼不一致。" });

        // 4. Store. UTC because the column is naive and the UI renders it as UTC (see the repository).
        var updated = await _auth.UpdatePasswordAsync(
            userId, PasswordHasher.Hash(request.NewPassword), DateTime.UtcNow, ct);
        if (!updated) return NotFound(new { message = "找不到使用者。" });

        // 204: nothing to say, and nothing that could carry a hash back.
        return NoContent();
    }

    /// <summary>
    /// Reset another user's password back to the configured default. 重設密碼為預設值. <b>Admin only.</b>
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b><see cref="AuthorizeAttribute"/> with the Admin role is the access control</b> — not the
    /// fact that the 使用者 page is Admin-only, and certainly not that the button is hidden. This is
    /// the only endpoint on this controller that acts on an account other than the caller's, so it is
    /// the only one where the role check is what stands between any signed-in user and every other
    /// user's password.
    /// </para>
    /// <para>
    /// <b><c>PasswordUpdatedTime</c> is set to NULL, not "now"</b> — decided with the user, matching
    /// <c>spec/auth/AppUser.md</c>. NULL is this schema's signal for "still on the default password,
    /// never chosen", which is exactly true after a reset, and it is what create writes for the same
    /// state. A timestamp would claim the user chose the (publicly known, shared) default and would
    /// defeat any force-a-change-at-first-sign-in behaviour keyed off NULL.
    /// </para>
    /// <para>
    /// 🔐 The default password is read from SysConfig at runtime, hashed, and discarded. It is never
    /// logged, never returned, and never accepted from the request — <see cref="ResetPasswordRequest"/>
    /// has no password property, so an Admin cannot set an arbitrary one for someone else. The reply
    /// is a bare 204.
    /// </para>
    /// </remarks>
    [HttpPost("reset-password")]
    [Authorize(Roles = AdminRole.Name)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ResetPassword(
        [FromBody] ResetPasswordRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        // Read at runtime, never hard-coded. Throws (→ 500) rather than falling back if the config is
        // missing — the same loud failure AppUserRepository.CreateAsync relies on, because a fallback
        // would put a guessable password on the account.
        var defaultPassword = await _sysConfig.GetDefaultPasswordAsync(ct);

        var updated = await _auth.UpdatePasswordAsync(
            request.UserId, PasswordHasher.Hash(defaultPassword), updatedAtUtc: null, ct);

        return updated
            ? NoContent()
            : NotFound(new { message = $"找不到使用者「{request.UserId}」。" });
    }

    private UnauthorizedObjectResult InvalidCredentials()
        => Unauthorized(new { message = InvalidCredentialsMessage });

    /// <summary>Constant-time comparison of SHA-256(password) against the stored hash.</summary>
    /// <remarks>
    /// <para>
    /// Both sides are normalised (trim + lowercase) before comparing. The stored column is
    /// <c>Chinese_Taiwan_Stroke_CI_AS</c> — a case-<i>insensitive</i> collation — so SQL itself
    /// treats "AB12.." and "ab12.." as the same hash, and for a hex digest they <i>are</i> the same
    /// value. A plain ordinal compare here would lock out any account whose hash was written in
    /// uppercase, silently and with a generic 401 that gives no hint why. Normalising costs nothing
    /// and cannot weaken the check: the digest is hex, so case carries no information.
    /// </para>
    /// <para>
    /// <see cref="CryptographicOperations.FixedTimeEquals"/> keeps the comparison constant-time so
    /// the response latency does not leak how many leading characters were correct. It returns false
    /// for a length mismatch rather than throwing.
    /// </para>
    /// </remarks>
    private static bool HashMatches(string password, string storedHash)
    {
        var supplied = Encoding.UTF8.GetBytes(PasswordHasher.Hash(password));
        var stored = Encoding.UTF8.GetBytes(storedHash.Trim().ToLowerInvariant());
        return CryptographicOperations.FixedTimeEquals(supplied, stored);
    }
}
