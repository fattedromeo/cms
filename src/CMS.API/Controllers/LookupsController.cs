using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/lookups")]
[Produces("application/json")]
public class LookupsController : ControllerBase
{
    private readonly ILookupRepository _repository;

    public LookupsController(ILookupRepository repository) => _repository = repository;

    /// <summary>AppUser options for pickers (label = "UserName (UserId)").</summary>
    [HttpGet("app-users")]
    [ProducesResponseType(typeof(IEnumerable<LookupItem>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<LookupItem>>> GetAppUsers(CancellationToken ct)
        => Ok(await _repository.GetAppUsersAsync(ct));

    /// <summary>AppRole options for the AppUser picker (pkid = RoleId, label = RoleName).</summary>
    [HttpGet("app-roles")]
    [ProducesResponseType(typeof(IEnumerable<LookupItem>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<LookupItem>>> GetAppRoles(CancellationToken ct)
        => Ok(await _repository.GetAppRolesAsync(ct));

    /// <summary>PublishStatus options for pickers (label = Description).</summary>
    [HttpGet("publish-statuses")]
    [ProducesResponseType(typeof(IEnumerable<LookupItem>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<LookupItem>>> GetPublishStatuses(CancellationToken ct)
        => Ok(await _repository.GetPublishStatusesAsync(ct));

    /// <summary>Partner options for pickers (label = Name).</summary>
    [HttpGet("partners")]
    [ProducesResponseType(typeof(IEnumerable<LookupItem>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<LookupItem>>> GetPartners(CancellationToken ct)
        => Ok(await _repository.GetPartnersAsync(ct));

    /// <summary>CourseGroup options for pickers (label = Description).</summary>
    [HttpGet("course-groups")]
    [ProducesResponseType(typeof(IEnumerable<LookupItem>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<LookupItem>>> GetCourseGroups(CancellationToken ct)
        => Ok(await _repository.GetCourseGroupsAsync(ct));

    /// <summary>Certification options for the Course picker (label = "Partner - Title").</summary>
    [HttpGet("certifications")]
    [ProducesResponseType(typeof(IEnumerable<LookupItem>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<LookupItem>>> GetCertifications(CancellationToken ct)
        => Ok(await _repository.GetCertificationsAsync(ct));

    /// <summary>JobCategory options for the Course picker (label = Description).</summary>
    [HttpGet("job-categories")]
    [ProducesResponseType(typeof(IEnumerable<LookupItem>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<LookupItem>>> GetJobCategories(CancellationToken ct)
        => Ok(await _repository.GetJobCategoriesAsync(ct));
}
