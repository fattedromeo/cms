using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/partners")]
[Produces("application/json")]
public class PartnersController : ControllerBase
{
    private readonly IPartnerRepository _repository;

    public PartnersController(IPartnerRepository repository) => _repository = repository;

    /// <summary>List all partners (default sort DisplayOrder ASC).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<Partner>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<Partner>>> GetAll(CancellationToken ct)
        => Ok(await _repository.GetAllAsync(ct));

    /// <summary>Filtered search.</summary>
    [HttpPost("query")]
    [ProducesResponseType(typeof(IEnumerable<Partner>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<Partner>>> Query([FromBody] PartnerQuery query, CancellationToken ct)
        => Ok(await _repository.QueryAsync(query ?? new PartnerQuery(), ct));

    /// <summary>Get a single partner by its smallint pkid.</summary>
    [HttpGet("{id}")]
    [ProducesResponseType(typeof(Partner), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<Partner>> GetById(short id, CancellationToken ct)
    {
        var partner = await _repository.GetByIdAsync(id, ct);
        return partner is null ? NotFound() : Ok(partner);
    }

    /// <summary>Create a partner. pkid is auto-generated (smallint IDENTITY).</summary>
    [HttpPost]
    [ProducesResponseType(typeof(Partner), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<Partner>> Create([FromBody] PartnerRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        var created = await _repository.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = created.Pkid }, created);
    }

    /// <summary>Update a partner (pkid taken from body; it is the immutable key).</summary>
    [HttpPut]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update([FromBody] PartnerRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        var updated = await _repository.UpdateAsync(request, ct);
        return updated ? NoContent() : NotFound();
    }

    /// <summary>Delete a partner by pkid. 409 if it is still referenced by a course/certification.</summary>
    [HttpDelete("{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Delete(short id, CancellationToken ct)
    {
        try
        {
            var deleted = await _repository.DeleteAsync(id, ct);
            return deleted ? NoContent() : NotFound();
        }
        catch (SqlException ex) when (ex.Number == 547) // FK constraint violation
        {
            return Conflict(new { message = "此合作廠商仍被課程、認證或廠商課程群組使用，無法刪除。" });
        }
    }
}
