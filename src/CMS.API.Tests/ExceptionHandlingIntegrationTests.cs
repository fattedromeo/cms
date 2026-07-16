using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CMS.API.Middleware;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// End-to-end tests for the global exception handler over the real pipeline
/// (<see cref="WebApplicationFactory{TEntryPoint}"/>, same pattern as
/// <see cref="AuthorizationIntegrationTests"/>): a repository that throws surfaces as ONE generic
/// 500 JSON with nothing sensitive in it, while the already-meaningful responses — 401 challenge,
/// 403, validation 400 — keep their exact behaviour.
/// </summary>
public class ExceptionHandlingIntegrationTests
    : IClassFixture<ExceptionHandlingIntegrationTests.Factory>, IDisposable
{
    private const string TestSigningKey = "integration-test-signing-key-0123456789";

    // What a real unhandled DB failure looks like: SQL text + connection details in the message.
    private const string SecretDetail =
        "SELECT c.pkid FROM Course c -- Server=.\\SQLEXPRESS;Database=CMS;user id=sa";

    public sealed class Factory : WebApplicationFactory<Program>
    {
        public readonly Mock<ILookupRepository> Lookups = new();
        public readonly Mock<IAppUserRepository> AppUsers = new();
        public readonly Mock<ISysConfigRepository> SysConfig = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<ILookupRepository>().AddScoped(_ => Lookups.Object);
                services.RemoveAll<IAppUserRepository>().AddScoped(_ => AppUsers.Object);
                services.RemoveAll<ISysConfigRepository>().AddScoped(_ => SysConfig.Object);
            });
        }
    }

    private readonly Factory _factory;
    private readonly HttpClient _client;

    public ExceptionHandlingIntegrationTests(Factory factory)
    {
        _factory = factory;

        // Shared fixture — reset mocks per test (see AuthorizationIntegrationTests for the why).
        _factory.Lookups.Reset();
        _factory.AppUsers.Reset();
        _factory.SysConfig.Reset();

        _factory.SysConfig.Setup(s => s.GetSymmetricSecurityKeyAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestSigningKey);

        _client = _factory.CreateClient();
    }

    public void Dispose() => _client.Dispose();

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

    // --- The 500 path -------------------------------------------------------

    [Fact]
    public async Task ThrowingRepository_Returns500_WithTheGenericMessage_AndNoDetail()
    {
        _factory.Lookups.Setup(l => l.GetPartnersAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException(SecretDetail));

        var response = await GetWithToken("/api/lookups/partners", "User");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.StartsWith("application/json", response.Content.Headers.ContentType!.ToString());

        using var json = JsonDocument.Parse(body);
        Assert.Equal(ExceptionHandlingMiddleware.GenericMessage,
            json.RootElement.GetProperty("message").GetString());
        Assert.Single(json.RootElement.EnumerateObject());

        // 🔐 Nothing sensitive over the wire: no SQL, no connection string, no exception type, no
        // stack frames. This is the whole point of the middleware.
        Assert.DoesNotContain("SELECT", body);
        Assert.DoesNotContain("SQLEXPRESS", body);
        Assert.DoesNotContain("user id=sa", body);
        Assert.DoesNotContain("InvalidOperationException", body);
        Assert.DoesNotContain("   at ", body);
    }

    [Fact]
    public async Task ThrowingRepository_EveryUnexpectedErrorLooksTheSame()
    {
        // Two very different failures → byte-identical bodies. The client can rely on ONE shape.
        _factory.Lookups.Setup(l => l.GetPartnersAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new NullReferenceException("boom"));
        var first = await (await GetWithToken("/api/lookups/partners", "User")).Content.ReadAsStringAsync();

        _factory.Lookups.Setup(l => l.GetPartnersAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new TimeoutException(SecretDetail));
        var second = await (await GetWithToken("/api/lookups/partners", "User")).Content.ReadAsStringAsync();

        Assert.Equal(first, second);
    }

    // --- Meaningful responses stay untouched ----------------------------------

    [Fact]
    public async Task NoToken_IsStill401WithBearerChallenge_NotA500()
    {
        var response = await _client.GetAsync("/api/lookups/partners");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("Bearer", response.Headers.WwwAuthenticate.ToString());
    }

    [Fact]
    public async Task NonAdmin_OnAdminEndpoint_IsStill403_NotA500()
    {
        var response = await GetWithToken("/api/app-users", "User");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task ValidationFailure_IsStill400_WithFieldDetail_NotTheGenericMessage()
    {
        // POST /api/app-users with a missing required UserId → MVC's ValidationProblem, which is
        // meaningful to the form and must NOT be flattened into the generic 500 shape.
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/app-users")
        {
            Content = JsonContent.Create(new { userName = "No UserId" }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await TokenFor("Admin"));

        var response = await _client.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("UserId", body); // the field-level detail survives
        Assert.DoesNotContain(ExceptionHandlingMiddleware.GenericMessage, body);
    }

    [Fact]
    public async Task HealthyEndpoint_IsUnaffected()
    {
        _factory.Lookups.Setup(l => l.GetPartnersAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync([new LookupItem { Pkid = "1", Label = "Partner" }]);

        var response = await GetWithToken("/api/lookups/partners", "User");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
