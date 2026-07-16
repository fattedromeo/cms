using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// End-to-end authorization tests over the <b>real</b> HTTP pipeline
/// (<see cref="WebApplicationFactory{TEntryPoint}"/> against <c>Program</c>).
/// </summary>
/// <remarks>
/// <para>
/// These exist because the things they cover are invisible to controller unit tests, which call
/// action methods directly and so never run middleware at all:
/// </para>
/// <list type="bullet">
/// <item><c>UseAuthentication()</c> being present, and <b>before</b> <c>UseAuthorization()</c>.</item>
/// <item>The global <c>FallbackPolicy</c> actually attaching to attribute-less controllers.</item>
/// <item><c>RoleClaimType = "role"</c> — without it <c>[Authorize(Roles = "Admin")]</c> matches
/// nothing and 403s every user, including real Admins.</item>
/// <item><c>[AllowAnonymous]</c> on AuthController surviving the fallback policy.</item>
/// </list>
/// <para>
/// Every repository is mocked, so no live SQL Server is touched — including
/// <see cref="ISysConfigRepository"/>, which stands in for the signing key. Tokens are minted with
/// the same <see cref="ISigningKeyProvider"/> the server validates with, exactly as production does.
/// </para>
/// </remarks>
public class AuthorizationIntegrationTests : IClassFixture<AuthorizationIntegrationTests.Factory>, IDisposable
{
    private const string TestSigningKey = "integration-test-signing-key-0123456789";
    private const string ProtectedNonAdminUrl = "/api/lookups/partners";
    private const string AdminOnlyUrl = "/api/app-users";

