using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/featured-promo-items")]
[Produces("application/json")]
public class FeaturedPromoItemsController : ControllerBase
{
    private const int SqlDuplicateKey = 2627;   // unique index violation
    private const int SqlFkViolation = 547;     // FK constraint violation

    private readonly IFeaturedPromoItemRepository _repository;

    public FeaturedPromoItemsController(IFeaturedPromoItemRepository repository)
        => _repository = repository;

    /// <summary>List every item. 31,715 rows in the dev DB — prefer /query with a week bound.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<FeaturedPromoItem>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<FeaturedPromoItem>>> GetAll(CancellationToken ct)
        => Ok(await _repository.GetAllAsync(ct));

    /// <summary>
    /// Filtered search. The week grid posts the active TrainingCenter tab plus the Monday/Sunday
    /// ScheduleOn bounds it computed; both bounds are inclusive.
    /// </summary>
    [HttpPost("query")]
    [ProducesResponseType(typeof(IEnumerable<FeaturedPromoItem>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<FeaturedPromoItem>>> Query(
        [FromBody] FeaturedPromoItemQuery query, CancellationToken ct)
        => Ok(await _repository.QueryAsync(query ?? new FeaturedPromoItemQuery(), ct));

    /// <summary>Get a single item by its int pkid.</summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(FeaturedPromoItem), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<FeaturedPromoItem>> GetById(int id, CancellationToken ct)
    {
        var item = await _repository.GetByIdAsync(id, ct);
        return item is null ? NotFound() : Ok(item);
    }

    /// <summary>
    /// Create an item. 409 if the (ScheduleOn, TrainingCenter, Slot) cell is already filled or the
    /// PromoCode does not resolve to a real Promotion2 row.
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(FeaturedPromoItem), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<FeaturedPromoItem>> Create(
        [FromBody] FeaturedPromoItemRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        try
        {
            var created = await _repository.CreateAsync(request, ct);
            return CreatedAtAction(nameof(GetById), new { id = created.Pkid }, created);
        }
        catch (SqlException ex) when (ex.Number == SqlDuplicateKey)
        {
            return Conflict(new { message = "此日期／訓練中心的此欄位已有資料，無法新增。" });
        }
        catch (SqlException ex) when (ex.Number == SqlFkViolation)
        {
            return Conflict(new { message = "找不到對應的活動代碼（PromoCode），無法新增。" });
        }
    }

    /// <summary>
    /// Update an item (pkid taken from body). Slot is not updatable here — use /move, which is the
    /// only path that handles the unique-index swap.
    /// </summary>
    [HttpPut]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update([FromBody] FeaturedPromoItemRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        try
        {
            var updated = await _repository.UpdateAsync(request, ct);
            return updated ? NoContent() : NotFound();
        }
        catch (SqlException ex) when (ex.Number == SqlDuplicateKey)
        {
            return Conflict(new { message = "此日期／訓練中心的此欄位已有資料，無法修改。" });
        }
        catch (SqlException ex) when (ex.Number == SqlFkViolation)
        {
            return Conflict(new { message = "找不到對應的活動代碼（PromoCode），無法修改。" });
        }
    }

    /// <summary>
    /// Delete an item by pkid. Nothing FK-references FeaturedPromoItem, so this never raises 547
    /// and never cascades — the confirm text needs no warning.
    /// </summary>
    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var deleted = await _repository.DeleteAsync(id, ct);
        return deleted ? NoContent() : NotFound();
    }

    /// <summary>
    /// Move an item one slot up (「--」) or down (「+」) within its day, swapping with the target
    /// slot's occupant when there is one. 400 when already at the first/last slot.
    /// </summary>
    [HttpPost("move")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Move([FromBody] FeaturedPromoItemMoveRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        var result = await _repository.MoveAsync(request.Pkid, request.Direction, ct);
        return result switch
        {
            FeaturedPromoItemMoveResult.Moved => NoContent(),
            FeaturedPromoItemMoveResult.NotFound => NotFound(),
            _ => BadRequest(new { message = "已經在第一個或最後一個位置，無法再移動。" })
        };
    }
}
