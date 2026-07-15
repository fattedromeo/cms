using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>Write DTO for create/update. `pkid` is int IDENTITY: 0 on create, the key on update.</summary>
/// <remarks>
/// MaxLength values mirror dbo.Course exactly. Outline and TowardCertOrExam are nvarchar(max), so
/// they carry no MaxLength. PartnerPkid / PublishStatusPkid are NOT NULL FKs but are value types,
/// so [Required] would be a no-op (a missing JSON field binds to 0, not null); a bad value is
/// caught by the FK constraint and surfaces as 547 -> 409, as elsewhere in this codebase.
/// </remarks>
public class CourseRequest
{
    public int Pkid { get; set; }

    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(300)]
    public string? OfficialTitle { get; set; }

    [Required]
    [MaxLength(50)]
    public string CourseId { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string ProdCourseId { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string FriendlyUrl { get; set; } = string.Empty;

    public int DisplayOrder { get; set; }

    public short PartnerPkid { get; set; }

    /// <summary>Nullable FK — null means「無」(no group).</summary>
    public short? CourseGroupPkid { get; set; }

    public byte PublishStatusPkid { get; set; }

    public DateOnly ScheduleOn { get; set; }
    public DateOnly ScheduleOff { get; set; }

    public short Hour { get; set; }

    /// <summary>decimal(9,0) — whole NT dollars.</summary>
    public decimal ListPrice { get; set; }

    /// <summary>decimal(9,1) — one decimal place.</summary>
    public decimal LearningCredit { get; set; }

    [MaxLength(500)]
    public string? Material { get; set; }

    [MaxLength(4000)]
    public string? Objective { get; set; }

    [MaxLength(500)]
    public string? Target { get; set; }

    [MaxLength(4000)]
    public string? Prerequisites { get; set; }

    /// <summary>nvarchar(max) — unbounded.</summary>
    public string? Outline { get; set; }

    /// <summary>nvarchar(max) — unbounded.</summary>
    public string? TowardCertOrExam { get; set; }

    [MaxLength(4000)]
    public string? Note { get; set; }

    [MaxLength(4000)]
    public string? OtherInfo { get; set; }

    public bool CanRepeat { get; set; }

    /// <summary>N-N: replaces the CourseInCertification rows for this course.</summary>
    public List<int> CertificationPkids { get; set; } = [];

    /// <summary>N-N: replaces the CourseJobCategories rows for this course.</summary>
    public List<short> JobCategoryPkids { get; set; } = [];
}
