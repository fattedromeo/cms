using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>Write DTO for creating/updating a FeaturedPromoItem.</summary>
/// <remarks>
/// Every column is NOT NULL in the schema, so every field here is required. Lengths mirror
/// dbo.FeaturedPromoItem exactly (Topic nvarchar(100), Description nvarchar(300)) — without
/// StringLength an over-long value fails at the driver rather than as a 400.
/// </remarks>
public class FeaturedPromoItemRequest
{
    /// <summary>The IDENTITY key. Ignored on create (INSERT excludes it); required on update.</summary>
    public int Pkid { get; set; }

    /// <summary>SQL `date` → needs DateOnlyTypeHandler (registered in Program.cs).</summary>
    [Required]
    public DateOnly ScheduleOn { get; set; }

    [Range(1, short.MaxValue, ErrorMessage = "TrainingCenterPkid is required.")]
    public short TrainingCenterPkid { get; set; }

    /// <summary>
    /// 1..3. The grid only ever renders three slots per day, and the dev DB holds no other value
    /// across all 31,715 rows. The schema's tinyint would happily accept 0 or 200.
    /// </summary>
    [Range(FeaturedPromoItemSlots.Min, FeaturedPromoItemSlots.Max)]
    public byte Slot { get; set; }

    /// <summary>
    /// Set by the PromoCode lookup. FK to Promotion2 is NO_ACTION, so a bad value raises
    /// SqlException 547 → 409 in the controller rather than being silently accepted.
    /// </summary>
    [Range(1, int.MaxValue, ErrorMessage = "PromotionPkid is required.")]
    public int PromotionPkid { get; set; }

    /// <summary>Per-item free text — deliberately not seeded from Promotion2.Topic.</summary>
    [Required(AllowEmptyStrings = false)]
    [StringLength(100)]
    public string Topic { get; set; } = string.Empty;

    /// <summary>Per-item free text — deliberately not seeded from Promotion2.Description.</summary>
    [Required(AllowEmptyStrings = false)]
    [StringLength(300)]
    public string Description { get; set; } = string.Empty;
}

/// <summary>The slot range the week grid supports. Shared by the request DTO and the move logic.</summary>
public static class FeaturedPromoItemSlots
{
    public const byte Min = 1;
    public const byte Max = 3;
}
