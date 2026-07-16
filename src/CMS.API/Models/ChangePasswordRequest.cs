namespace CMS.API.Models;

/// <summary>Body of <c>POST /api/auth/change-password</c> — the signed-in user changing their own password.</summary>
/// <remarks>
/// <para>
/// 🔐 These are <b>plaintext passwords</b>, which is unavoidable: the server must hash them itself to
/// compare against the column. Never log this object, never echo any field back, never persist it.
/// Nothing hashed travels in either direction — the response is a bare 204.
/// </para>
/// <para>
/// <b>No UserId property</b>, deliberately: the account comes from the JWT's <c>sub</c> claim, so
/// there is nothing to bind and no way to point this at someone else's account. Same enforcement as
/// <see cref="UpdateProfileRequest"/>.
/// </para>
/// <para>
/// No <c>[Required]</c>/<c>[MaxLength]</c> anywhere here on purpose. A password is not trimmed or
/// length-capped like a display name: <see cref="Data.PasswordPolicy"/> is the only rule for the new
/// one, and the current one is judged solely by whether its hash matches. An attribute would add a
/// second, quieter rule that could disagree with the policy.
/// </para>
/// </remarks>
public class ChangePasswordRequest
{
    public string CurrentPassword { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
    public string ConfirmNewPassword { get; set; } = string.Empty;
}
