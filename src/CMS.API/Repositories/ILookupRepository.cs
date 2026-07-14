using CMS.API.Models;

namespace CMS.API.Repositories;

public interface ILookupRepository
{
    /// <summary>AppUser options for the AppRole users picker. Label = "UserName (UserId)".</summary>
    Task<IEnumerable<LookupItem>> GetAppUsersAsync(CancellationToken ct = default);

    /// <summary>PublishStatus options for FK pickers (Course, Promotion2). Label = Description.</summary>
    Task<IEnumerable<LookupItem>> GetPublishStatusesAsync(CancellationToken ct = default);

    /// <summary>Partner options for FK pickers (Course, Certification, PartnerCourseGroup). Label = Name.</summary>
    Task<IEnumerable<LookupItem>> GetPartnersAsync(CancellationToken ct = default);
}
