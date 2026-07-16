using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>Body of <c>PUT /api/auth/profile</c> — the signed-in user editing their own name.</summary>
/// <remarks>
/// <para>
/// <b>There is deliberately no UserId property, and no RoleIds property.</b> That is the enforcement,
/// not a runtime check someone could forget: the identity comes from the JWT's <c>sub</c> claim, so
/// with nothing to bind, a caller cannot retarget this at another account or grant themselves a role
/// by over-posting. Same pattern as <see cref="AppUserRequest"/> and <c>PasswordHash</c> — see
/// <c>spec/reference/backend.md</c>.
/// </para>
/// <para>
/// <see cref="UserName"/> carries no <c>[Required]</c>: it would accept <c>"   "</c>
/// (AllowEmptyStrings=false rejects <c>""</c> but not whitespace). The controller trims first and
/// then validates, which is the only way to reject a whitespace-only name.
/// </para>
/// </remarks>
public class UpdateProfileRequest
{
    /// <summary>Trimmed and validated server-side. `nvarchar(200)` in the schema.</summary>
    [MaxLength(200)]
    public string UserName { get; set; } = string.Empty;
}
