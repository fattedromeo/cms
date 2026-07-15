using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>Body for the slot-reorder endpoint — the grid's 「+」 and 「--」 buttons.</summary>
public class FeaturedPromoItemMoveRequest
{
    [Range(1, int.MaxValue, ErrorMessage = "Pkid is required.")]
    public int Pkid { get; set; }

    /// <summary>
    /// <c>"down"</c> = the 「+」 button (Slot 1 → 2); <c>"up"</c> = the 「--」 button (Slot 2 → 1).
    /// </summary>
    /// <remarks>
    /// A string rather than an enum on purpose: the API has no JsonStringEnumConverter registered,
    /// so an enum would serialize as an opaque 0/1 over the wire.
    /// </remarks>
    [Required]
    [RegularExpression("^(up|down)$", ErrorMessage = "Direction must be 'up' or 'down'.")]
    public string Direction { get; set; } = string.Empty;
}

/// <summary>Outcome of <see cref="Repositories.IFeaturedPromoItemRepository.MoveAsync"/>.</summary>
public enum FeaturedPromoItemMoveResult
{
    /// <summary>Slot changed — either into a free slot or by swapping with its neighbour.</summary>
    Moved,

    /// <summary>No row with that pkid.</summary>
    NotFound,

    /// <summary>Already at Slot 1 and moving up, or Slot 3 and moving down.</summary>
    OutOfRange
}
