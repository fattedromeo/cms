namespace CMS.API.Models;

/// <summary>
/// Response model for a FeaturedPromoItem (mirrors dbo.FeaturedPromoItem + the resolved
/// Promotion2 nav object that carries PromoCode).
/// </summary>
/// <remarks>
/// <para>
/// One row is one promo pinned to a (ScheduleOn, TrainingCenter, Slot) cell of the week grid.
/// <c>IX_FeaturedPromoItem_UniqueDateLocSlot</c> makes that triple unique, which is what forces
/// the CASE-swap in <see cref="Repositories.IFeaturedPromoItemRepository.MoveAsync"/>.
/// </para>
/// <para>
/// <b>Topic/Description are NOT a copy of the parent promo's.</b> They are per-item free text:
/// in the dev DB only 1,845 of 31,715 rows (~6%) have a Topic equal to their Promotion2.Topic, and
/// the rate is uniformly low in every year from 2019 to 2026. So the PromoCode lookup sets
/// <see cref="PromotionPkid"/> only — it must not overwrite these two.
/// </para>
/// </remarks>
public class FeaturedPromoItem
{
    public int Pkid { get; set; }

    public DateOnly ScheduleOn { get; set; }

    // DB columns are TrainingCenter_pkid / Promotion_pkid — aliased in SELECT.
    public short TrainingCenterPkid { get; set; }

    /// <summary>1, 2 or 3. tinyint in the schema; the dev DB holds no other value.</summary>
    public byte Slot { get; set; }

    public int PromotionPkid { get; set; }

    public string Topic { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;

    /// <summary>
    /// Resolved via INNER JOIN — never null in practice (Promotion_pkid is NOT NULL and
    /// FK-enforced). Supplies the PromoCode shown in the grid's first column.
    /// </summary>
    public FeaturedPromoPromotionRef? Promotion { get; set; }
}

/// <summary>Slim Promotion2 projection for the PromoCode column and the Edit-form lookup.</summary>
public sealed class FeaturedPromoPromotionRef
{
    public int Pkid { get; set; }
    public string PromoCode { get; set; } = string.Empty;
}
