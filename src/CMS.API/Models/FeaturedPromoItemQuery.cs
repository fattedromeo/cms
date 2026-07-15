namespace CMS.API.Models;

/// <summary>Search DTO for FeaturedPromoItem.</summary>
/// <remarks>
/// The week grid sends <see cref="TrainingCenterPkid"/> (the active tab) plus
/// <see cref="ScheduleOnFrom"/>/<see cref="ScheduleOnTo"/> (the Monday..Sunday bounds it computed).
/// The backend has no notion of "a week" — it applies a plain inclusive range, so the caller owns
/// the week arithmetic. That keeps this filter reusable for any span.
/// <para>
/// The table holds 31,715 rows, so an unfiltered GET is not something the UI should ever issue.
/// </para>
/// </remarks>
public class FeaturedPromoItemQuery
{
    /// <summary>Active tab. Null = every training center.</summary>
    public short? TrainingCenterPkid { get; set; }

    /// <summary>Inclusive lower bound on ScheduleOn (the grid's Monday).</summary>
    public DateOnly? ScheduleOnFrom { get; set; }

    /// <summary>Inclusive upper bound on ScheduleOn (the grid's Sunday).</summary>
    public DateOnly? ScheduleOnTo { get; set; }

    /// <summary>Matches Topic, Description or the joined Promotion2.PromoCode.</summary>
    public string? Keyword { get; set; }

    /// <summary>Exact promo filter (e.g. "where else is this promo scheduled?").</summary>
    public int? PromotionPkid { get; set; }
}
