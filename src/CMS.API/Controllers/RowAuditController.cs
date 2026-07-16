using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

/// <summary>
/// Read-only audit history for one record, consumed by the frontend's 異動紀錄 History badge on
/// every detail/form page.
/// </summary>
/// <remarks>
/// Deliberately authenticated-but-not-Admin (the FallbackPolicy applies): the badge sits on pages
/// like Course that every signed-in user can open, so gating this endpoint by role would break the
/// badge exactly where it is most used. The rows carry no secrets — UserName, action and changed
/// column names only (never values; see <see cref="Services.RowAuditWriter"/>).
/// </remarks>
[ApiController]
[Route("api/rowaudit")]
[Produces("application/json")]
public class RowAuditController : ControllerBase
{
    private readonly IRowAuditRepository _repository;

    public RowAuditController(IRowAuditRepository repository) => _repository = repository;

    /// <summary>GET /api/rowaudit?tableName=Course&amp;pkid=123 — one record's history, newest first.</summary>
    /// <remarks>pkid is a string on purpose: RowAudit.PrimaryKeyValues is nvarchar.</remarks>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<RowAuditEntry>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<IEnumerable<RowAuditEntry>>> GetForRecord(
        [FromQuery] string? tableName, [FromQuery] string? pkid, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(tableName) || string.IsNullOrWhiteSpace(pkid))
            return BadRequest(new { message = "tableName 與 pkid 為必填參數。" });

        return Ok(await _repository.GetForRecordAsync(tableName.Trim(), pkid.Trim(), ct));
    }
}
