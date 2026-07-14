using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>Write DTO for creating/updating an AppRole. N-N users carried as UserIds.</summary>
public class AppRoleRequest
{
    public int Pkid { get; set; }

    [Required]
    [MaxLength(200)]
    public string RoleId { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string RoleName { get; set; } = string.Empty;

    public int PermissionLevel { get; set; } = 100;

    [MaxLength(400)]
    public string? Description { get; set; }

    public List<string> UserIds { get; set; } = [];
}