    public sealed class Factory : WebApplicationFactory<Program>
    {
        public readonly Mock<IAppUserRepository> AppUsers = new();
        public readonly Mock<ILookupRepository> Lookups = new();
        public readonly Mock<IAuthRepository> Auth = new();
        public readonly Mock<ISysConfigRepository> SysConfig = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureServices(services =>
            {
                // Swap every DB-backed dependency for a mock. SigningKeyProvider stays real: it
                // resolves ISysConfigRepository through IServiceScopeFactory, so mocking the
                // repository is enough and the caching/DI wiring under test stays genuine.
                services.RemoveAll<IAppUserRepository>().AddScoped(_ => AppUsers.Object);
                services.RemoveAll<ILookupRepository>().AddScoped(_ => Lookups.Object);
                services.RemoveAll<IAuthRepository>().AddScoped(_ => Auth.Object);
                services.RemoveAll<ISysConfigRepository>().AddScoped(_ => SysConfig.Object);
            });
        }
    }

    private readonly Factory _factory;
    private readonly HttpClient _client;

    public AuthorizationIntegrationTests(Factory factory)
    {
        _factory = factory;

        // The factory is an IClassFixture: ONE instance shared by every test in this class, so its
        // mocks would otherwise carry setups and recorded invocations across tests — and a
        // Times.Never assertion would fail on some other test's call. xUnit builds a fresh test-class
        // instance per test and runs them sequentially within the class, so resetting here gives each
        // test a clean slate while the (expensive) host is still built only once.
        _factory.SysConfig.Reset();
        _factory.Lookups.Reset();
        _factory.AppUsers.Reset();
        _factory.Auth.Reset();

        _factory.SysConfig.Setup(s => s.GetSymmetricSecurityKeyAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestSigningKey);
        _factory.Lookups.Setup(l => l.GetPartnersAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync([new LookupItem { Pkid = "1", Label = "Partner" }]);
        _factory.AppUsers.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync([]);

        _client = _factory.CreateClient();
    }

    public void Dispose() => _client.Dispose();

    /// <summary>Mints a token through the app's own services — the real issue path.</summary>
    private async Task<string> TokenFor(params string[] roles)
    {
        using var scope = _factory.Services.CreateScope();
        var tokens = scope.ServiceProvider.GetRequiredService<IJwtTokenService>();
        return await tokens.CreateAccessTokenAsync(
            new UserCredential("miles@uuu.com.tw", "Miles Sun", "hash", true, roles));
    }

    private async Task<HttpResponseMessage> GetWithToken(string url, params string[] roles)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await TokenFor(roles));
        return await _client.SendAsync(request);
    }

    // --- No token ---------------------------------------------------------
    [Fact]
    public async Task ProtectedEndpoint_WithoutToken_Returns401()
    {
        var response = await _client.GetAsync(ProtectedNonAdminUrl);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        // Proves the 401 came from the auth pipeline rather than an app-level Unauthorized() —
        // the challenge header is what distinguishes them.
        Assert.Contains("Bearer", response.Headers.WwwAuthenticate.ToString());
    }

    [Fact]
    public async Task AdminEndpoint_WithoutToken_Returns401()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _client.GetAsync(AdminOnlyUrl)).StatusCode);
    }

    [Theory]
    [InlineData("/api/courses")]
    [InlineData("/api/partners")]
    [InlineData("/api/course-groups")]
    [InlineData("/api/featured-promo-items")]
    [InlineData("/api/publish-statuses")]
    [InlineData("/api/app-roles")]
    [InlineData("/api/lookups/partners")]
    public async Task EveryNonAuthController_WithoutToken_Returns401(string url)
    {
        // The fallback policy's real job: a controller that declares no authorization is still
        // protected, so adding one without [Authorize] fails closed rather than leaking silently.
        Assert.Equal(HttpStatusCode.Unauthorized, (await _client.GetAsync(url)).StatusCode);
    }

    // --- Valid token ------------------------------------------------------
    [Fact]
    public async Task ProtectedEndpoint_WithValidToken_Returns200()
    {
        var response = await GetWithToken(ProtectedNonAdminUrl, "User");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GarbageToken_Returns401()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, ProtectedNonAdminUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "not.a.jwt");

        Assert.Equal(HttpStatusCode.Unauthorized, (await _client.SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task TokenSignedWithTheWrongKey_Returns401()
    {
        // The signature is what makes the token trustworthy; a well-formed token signed by anyone
        // else must not get in.
        var forged = await new JwtTokenService(new StaticKeyProvider("a-different-key-that-is-32-bytes!!"))
            .CreateAccessTokenAsync(new UserCredential("miles@uuu.com.tw", "Miles Sun", "h", true, ["Admin"]));

        using var request = new HttpRequestMessage(HttpMethod.Get, ProtectedNonAdminUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", forged);

        Assert.Equal(HttpStatusCode.Unauthorized, (await _client.SendAsync(request)).StatusCode);
    }

    private sealed class StaticKeyProvider : ISigningKeyProvider
    {
        private readonly SymmetricSecurityKey _key;
        public StaticKeyProvider(string key) => _key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        public Task<SymmetricSecurityKey> GetAsync(CancellationToken ct = default) => Task.FromResult(_key);
        public SymmetricSecurityKey Get() => _key;
    }

    // --- Role enforcement -------------------------------------------------
    [Fact]
    public async Task AdminEndpoint_WithAdminRole_Returns200()
    {
        // Also pins RoleClaimType = "role": with the default (the ClaimTypes.Role schema URI) this
        // would 403 even a real Admin, and nothing else in the suite would notice.
        var response = await GetWithToken(AdminOnlyUrl, "Admin", "developer", "User");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task AdminEndpoint_WithoutAdminRole_Returns403_NotJustAHiddenMenu()
    {
        // The point of enforcing server-side: hiding 系統管理 in the sidebar stops nobody from
        // calling the API directly. 403, not 401 — the caller IS authenticated, just not permitted.
        var response = await GetWithToken(AdminOnlyUrl, "User", "developer");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData("/api/app-users")]
    [InlineData("/api/app-roles")]
    [InlineData("/api/publish-statuses")]
    public async Task EveryAdminController_WithoutAdminRole_Returns403(string url)
    {
        Assert.Equal(HttpStatusCode.Forbidden, (await GetWithToken(url, "User")).StatusCode);
    }

    [Fact]
    public async Task RoleMatchingIsCaseSensitive_LowercaseAdminIsNotAdmin()
    {
        // Claims compare ordinally, unlike the DB's CI collation — a RoleId stored as "admin" would
        // NOT satisfy [Authorize(Roles = "Admin")]. Pinning it so the asymmetry is a known fact.
        Assert.Equal(HttpStatusCode.Forbidden, (await GetWithToken(AdminOnlyUrl, "admin")).StatusCode);
    }

    [Fact]
    public async Task NonAdminCanStillUseTheNonAdminApi()
    {
        // Guards against over-tightening: a plain user must keep working everywhere else.
        Assert.Equal(HttpStatusCode.OK, (await GetWithToken(ProtectedNonAdminUrl, "User")).StatusCode);
    }

    // --- AuthController stays anonymous -----------------------------------
    [Fact]
    public async Task Login_WithoutAnyToken_IsReachableAndReturns200()
    {
        // The load-bearing assertion: [AllowAnonymous] beats the global fallback policy. A 200 (not
        // merely "not 401") is what proves it — login's own bad-credentials reply is ALSO a 401, so
        // asserting "not 401" here would pass even if the endpoint were locked shut.
        _factory.Auth.Setup(a => a.FindByUserIdAsync("miles@uuu.com.tw", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new UserCredential(
                "miles@uuu.com.tw", "Miles Sun",
                "0e44ce7308af2b3de5232e4616403ce7d49ba2aec83f79c196409556422a4927", // SHA256("P@ssw0rd!")
                true, ["Admin"]));

        var response = await _client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest { UserId = "miles@uuu.com.tw", Password = "P@ssw0rd!" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.NotEmpty(body!.AccessToken);
    }

    [Fact]
    public async Task Login_WithBadCredentials_Returns401FromTheApp_NotAChallenge()
    {
        _factory.Auth.Setup(a => a.FindByUserIdAsync("ghost@example.com", It.IsAny<CancellationToken>()))
            .ReturnsAsync((UserCredential?)null);

        var response = await _client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest { UserId = "ghost@example.com", Password = "whatever" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        // No WWW-Authenticate challenge => this 401 is the credential check, not the auth pipeline
        // refusing an anonymous caller. That distinction is why the test above asserts 200.
        Assert.Empty(response.Headers.WwwAuthenticate);
    }

    // --- PUT /api/auth/profile is authenticated, on an otherwise public controller ---------
    [Fact]
    public async Task Profile_WithoutToken_IsBlockedByThePipeline_NotJustTheActionsOwnCheck()
    {
        // ⚠️ The regression guard for the [AllowAnonymous] placement trap. AuthController hosts the
        // anonymous login endpoint, so the attribute MUST stay on that action: at class level it
        // wins over [Authorize] here and lets anonymous callers into the action body.
        //
        // Asserting "401" alone would NOT catch that — the action's own missing-`sub` check also
        // returns 401. Measured: trap state gives 401 with an empty WWW-Authenticate and an
        // "invalid credentials" body; the correct state gives 401 + `Bearer` and never runs the
        // action. So the challenge header is the assertion that has teeth.
        var response = await _client.PutAsJsonAsync("/api/auth/profile",
            new UpdateProfileRequest { UserName = "Anonymous Edit" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("Bearer", response.Headers.WwwAuthenticate.ToString());
        // The decisive one: the action never ran, so the DB was never asked to write.
        _factory.Auth.Verify(a => a.UpdateUserNameAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Profile_WithValidToken_UpdatesTheTokensUser()
    {
        _factory.Auth.Setup(a => a.UpdateUserNameAsync(
                "miles@uuu.com.tw", "Renamed", It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        using var request = new HttpRequestMessage(HttpMethod.Put, "/api/auth/profile")
        {
            Content = JsonContent.Create(new UpdateProfileRequest { UserName = "Renamed" }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await TokenFor("User"));

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ProfileResponse>();
        Assert.Equal("miles@uuu.com.tw", body!.UserId);
        Assert.Equal("Renamed", body.UserName);
    }

    [Fact]
    public async Task Profile_UserIdInTheJsonBody_IsIgnored_OverTheWire()
    {
        // The real over-post attempt: raw JSON naming a victim, not a typed DTO. This is the level
        // at which "the body cannot retarget the update" is actually worth proving — model binding
        // has nowhere to put `userId`, so the token's subject wins.
        _factory.Auth.Setup(a => a.UpdateUserNameAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        using var request = new HttpRequestMessage(HttpMethod.Put, "/api/auth/profile")
        {
            Content = JsonContent.Create(new
            {
                userId = "victim@uuu.com.tw",
                userName = "Pwned",
                roleIds = new[] { "Admin" },
                isActive = false,
            }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await TokenFor("User"));

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ProfileResponse>();
        Assert.Equal("miles@uuu.com.tw", body!.UserId); // the TOKEN's user, not the body's

        _factory.Auth.Verify(a => a.UpdateUserNameAsync(
            "miles@uuu.com.tw", "Pwned", It.IsAny<CancellationToken>()), Times.Once);
        _factory.Auth.Verify(a => a.UpdateUserNameAsync(
            "victim@uuu.com.tw", It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Profile_WhitespaceUserName_Returns400_OverTheWire()
    {
        using var request = new HttpRequestMessage(HttpMethod.Put, "/api/auth/profile")
        {
            Content = JsonContent.Create(new { userName = "   " }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await TokenFor("User"));

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        _factory.Auth.Verify(a => a.UpdateUserNameAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Profile_IsNotAdminOnly_AnyoneMayRenameThemselves()
    {
        // Guards against over-tightening: the profile page is for every signed-in user.
        _factory.Auth.Setup(a => a.UpdateUserNameAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        using var request = new HttpRequestMessage(HttpMethod.Put, "/api/auth/profile")
        {
            Content = JsonContent.Create(new UpdateProfileRequest { UserName = "Plain User" }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await TokenFor("developer"));

        Assert.Equal(HttpStatusCode.OK, (await _client.SendAsync(request)).StatusCode);
    }

    // --- POST /api/auth/reset-password is Admin-only ------------------------
    [Fact]
    public async Task ResetPassword_AsNonAdmin_Returns403_AndResetsNothing()
    {
        // ⚠️ The load-bearing test for this endpoint. It is the only auth endpoint that acts on
        // ANOTHER user's account, so the role check is the only thing between any signed-in user and
        // everybody else's password. Only the real pipeline can prove it — a unit test calling the
        // action directly never runs [Authorize].
        using var request = ResetRequest("victim@uuu.com.tw", await TokenFor("User", "developer"));

        var response = await _client.SendAsync(request);

        // 403, not 401: the caller IS authenticated, just not permitted.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        _factory.Auth.Verify(a => a.UpdatePasswordAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()),
            Times.Never);
        // It never even read the default password.
        _factory.SysConfig.Verify(s => s.GetDefaultPasswordAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ResetPassword_WithNoRolesAtAll_Returns403()
    {
        using var request = ResetRequest("victim@uuu.com.tw", await TokenFor());

        Assert.Equal(HttpStatusCode.Forbidden, (await _client.SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task ResetPassword_LowercaseAdminRole_Returns403()
    {
        // Claims compare ordinally; the DB collation is case-insensitive. "admin" is not "Admin".
        using var request = ResetRequest("victim@uuu.com.tw", await TokenFor("admin"));

        Assert.Equal(HttpStatusCode.Forbidden, (await _client.SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task ResetPassword_WithoutAnyToken_Returns401()
    {
        var response = await _client.PostAsJsonAsync("/api/auth/reset-password",
            new ResetPasswordRequest { UserId = "victim@uuu.com.tw" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("Bearer", response.Headers.WwwAuthenticate.ToString());
    }

    [Fact]
    public async Task ResetPassword_AsAdmin_HashesTheConfiguredDefaultAndNullsTheTimestamp()
    {
        _factory.SysConfig.Setup(s => s.GetDefaultPasswordAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync("P@ssw0rd!");
        _factory.Auth.Setup(a => a.UpdatePasswordAsync(
                "victim@uuu.com.tw",
                "0e44ce7308af2b3de5232e4616403ce7d49ba2aec83f79c196409556422a4927", // SHA256("P@ssw0rd!")
                null, // NULL = "still on the default password", per spec/auth/AppUser.md
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        using var request = ResetRequest("victim@uuu.com.tw", await TokenFor("Admin"));
        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        _factory.Auth.VerifyAll();
    }

    [Fact]
    public async Task ResetPassword_ResponseBodyIsEmpty_NoPasswordOrHashComesBack()
    {
        _factory.SysConfig.Setup(s => s.GetDefaultPasswordAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync("P@ssw0rd!");
        _factory.Auth.Setup(a => a.UpdatePasswordAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        using var request = ResetRequest("victim@uuu.com.tw", await TokenFor("Admin"));
        var response = await _client.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();

        // Over the wire, end to end: neither the default password nor its hash appears anywhere.
        Assert.Empty(body);
        Assert.DoesNotContain("P@ssw0rd!", body, StringComparison.Ordinal);
        Assert.DoesNotContain("0e44ce73", body, StringComparison.OrdinalIgnoreCase);
    }

    private static HttpRequestMessage ResetRequest(string userId, string token)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/reset-password")
        {
            Content = JsonContent.Create(new ResetPasswordRequest { UserId = userId }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return request;
    }

    [Fact]
    public async Task Login_StillAnonymous_AfterTheAttributeMovedToTheAction()
    {
        // The other half of the trap: moving [AllowAnonymous] down must not lock login itself out.
        _factory.Auth.Setup(a => a.FindByUserIdAsync("miles@uuu.com.tw", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new UserCredential(
                "miles@uuu.com.tw", "Miles Sun",
                "0e44ce7308af2b3de5232e4616403ce7d49ba2aec83f79c196409556422a4927",
                true, ["Admin"]));

        var response = await _client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest { UserId = "miles@uuu.com.tw", Password = "P@ssw0rd!" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task LoginTokenIsAcceptedByTheApi_EndToEnd()
    {
        // The full round trip: log in, then use the returned token on a protected endpoint. This is
        // what catches issue/validate key drift — the failure mode where the API rejects the very
        // token it just minted.
        _factory.Auth.Setup(a => a.FindByUserIdAsync("miles@uuu.com.tw", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new UserCredential(
                "miles@uuu.com.tw", "Miles Sun",
                "0e44ce7308af2b3de5232e4616403ce7d49ba2aec83f79c196409556422a4927",
                true, ["Admin"]));

        var login = await _client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest { UserId = "miles@uuu.com.tw", Password = "P@ssw0rd!" });
        var profile = await login.Content.ReadFromJsonAsync<LoginResponse>();

        using var request = new HttpRequestMessage(HttpMethod.Get, AdminOnlyUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", profile!.AccessToken);

        Assert.Equal(HttpStatusCode.OK, (await _client.SendAsync(request)).StatusCode);
    }
}
