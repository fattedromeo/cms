using CMS.API.Models;

namespace CMS.API.Repositories;

public interface IFeaturedPromoItemRepository
{
    /// <summary>
    /// Every row, ScheduleOn/TrainingCenter/Slot ASC. 31,715 rows in the dev DB — present for
    /// convention; the grid uses <see cref="QueryAsync"/> with a week bound instead.
    /// </summary>
    Task<IEnumerable<FeaturedPromoItem>> GetAllAsync(CancellationToken ct = default);

    /// <summary>Filtered search — the week grid's only read (tab + Monday..Sunday bounds).</summary>
    Task<IEnumerable<FeaturedPromoItem>> QueryAsync(FeaturedPromoItemQuery query, CancellationToken ct = default);

    Task<FeaturedPromoItem?> GetByIdAsync(int pkid, CancellationToken ct = default);

    Task<FeaturedPromoItem> CreateAsync(FeaturedPromoItemRequest request, CancellationToken ct = default);

    Task<bool> UpdateAsync(FeaturedPromoItemRequest request, CancellationToken ct = default);

    Task<bool> DeleteAsync(int pkid, CancellationToken ct = default);

    /// <summary>
    /// Move a row one slot up or down within its own (ScheduleOn, TrainingCenter) day, swapping
    /// with the occupant of the target slot when there is one.
    /// </summary>
    /// <param name="direction">"up" (Slot 2 → 1) or "down" (Slot 1 → 2).</param>
    Task<FeaturedPromoItemMoveResult> MoveAsync(int pkid, string direction, CancellationToken ct = default);
}
