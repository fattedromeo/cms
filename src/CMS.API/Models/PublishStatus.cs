namespace CMS.API.Models;

/// <summary>
/// Response model for the PublishStatus lookup/enumeration table (dbo.PublishStatus).
/// <see cref="Pkid"/> is a manually-assigned tinyint primary key (NOT identity) — it is
/// user-supplied on create and immutable on update.
/// </summary>
public class PublishStatus
{
    public byte Pkid { get; set; }
    public string Description { get; set; } = string.Empty;
    public bool IsDraft { get; set; }
    public bool IsPublished { get; set; }
    public bool IsDiscontinued { get; set; }
}
