namespace CMS.API.Repositories;

/// <summary>
/// Server-side access to <c>dbo.SysConfig</c>. Deliberately narrow.
/// </summary>
/// <remarks>
/// <b>There is no SysConfig controller, DTO or lookup endpoint, and there must not be one.</b>
/// The <c>appConfig</c> row's JSON holds <c>symmetricSecurityKey</c> (a JWT signing secret) next to
/// <c>defaultPassword</c>, so exposing <c>configValue</c> — or logging it, or putting it in an
/// exception message — would leak the signing key. This interface returns only the single scalar
/// the caller needs.
/// </remarks>
public interface ISysConfigRepository
{
    /// <summary>
    /// Reads <c>SysConfig['appConfig'].defaultPassword</c>. Returns only that property.
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// The row, the property, or a non-empty value is missing. Fails loudly on purpose: a fallback
    /// would seed accounts with a known or guessable password hash.
    /// </exception>
    Task<string> GetDefaultPasswordAsync(CancellationToken ct = default);
}
