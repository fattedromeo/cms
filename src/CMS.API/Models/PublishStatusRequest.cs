using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>
/// Write DTO for creating/updating a PublishStatus. <see cref="Pkid"/> is user-assigned
/// (tinyint, not identity): required on create, immutable on update.
/// </summary>
public class PublishStatusRequest
{
    public byte Pkid { get; set; }

    [Required]
    [MaxLength(50)]
    public string Description { get; set; } = string.Empty;

    public bool IsDraft { get; set; }
    public bool IsPublished { get; set; }
    public bool IsDiscontinued { get; set; }
}
