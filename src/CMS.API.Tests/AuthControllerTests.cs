using System.Text;
using System.Text.Json;
using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// Endpoint tests for <see cref="AuthController"/>. <see cref="IAuthRepository"/> and
/// <see cref="ISigningKeyProvider"/> are mocked so these run without a live SQL Server, but
/// <see cref="JwtTokenService"/> is the <b>real</b> one — the token is genuinely signed and parsed
/// back, so the claim and expiry assertions test the shipped code rather than a stub.
/// </summary>
/// <remarks>
/// <para>
/// <b>Known gap</b> (same class as the SqlException/547 one in <c>spec/reference/backend.md</c>): a
/// mocked repository cannot catch SQL-semantics bugs, so these tests do not prove the credential
/// SELECT is correct. It was verified against the dev DB instead: the AppUser columns are
/// <c>Chinese_Taiwan_Stroke_CI_AS</c> (case-insensitive — hence
/// <see cref="Login_MatchesUserIdCaseInsensitively_AndEchoesStoredCasing"/>). The signing key's own
/// rules live with it, in <see cref="SigningKeyProviderTests"/>.
/// </para>
/// <para>
/// The password fixture uses a <b>hard-coded</b> SHA-256 digest rather than calling
/// <see cref="CMS.API.Data.PasswordHasher"/>: reusing the hasher to build the expected value would
/// make the test pass even if the hasher and the login check drifted together.
/// <see cref="PasswordHasherTests"/> pins the hasher itself.
/// </para>
/// </remarks>
public class AuthControllerTests
{
    private const string Password = "P@ssw0rd!";

    /// <summary>SHA-256("P@ssw0rd!") as 64 lowercase hex chars — computed independently.</summary>
    private const string PasswordHash = "0e44ce7308af2b3de5232e4616403ce7d49ba2aec83f79c196409556422a4927";

    /// <summary>Stands in for the SysConfig signing key. Must be >= 32 bytes to satisfy HS256.</summary>
    private const string TestSigningKey = "unit-test-signing-key-0123456789abcdef";

    private static readonly string[] SampleRoles = ["Admin", "developer", "User"];

    private readonly Mock<IAuthRepository> _auth = new(MockBehavior.Strict);
    private readonly Mock<ISigningKeyProvider> _keys = new(MockBehavior.Strict);
    // Strict and with no setup: login must never read SysConfig. Any call fails the test.
    private readonly Mock<ISysConfigRepository> _sysConfig = new(MockBehavior.Strict);
    private readonly AuthController _controller;

