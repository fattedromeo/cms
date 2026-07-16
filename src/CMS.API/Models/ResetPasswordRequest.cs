using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>Body of <c>POST /api/auth/reset-password</c> — an Admin resetting someone's password.</summary>
/// <remarks>
/// <para>
/// This is the <b>one</b> auth DTO that carries a <see cref="UserId"/>, and deliberately so: unlike
/// <see cref="UpdateProfileRequest"/> and <see cref="ChangePasswordRequest"/> — which act on the
/// caller and take their subject from the JWT — this is an administrator acting on <i>another</i>
/// account, so the target cannot come from the token. What makes that safe is the
/// <c>[Authorize(Roles = "Admin")]</c> on the endpoint, not the shape of this type.
/// </para>
/// <para>
/// 🔐 There is no password field, and there must never be one. The new password is derived
/// server-side from <c>SysConfig['appConfig'].defaultPassword</c>; a property here would let a caller
/// set an arbitrary password for someone else's account and would put plaintext on the wire. The
/// reply is a bare 204 — nothing hashed travels in either direction.
/// </para>
/// </remarks>
public class ResetPasswordRequest
{
    /// <summary>The AppUser to reset. `nvarchar(200)` in the schema; an email in practice.</summary>
    [Required]
    [MaxLength(200)]
    public string UserId { get; set; } = string.Empty;
}
