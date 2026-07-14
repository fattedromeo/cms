namespace CMS.API.Models;

/// <summary>
/// Response model for a course partner / vendor (dbo.Partner). <see cref="Pkid"/> is a
/// smallint IDENTITY primary key — auto-generated on insert, immutable thereafter.
/// </summary>
public class Partner
{
    public short Pkid { get; set; }
    public string Name { get; set; } = string.Empty;
    public string AppKey { get; set; } = string.Empty;
    public string NameOnPartnerMenu { get; set; } = string.Empty;
    public string NameOnCourseDetailPage { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
    public string? ImageFilename { get; set; }
}
