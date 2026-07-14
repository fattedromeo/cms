namespace CMS.API.Models;

/// <summary>
/// Response model for the AppRole entity (dbo.AppRole).
/// The logical primary key is <see cref="RoleId"/> (the clustered PK / FK target),
/// while <see cref="Pkid"/> is the surrogate identity column shown as 主代碼.
/// </summary>
public class AppRole
{
    public int Pkid { get; set; }
    public string RoleId { get; set; } = string.Empty;
    public string RoleName { get; set; } = string.Empty;
    public int PermissionLevel { get; set; }
    public string? Description { get; set; }

    /// <summary>Count of AppUserRole rows referencing this role (使用者數).</summary>
    public int UserCount { get; set; }

    /// <summary>UserIds of the associated users (populated on GET by id via AppUserRole).</summary>
    public List<string> UserIds { get; set; } = [];
}
