using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>
/// Write DTO for creating/updating a CourseGroup. <see cref="Pkid"/> is a smallint IDENTITY:
/// ignored on create (SQL Server assigns it) and used as the immutable key on update.
/// </summary>
public class CourseGroupRequest
{
    public short Pkid { get; set; }

    [Required]
    [MaxLength(100)]
    public string Description { get; set; } = string.Empty;
}
