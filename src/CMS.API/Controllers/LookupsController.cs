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
}
