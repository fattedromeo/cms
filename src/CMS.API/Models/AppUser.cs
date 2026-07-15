namespace CMS.API.Models;

/// <summary>
/// Response model for the AppUser entity (dbo.AppUser).
/// The logical primary key is <see cref="UserId"/> (the clustered PK / FK target), while
/// <see cref="Pkid"/> is the surrogate identity column shown as 主代碼. Same shape as
/// <see cref="AppRole"/>.
/// </summary>
/// <remarks>
/// <b>There is deliberately no PasswordHash property.</b> That is the enforcement mechanism, not an
/// omission: the column is never selected, so it cannot leak to a client. It is set server-side on
/// create and never read back. See <see cref="Data.PasswordHasher"/>.
/// </remarks>
public class AppUser
{
    public int Pkid { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public bool IsActive { get; set; }

    /// <summary>
    /// NULL means the account is still on the default password (never changed).
    /// SQL <c>datetime</c> → the frontend must append 'Z' before parsing (Kind = Unspecified).
    /// </summary>
    public DateTime? PasswordUpdatedTime { get; set; }

    /// <summary>Count of AppUserRole rows referencing this user (角色數).</summary>
    public int RoleCount { get; set; }

    /// <summary>RoleIds of the associated roles (populated on GET by id via AppUserRole).</summary>
    public List<string> RoleIds { get; set; } = [];
}
