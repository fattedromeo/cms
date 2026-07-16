using Microsoft.IdentityModel.Tokens;

namespace CMS.API.Services;

/// <summary>
/// Single owner of the JWT signing key from <c>SysConfig['appConfig'].symmetricSecurityKey</c>,
/// used to <b>both</b> issue (<see cref="JwtTokenService"/>) and validate (JWT bearer auth) tokens.
/// </summary>
/// <remarks>
/// <para>
/// One component owns the key so "issued with the same key we validate against" is structural rather
/// than two code paths that happen to agree. If they ever diverged, every freshly issued token would
/// be rejected by the very API that minted it.
/// </para>
/// <para>
/// The value is <b>cached</b> (see <see cref="SigningKeyProvider.CacheTtl"/>) because validation runs
/// on every authenticated request and an uncached read would mean a DB round-trip per request. The
/// TTL — rather than caching forever — is what keeps the promise that rotating the SysConfig row
/// takes effect without a redeploy.
/// </para>
/// <para>
/// 🔐 The returned key IS the secret. Never log it or put it in an exception message.
/// </para>
/// </remarks>
public interface ISigningKeyProvider
{
    /// <summary>Preferred: returns the cached key, refreshing from the DB when stale.</summary>
    /// <exception cref="InvalidOperationException">Missing, or too short to sign with HS256.</exception>
    Task<SymmetricSecurityKey> GetAsync(CancellationToken ct = default);

    /// <summary>
    /// Synchronous accessor for <c>TokenValidationParameters.IssuerSigningKeyResolver</c>, which
    /// exposes no async hook. Normally a cache read: `Program.cs` warms the cache from the async
    /// `OnMessageReceived` event first, so this should not block in practice.
    /// </summary>
    SymmetricSecurityKey Get();
}
