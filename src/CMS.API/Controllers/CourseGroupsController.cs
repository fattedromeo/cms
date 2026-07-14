using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/course-groups")]
[Produces("application/json")]
public class CourseGroupsController : ControllerBase
{
    private readonly ICourseGroupRepository _repository;

    public CourseGroupsController(ICourseGroupRepository repository) => _repository = repository;

    /// <summary>List all course groups (default sort pkid ASC).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<CourseGroup>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<CourseGroup>>> GetAll(CancellationToken ct)
        => Ok(await _repository.GetAllAsync(ct));

    /// <summary>Filtered search.</summary>
    [HttpPost("query")]
    [ProducesResponseType(typeof(IEnumerable<CourseGroup>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<CourseGroup>>> Query([FromBody] CourseGroupQuery query, CancellationToken ct)
        => Ok(await _repository.QueryAsync(query ?? new CourseGroupQuery(), ct));

    /// <summary>Get a single course group by its smallint pkid.</summary>
    [HttpGet("{id}")]
    [ProducesResponseType(typeof(CourseGroup), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CourseGroup>> GetById(short id, CancellationToken ct)
    {
        var group = await _repository.GetByIdAsync(id, ct);
        return group is null ? NotFound() : Ok(group);
    }

    /// <summary>Create a course group. pkid is auto-generated (smallint IDENTITY).</summary>
    [HttpPost]
    [ProducesResponseType(typeof(CourseGroup), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<CourseGroup>> Create([FromBody] CourseGroupRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        var created = await _repository.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = created.Pkid }, created);
    }

    /// <summary>Update a course group (pkid taken from body; it is the immutable key).</summary>
    [HttpPut]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update([FromBody] CourseGroupRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        var updated = await _repository.UpdateAsync(request, ct);
        return updated ? NoContent() : NotFound();
    }

    /// <summary>
    /// Delete a course group by pkid. 409 if a PartnerCourseGroup row still references it.
    /// Note: courses in the group are cascade-deleted by FK_Course_CourseGroup.
    /// </summary>
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
            return Conflict(new { message = "此課程群組仍被廠商課程群組使用，無法刪除。" });
        }
    }
}
