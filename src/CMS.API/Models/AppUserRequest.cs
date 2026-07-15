using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>Write DTO for creating/updating an AppUser. N-N roles carried as RoleIds.</summary>
/// <remarks>
/// <b>PasswordHash is deliberately absent, and must stay absent.</b> Because there is no property to
/// bind, a client cannot set the hash by over-posting — the rule is enforced by the type, not by a
/// runtime check that could be forgotten. On create the hash is derived server-side from
/// <c>SysConfig['appConfig'].defaultPassword</c>; on update it is not in the UPDATE column list at
/// all. <c>PasswordUpdatedTime</c> is likewise server-controlled.
/// </remarks>
public class AppUserRequest
{
    public int Pkid { get; set; }

    [Required]
    [MaxLength(200)]
    public string UserId { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string UserName { get; set; } = string.Empty;

    /// <summary>DB default is 1 (DF_AppUser_IsActive), so new users default to enabled.</summary>
    public bool IsActive { get; set; } = true;

    public List<string> RoleIds { get; set; } = [];
}
