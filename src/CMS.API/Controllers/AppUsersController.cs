using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/app-users")]
[Produces("application/json")]
public class AppUsersController : ControllerBase
{
    private readonly IAppUserRepository _repository;

    public AppUsersController(IAppUserRepository repository) => _repository = repository;

    /// <summary>List all users (default sort UserId ASC). Never includes PasswordHash.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<AppUser>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<AppUser>>> GetAll(CancellationToken ct)
        => Ok(await _repository.GetAllAsync(ct));

    /// <summary>Filtered search.</summary>
    [HttpPost("query")]
    [ProducesResponseType(typeof(IEnumerable<AppUser>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<AppUser>>> Query([FromBody] AppUserQuery query, CancellationToken ct)
        => Ok(await _repository.QueryAsync(query ?? new AppUserQuery(), ct));

    /// <summary>Get a single user (with associated RoleIds) by its string UserId.</summary>
    [HttpGet("{id}")]
    [ProducesResponseType(typeof(AppUser), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AppUser>> GetById(string id, CancellationToken ct)
    {
        var user = await _repository.GetByIdAsync(id, ct);
        return user is null ? NotFound() : Ok(user);
    }

    /// <summary>
    /// Create a user. 409 if UserId already exists. The password is not part of the request:
    /// PasswordHash is derived server-side from the configured default password.
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(AppUser), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AppUser>> Create([FromBody] AppUserRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        if (await _repository.ExistsAsync(request.UserId, ct))
            return Conflict(new { message = $"使用者代碼「{request.UserId}」已存在。" });

        var created = await _repository.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = created.UserId }, created);
    }

    /// <summary>
    /// Update a user (UserId taken from body; it is the immutable key).
    /// Never modifies the password — that requires a dedicated reset endpoint.
    /// </summary>
    [HttpPut]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update([FromBody] AppUserRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        var updated = await _repository.UpdateAsync(request, ct);
        return updated ? NoContent() : NotFound();
    }

    /// <summary>Delete a user by UserId (also removes its AppUserRole rows).</summary>
    [HttpDelete("{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        var deleted = await _repository.DeleteAsync(id, ct);
        return deleted ? NoContent() : NotFound();
    }
}
