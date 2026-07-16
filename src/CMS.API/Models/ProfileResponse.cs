namespace CMS.API.Models;

/// <summary>The signed-in user's profile, returned by <c>PUT /api/auth/profile</c>.</summary>
/// <remarks>
/// <para>
/// <see cref="UserName"/> is the value as <b>stored</b> (trimmed), not as posted — the client must
/// adopt this rather than echo its own input back into session storage, or the two drift apart the
/// moment a name arrives with stray whitespace.
/// </para>
/// <para>
/// No roles here: they are claims in the token the client already holds, and a second copy could
/// disagree with the one the API actually enforces. No PasswordHash, for the usual reason — there is
/// no property to leak through.
/// </para>
/// </remarks>
public class ProfileResponse
{
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
}
