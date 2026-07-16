namespace CMS.API.Repositories;

/// <summary>
/// Server-side access to <c>dbo.SysConfig</c>. Deliberately narrow.
/// </summary>
/// <remarks>
/// <b>There is no SysConfig controller, DTO or lookup endpoint, and there must not be one.</b>
/// The <c>appConfig</c> row's JSON holds <c>symmetricSecurityKey</c> (a JWT signing secret) next to
/// <c>defaultPassword</c>, so exposing <c>configValue</c> — or logging it, or putting it in an
/// exception message — would leak the signing key. Every method here returns a single scalar the
/// caller needs, never the raw JSON.
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

    /// <summary>
    /// Reads <c>SysConfig['appConfig'].symmetricSecurityKey</c> — the JWT signing secret. Returns
    /// only that property.
    /// </summary>
    /// <remarks>
    /// 🔐 The return value IS the signing key. Callers must not log it, echo it in an exception
    /// message, or return it from an endpoint; the only legitimate use is constructing
    /// <c>SigningCredentials</c> (see <see cref="Services.JwtTokenService"/>). It is read at
    /// runtime on each call rather than cached in configuration, so rotating the row takes effect
    /// without a redeploy.
    /// </remarks>
    /// <exception cref="InvalidOperationException">
    /// The row, the property, or a non-empty value is missing. Fails loudly on purpose: a fallback
    /// would sign tokens with a guessable key, which is a forgery hole rather than an outage.
    /// </exception>
    Task<string> GetSymmetricSecurityKeyAsync(CancellationToken ct = default);
}
