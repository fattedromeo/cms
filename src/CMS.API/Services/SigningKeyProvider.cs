using System.Text;
using CMS.API.Repositories;
using Microsoft.IdentityModel.Tokens;

namespace CMS.API.Services;

/// <inheritdoc cref="ISigningKeyProvider"/>
public sealed class SigningKeyProvider : ISigningKeyProvider, IDisposable
{
    /// <summary>
    /// How long a loaded key is reused before it is re-read from SysConfig. Long enough that
    /// validation is not a per-request DB hit; short enough that rotating the row takes effect
    /// without a redeploy.
    /// </summary>
    public static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    /// <summary>HS256 requires a key of at least 256 bits.</summary>
    internal const int MinimumKeyBytes = 32;

    private readonly IServiceScopeFactory _scopes;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private volatile CacheEntry? _cache;

    public SigningKeyProvider(IServiceScopeFactory scopes) => _scopes = scopes;

    private sealed record CacheEntry(SymmetricSecurityKey Key, DateTimeOffset LoadedAt);

    private static bool IsFresh(CacheEntry? e) => e is not null && DateTimeOffset.UtcNow - e.LoadedAt < CacheTtl;

    public async Task<SymmetricSecurityKey> GetAsync(CancellationToken ct = default)
    {
        var cached = _cache;
        if (IsFresh(cached)) return cached!.Key;

        await _gate.WaitAsync(ct);
        try
        {
            // Re-check: a concurrent caller may have refreshed while we waited, so a burst of
            // requests on a cold cache costs one DB read, not one each.
            cached = _cache;
            if (IsFresh(cached)) return cached!.Key;

            var key = await LoadAsync(ct);
            _cache = new CacheEntry(key, DateTimeOffset.UtcNow);
            return key;
        }
        finally
        {
            _gate.Release();
        }
    }

    public SymmetricSecurityKey Get()
    {
        var cached = _cache;
        if (IsFresh(cached)) return cached!.Key;

        // Cold or stale on a synchronous path. `Program.cs` warms the cache from JwtBearer's async
        // OnMessageReceived event precisely so this is not reached on a normal request; it remains
        // as a correctness fallback (e.g. the cache expiring between warm and resolve). Task.Run
        // keeps the blocking wait off the caller's context.
        return Task.Run(() => GetAsync()).GetAwaiter().GetResult();
    }

    private async Task<SymmetricSecurityKey> LoadAsync(CancellationToken ct)
    {
        // ISysConfigRepository is scoped; this provider is a singleton (JwtBearerOptions are), so it
        // must open its own scope rather than capture one.
        using var scope = _scopes.CreateScope();
        var sysConfig = scope.ServiceProvider.GetRequiredService<ISysConfigRepository>();

        var secret = await sysConfig.GetSymmetricSecurityKeyAsync(ct);
        var keyBytes = Encoding.UTF8.GetBytes(secret);

        // The configured key is exactly 32 bytes — the HS256 floor, zero headroom (verified against
        // the dev DB). Shortening the SysConfig row by one character would break every login AND
        // every validated request, so fail with a message that names the cause rather than the
        // library's cryptic IDX10653. The message must never include the key itself.
        if (keyBytes.Length < MinimumKeyBytes)
            throw new InvalidOperationException(
                $"SysConfig['appConfig'].symmetricSecurityKey is too short to sign with HS256: " +
                $"{keyBytes.Length} bytes, need at least {MinimumKeyBytes}.");

        return new SymmetricSecurityKey(keyBytes);
    }

    public void Dispose() => _gate.Dispose();
}
