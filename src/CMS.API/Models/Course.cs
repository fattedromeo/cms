namespace CMS.API.Models;

/// <summary>Response model for a Course (mirrors dbo.Course + resolved FK nav objects).</summary>
public class Course
{
    public int Pkid { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? OfficialTitle { get; set; }
    public string CourseId { get; set; } = string.Empty;
    public string ProdCourseId { get; set; } = string.Empty;
    public string FriendlyUrl { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }

    // DB columns are Partner_pkid / CourseGroup_pkid / PublishStatus_pkid — aliased in SELECT.
    public short PartnerPkid { get; set; }
    public short? CourseGroupPkid { get; set; }
    public byte PublishStatusPkid { get; set; }

    public DateOnly ScheduleOn { get; set; }
    public DateOnly ScheduleOff { get; set; }
    public short Hour { get; set; }
    public decimal ListPrice { get; set; }
    public decimal LearningCredit { get; set; }

    public string? Material { get; set; }
    public string? Objective { get; set; }
    public string? Target { get; set; }
    public string? Prerequisites { get; set; }
    public string? Outline { get; set; }
    public string? TowardCertOrExam { get; set; }
    public string? Note { get; set; }
    public string? OtherInfo { get; set; }
    public bool CanRepeat { get; set; }

    /// <summary>Resolved via INNER JOIN — never null in practice (Partner_pkid is NOT NULL).</summary>
    public CoursePartnerRef? Partner { get; set; }

    /// <summary>Resolved via LEFT JOIN — null when CourseGroup_pkid IS NULL (the FK is nullable).</summary>
    public CourseGroupRef? CourseGroup { get; set; }

    /// <summary>Resolved via INNER JOIN — never null in practice (PublishStatus_pkid is NOT NULL).</summary>
    public CoursePublishStatusRef? PublishStatus { get; set; }

    /// <summary>N-N via CourseInCertification. Populated by GetByIdAsync only, not by list/query.</summary>
    public List<int> CertificationPkids { get; set; } = [];

    /// <summary>N-N via CourseJobCategories. Populated by GetByIdAsync only, not by list/query.</summary>
    public List<short> JobCategoryPkids { get; set; } = [];
}

// The nav types carry a Course* prefix to avoid colliding with the top-level Partner /
// PublishStatus models in this same namespace. CourseGroupRef needs no prefix (no clash).

/// <summary>Slim Partner projection for the 原廠 column/link.</summary>
public sealed class CoursePartnerRef
{
    public short Pkid { get; set; }
    public string Name { get; set; } = string.Empty;
}

/// <summary>Slim CourseGroup projection for the 課程群組 column/link.</summary>
public sealed class CourseGroupRef
{
    public short Pkid { get; set; }
    public string Description { get; set; } = string.Empty;
}

/// <summary>Slim PublishStatus projection for the 上架狀態 column/link.</summary>
public sealed class CoursePublishStatusRef
{
    public byte Pkid { get; set; }
    public string Description { get; set; } = string.Empty;

    // The flyer's publish gate reads this bit rather than hardcoding status pkids: the dev DB
    // carries a 4th published status (pkid 200) beyond 草稿/上架中/已下架, and the status list
    // is admin-editable. Read-only projection — there is no write path for it.
    public bool IsPublished { get; set; }
}
