using System.Text;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// Tests for <see cref="SigningKeyProvider"/> — the single owner of the JWT signing key.
/// </summary>
/// <remarks>
/// A real <see cref="ServiceCollection"/> backs the provider (it resolves the scoped
/// <see cref="ISysConfigRepository"/> through <see cref="IServiceScopeFactory"/>, which is the whole
/// point — a singleton cannot capture a scoped dependency), with only the repository mocked.
/// </remarks>
public class SigningKeyProviderTests
{
    private const string ValidKey = "unit-test-signing-key-0123456789abcdef";

    private readonly Mock<ISysConfigRepository> _sysConfig = new(MockBehavior.Strict);

    private SigningKeyProvider Build(string key)
    {
        _sysConfig.Setup(s => s.GetSymmetricSecurityKeyAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(key);
        var services = new ServiceCollection();
        services.AddScoped(_ => _sysConfig.Object);
        return new SigningKeyProvider(services.BuildServiceProvider().GetRequiredService<IServiceScopeFactory>());
    }

    private static string KeyText(SymmetricSecurityKey key) => Encoding.UTF8.GetString(key.Key);

    [Fact]
    public async Task GetAsync_ReturnsTheSysConfigKey()
    {
        Assert.Equal(ValidKey, KeyText(await Build(ValidKey).GetAsync()));
    }

    [Fact]
    public async Task GetAsync_CachesSoValidationIsNotADbHitPerRequest()
    {
        var provider = Build(ValidKey);

        for (var i = 0; i < 5; i++) await provider.GetAsync();

        // The whole reason the provider exists: token validation runs on every authenticated
        // request, so an uncached read would be a DB round-trip per request.
        _sysConfig.Verify(s => s.GetSymmetricSecurityKeyAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ConcurrentColdCalls_LoadOnce()
    {
        var provider = Build(ValidKey);

        // A burst on a cold cache (e.g. at startup) must collapse to one read, not one per caller.
        await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => provider.GetAsync()));

        _sysConfig.Verify(s => s.GetSymmetricSecurityKeyAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public void Get_SyncAccessor_ReturnsTheSameKey()
    {
        // The JwtBearer IssuerSigningKeyResolver hook is synchronous and has no async alternative.
        Assert.Equal(ValidKey, KeyText(Build(ValidKey).Get()));
    }

    [Fact]
    public async Task GetAsync_AndGet_AgreeSoIssuedTokensValidate()
    {
        var provider = Build(ValidKey);

        // If these ever diverged, every token the API issued would be rejected by the API itself.
        Assert.Equal(KeyText(await provider.GetAsync()), KeyText(provider.Get()));
    }

    [Fact]
    public async Task KeyShorterThanHs256Minimum_ThrowsWithoutLeakingIt()
    {
        // The real key is exactly 32 bytes — the HS256 floor, zero headroom. Trimming the SysConfig
        // row would break every login AND every validated request, so the failure names the cause
        // rather than surfacing the library's IDX10653.
        const string shortKey = "too-short-for-hs256";

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => Build(shortKey).GetAsync());

        Assert.Contains("symmetricSecurityKey", ex.Message);
        Assert.Contains("32", ex.Message);
        // 🔐 The message must never quote the key itself.
        Assert.DoesNotContain(shortKey, ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ExactlyThirtyTwoBytes_IsAccepted()
    {
        // Pins the boundary the live config sits exactly on: 32 bytes must pass, 31 must not.
        Assert.Equal(32, Encoding.UTF8.GetByteCount(new string('k', 32)));
        Assert.Equal(new string('k', 32), KeyText(Build(new string('k', 32)).Get()));
    }

    [Fact]
    public async Task ThirtyOneBytes_IsRejected()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(() => Build(new string('k', 31)).GetAsync());
    }
}
