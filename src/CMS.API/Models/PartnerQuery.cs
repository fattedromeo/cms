namespace CMS.API.Models;

/// <summary>Search DTO for filtering Partner (POST /api/partners/query).</summary>
public class PartnerQuery
{
    /// <summary>LIKE match on Name, AppKey, NameOnPartnerMenu, NameOnCourseDetailPage.</summary>
    public string? Keyword { get; set; }
}
