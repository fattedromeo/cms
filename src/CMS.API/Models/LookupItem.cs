namespace CMS.API.Models;

/// <summary>
/// Slim option item for FK / N-N pickers. <see cref="Pkid"/> is the string key
/// (e.g. AppUser.UserId) and <see cref="Label"/> is the display text.
/// </summary>
public class LookupItem
{
    public string Pkid { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
}