    public AuthControllerTests()
    {
        _keys.Setup(k => k.GetAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestSigningKey)));
        _controller = new AuthController(
            _auth.Object, new JwtTokenService(_keys.Object), _sysConfig.Object);
    }

    private static UserCredential Sample(
        string userId = "miles@uuu.com.tw",
        string hash = PasswordHash,
        bool isActive = true,
        IReadOnlyList<string>? roles = null)
        => new(userId, "Miles Sun", hash, isActive, roles ?? SampleRoles);

    private void SetupUser(UserCredential? user, string lookupId = "miles@uuu.com.tw")
        => _auth.Setup(a => a.FindByUserIdAsync(lookupId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(user);

    private Task<ActionResult<LoginResponse>> Login(string userId, string password)
        => _controller.Login(new LoginRequest { UserId = userId, Password = password }, CancellationToken.None);

    private static JsonWebToken Read(string token) => new JsonWebTokenHandler().ReadJsonWebToken(token);

    private static LoginResponse AssertOk(ActionResult<LoginResponse> result)
    {
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        return Assert.IsType<LoginResponse>(ok.Value);
    }

    private static void AssertGenericUnauthorized(ActionResult<LoginResponse> result)
    {
        var unauthorized = Assert.IsType<UnauthorizedObjectResult>(result.Result);
        // The message must not hint at WHICH check failed — that would enumerate accounts.
        Assert.Equal("invalid credentials", GetMessage(unauthorized.Value!));
    }

    private static string GetMessage(object payload)
        => payload.GetType().GetProperty("message")!.GetValue(payload)!.ToString()!;

    // --- Success ----------------------------------------------------------
    [Fact]
    public async Task Login_ValidActiveUser_ReturnsProfileWithToken()
    {
        SetupUser(Sample());

        var body = AssertOk(await Login("miles@uuu.com.tw", Password));

        Assert.Equal("miles@uuu.com.tw", body.UserId);
        Assert.Equal("Miles Sun", body.UserName);
        Assert.NotEmpty(body.AccessToken);
        Assert.Equal(3, body.AccessToken.Split('.').Length); // header.payload.signature
        _auth.VerifyAll();
    }

    [Fact]
    public async Task Login_ValidUser_TokenIsSignedWithTheSysConfigKey()
    {
        SetupUser(Sample());

        var body = AssertOk(await Login("miles@uuu.com.tw", Password));

        // Proves the signature verifies against the key the SysConfig repo handed out — i.e. the
        // secret really came from SysConfig, not a constant.
        var validation = await new JsonWebTokenHandler().ValidateTokenAsync(body.AccessToken,
            new TokenValidationParameters
            {
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestSigningKey)),
                ValidateIssuerSigningKey = true,
                ValidateLifetime = true,
                // appConfig carries no issuer/audience, so the token sets none.
                ValidateIssuer = false,
                ValidateAudience = false
            });

        Assert.True(validation.IsValid, validation.Exception?.Message);
        _keys.Verify(k => k.GetAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Login_ValidUser_TokenCarriesUserIdAndUserNameClaims()
    {
        SetupUser(Sample());

        var jwt = Read(AssertOk(await Login("miles@uuu.com.tw", Password)).AccessToken);

        Assert.Equal("miles@uuu.com.tw", jwt.GetClaim(JwtRegisteredClaimNames.Sub).Value);
        Assert.Equal("Miles Sun", jwt.GetClaim(JwtRegisteredClaimNames.Name).Value);
    }

    [Fact]
    public async Task Login_ValidUser_TokenCarriesEveryRoleIdAsARoleClaim()
    {
        SetupUser(Sample()); // Admin, developer, User — the real role set for this user in the dev DB

        var jwt = Read(AssertOk(await Login("miles@uuu.com.tw", Password)).AccessToken);

        var roles = jwt.Claims
            .Where(c => c.Type == JwtTokenService.RoleClaimType)
            .Select(c => c.Value)
            .OrderBy(v => v, StringComparer.Ordinal);
        Assert.Equal(["Admin", "User", "developer"], roles);
    }

    [Fact]
    public async Task Login_UserWithNoRoles_TokenHasNoRoleClaims()
    {
        SetupUser(Sample(roles: []));

        var jwt = Read(AssertOk(await Login("miles@uuu.com.tw", Password)).AccessToken);

        Assert.DoesNotContain(jwt.Claims, c => c.Type == JwtTokenService.RoleClaimType);
    }

    [Fact]
    public async Task Login_ValidUser_TokenExpires24HoursAfterIssue()
    {
        var before = DateTime.UtcNow;
        SetupUser(Sample());

        var jwt = Read(AssertOk(await Login("miles@uuu.com.tw", Password)).AccessToken);

        // Exact: iat and exp derive from one timestamp, and both truncate to whole seconds.
        Assert.Equal(TimeSpan.FromHours(24), jwt.ValidTo - jwt.IssuedAt);
        // And anchored to now, so a wrong unit (24 minutes / 24 days) cannot pass.
        Assert.InRange(jwt.ValidTo, before.AddHours(24).AddSeconds(-30), DateTime.UtcNow.AddHours(24).AddSeconds(30));
    }

    // --- The three rejection paths ----------------------------------------
    [Fact]
    public async Task Login_WrongPassword_ReturnsUnauthorized()
    {
        SetupUser(Sample());

        AssertGenericUnauthorized(await Login("miles@uuu.com.tw", "not-the-password"));

        // No token may be minted on a failed login: the signing key is never even read.
        _keys.Verify(k => k.GetAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Login_UnknownUserId_ReturnsUnauthorized()
    {
        SetupUser(null, "nobody@example.com");

        AssertGenericUnauthorized(await Login("nobody@example.com", Password));

        _keys.Verify(k => k.GetAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Login_InactiveUser_ReturnsUnauthorized_EvenWithTheCorrectPassword()
    {
        // IsActive is carried on the credential and enforced in the controller (rather than filtered
        // out in SQL) precisely so this rule is reachable from a mocked-repo test.
        SetupUser(Sample(isActive: false));

        AssertGenericUnauthorized(await Login("miles@uuu.com.tw", Password));

        _keys.Verify(k => k.GetAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Login_AllThreeFailures_ReturnIdenticalResponses()
    {
        _auth.Setup(a => a.FindByUserIdAsync("ghost@example.com", It.IsAny<CancellationToken>()))
            .ReturnsAsync((UserCredential?)null);
        _auth.Setup(a => a.FindByUserIdAsync("inactive@example.com", It.IsAny<CancellationToken>()))
            .ReturnsAsync(Sample(userId: "inactive@example.com", isActive: false));
        SetupUser(Sample());

        var unknown = await Login("ghost@example.com", Password);
        var inactive = await Login("inactive@example.com", Password);
        var wrongPassword = await Login("miles@uuu.com.tw", "wrong");

        // Byte-identical status + body: nothing distinguishes the three causes to a caller.
        foreach (var result in new[] { unknown, inactive, wrongPassword })
        {
            var unauthorized = Assert.IsType<UnauthorizedObjectResult>(result.Result);
            Assert.Equal(StatusCodes.Status401Unauthorized, unauthorized.StatusCode);
            Assert.Equal("invalid credentials", GetMessage(unauthorized.Value!));
        }
    }

    [Fact]
    public async Task Login_MissingCredentials_ReturnsValidationProblem()
    {
        _controller.ModelState.AddModelError(nameof(LoginRequest.Password), "Required");

        var result = await _controller.Login(new LoginRequest { UserId = "miles@uuu.com.tw" }, CancellationToken.None);

        Assert.IsType<ObjectResult>(result.Result);
        _auth.Verify(a => a.FindByUserIdAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // --- PasswordHash must never reach the client -------------------------
    [Fact]
    public void LoginResponse_HasNoPasswordProperty()
    {
        // Type-system enforcement, same as AppUser: no property means nothing to leak.
        Assert.DoesNotContain(
            typeof(LoginResponse).GetProperties(),
            p => p.Name.Contains("Password", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Login_SerializedResponse_ContainsNeitherHashNorPassword()
    {
        SetupUser(Sample());

        var body = AssertOk(await Login("miles@uuu.com.tw", Password));
        var json = JsonSerializer.Serialize(body);

        Assert.DoesNotContain(PasswordHash, json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Password, json, StringComparison.Ordinal);
        Assert.DoesNotContain("password", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Login_TokenPayload_CarriesNoHashOrPassword()
    {
        SetupUser(Sample());

        var body = AssertOk(await Login("miles@uuu.com.tw", Password));

        // The JWT payload is only base64-encoded, not encrypted — anything put in a claim is public.
        var payload = Encoding.UTF8.GetString(Base64UrlEncoder.DecodeBytes(body.AccessToken.Split('.')[1]));
        Assert.DoesNotContain(PasswordHash, payload, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Password, payload, StringComparison.Ordinal);
    }

    // --- Collation-driven behaviour ---------------------------------------
    [Fact]
    public async Task Login_MatchesUserIdCaseInsensitively_AndEchoesStoredCasing()
    {
        // The repo's SQL matches case-insensitively (Chinese_Taiwan_Stroke_CI_AS), so a client may
        // post any casing; the row that comes back carries the stored one, which is what ships out.
        SetupUser(Sample(), lookupId: "MILES@UUU.COM.TW");

        var body = AssertOk(await Login("MILES@UUU.COM.TW", Password));

        Assert.Equal("miles@uuu.com.tw", body.UserId);
        Assert.Equal("miles@uuu.com.tw", Read(body.AccessToken).GetClaim(JwtRegisteredClaimNames.Sub).Value);
    }

    [Theory]
    [InlineData("0E44CE7308AF2B3DE5232E4616403CE7D49BA2AEC83F79C196409556422A4927")] // uppercase hex
    [InlineData("0e44ce7308af2b3de5232e4616403ce7d49ba2aec83f79c196409556422a4927   ")] // trailing spaces
    public async Task Login_StoredHashCaseAndPadding_DoNotLockTheUserOut(string storedHash)
    {
        // PasswordHash lives in a case-insensitive collation and SQL '=' ignores trailing spaces, so
        // the DB considers these the same hash. An ordinal compare in C# would disagree and reject a
        // valid password with a generic 401 — a silent lockout with no clue as to why.
        SetupUser(Sample(hash: storedHash));

        Assert.Equal("miles@uuu.com.tw", AssertOk(await Login("miles@uuu.com.tw", Password)).UserId);
    }

    [Fact]
    public async Task Login_HashOfADifferentPassword_IsRejected()
    {
        // Guards the fixture itself: proves the digest above is not matching everything.
        SetupUser(Sample(hash: "9dca666eb54730714630d1519264a7bf1eeaad00b8f2edc90d3ecbfad928d163"));

        AssertGenericUnauthorized(await Login("miles@uuu.com.tw", Password));
    }

}
