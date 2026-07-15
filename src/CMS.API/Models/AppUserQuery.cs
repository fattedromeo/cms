namespace CMS.API.Models;

/// <summary>Search DTO for filtering AppUser (POST /api/app-users/query).</summary>
public class AppUserQuery
{
    /// <summary>LIKE match on UserId, UserName.</summary>
    public string? Keyword { get; set; }

    /// <summary>Tri-state: null = no filter, true/false = exact match.</summary>
    public bool? IsActive { get; set; }

    /// <summary>N-N filter: users holding this role (EXISTS against AppUserRole).</summary>
    public string? RoleId { get; set; }
}
