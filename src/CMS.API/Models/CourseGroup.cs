namespace CMS.API.Models;

/// <summary>
/// Response model for a course group / category (dbo.CourseGroup). <see cref="Pkid"/> is a
/// smallint IDENTITY primary key — auto-generated on insert, immutable thereafter.
/// </summary>
public class CourseGroup
{
    public short Pkid { get; set; }
    public string Description { get; set; } = string.Empty;
}
