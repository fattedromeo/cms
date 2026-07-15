using CMS.API.Models;

namespace CMS.API.Repositories;

public interface ILookupRepository
{
    /// <summary>AppUser options for the AppRole users picker. Label = "UserName (UserId)".</summary>
    Task<IEnumerable<LookupItem>> GetAppUsersAsync(CancellationToken ct = default);

    /// <summary>
    /// AppRole options for the AppUser roles picker. Pkid carries RoleId (the FK target), not the
    /// surrogate pkid. Label = RoleName.
    /// </summary>
    Task<IEnumerable<LookupItem>> GetAppRolesAsync(CancellationToken ct = default);

    /// <summary>PublishStatus options for FK pickers (Course, Promotion2). Label = Description.</summary>
    Task<IEnumerable<LookupItem>> GetPublishStatusesAsync(CancellationToken ct = default);

    /// <summary>Partner options for FK pickers (Course, Certification, PartnerCourseGroup). Label = Name.</summary>
    Task<IEnumerable<LookupItem>> GetPartnersAsync(CancellationToken ct = default);

    /// <summary>CourseGroup options for FK pickers (Course, PartnerCourseGroup). Label = Description.</summary>
    Task<IEnumerable<LookupItem>> GetCourseGroupsAsync(CancellationToken ct = default);

    /// <summary>
    /// Certification options for the Course N-N picker. Label = "{Partner.Name} - {Title}".
    /// </summary>
    Task<IEnumerable<LookupItem>> GetCertificationsAsync(CancellationToken ct = default);

    /// <summary>JobCategory options for the Course N-N picker. Label = Description.</summary>
    Task<IEnumerable<LookupItem>> GetJobCategoriesAsync(CancellationToken ct = default);
}
