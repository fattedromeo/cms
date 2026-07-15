namespace CMS.API.Models;

/// <summary>Search DTO for POST /api/courses/query.</summary>
public class CourseQuery
{
    /// <summary>
    /// LIKE match on Title, OfficialTitle, CourseId, ProdCourseId, FriendlyUrl. Deliberately
    /// excludes the long content columns (Objective/Prerequisites/Note/OtherInfo nvarchar(4000),
    /// Outline/TowardCertOrExam nvarchar(max), Material/Target nvarchar(500)) — slow to scan and
    /// rarely useful as a keyword target.
    /// </summary>
    public string? Keyword { get; set; }

    public short? PartnerPkid { get; set; }
    public short? CourseGroupPkid { get; set; }
    public byte? PublishStatusPkid { get; set; }

    /// <summary>Inclusive lower bound on ScheduleOn.</summary>
    public DateOnly? ScheduleOnFrom { get; set; }

    /// <summary>Inclusive upper bound on ScheduleOn.</summary>
    public DateOnly? ScheduleOnTo { get; set; }

    /// <summary>Inclusive lower bound on ScheduleOff.</summary>
    public DateOnly? ScheduleOffFrom { get; set; }

    /// <summary>Inclusive upper bound on ScheduleOff.</summary>
    public DateOnly? ScheduleOffTo { get; set; }

    /// <summary>Tri-state: null = no filter, true/false = exact match.</summary>
    public bool? CanRepeat { get; set; }
}
