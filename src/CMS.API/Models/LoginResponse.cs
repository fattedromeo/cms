namespace CMS.API.Models;

/// <summary>The user profile returned by a successful login.</summary>
/// <remarks>
/// <b>There is deliberately no PasswordHash property</b> — the same type-system enforcement used by
/// <see cref="AppUser"/>: no property means nothing to bind, so the hash cannot leak no matter what
/// the caller does. <see cref="UserId"/> carries the <i>stored</i> value, which may differ in case
/// from what the client posted (the lookup is case-insensitive).
/// </remarks>
public class LoginResponse
{
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;

    /// <summary>The signed JWT. Valid for 24 hours from issue.</summary>
    public string AccessToken { get; set; } = string.Empty;
}
