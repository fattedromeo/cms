using CMS.API.Repositories;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace CMS.API.Services;

/// <summary>
/// Builds HS256-signed access tokens. See <see cref="IJwtTokenService"/>.
/// </summary>
/// <remarks>
/// <para>
/// The key comes from <see cref="ISigningKeyProvider"/> — the same instance JWT bearer validation
/// uses — so a token can never be signed with a key the API would then reject. The provider owns
/// the SysConfig read, the length check and the caching.
/// </para>
/// <para>
/// <b>Claim names are the short JWT-standard ones</b> (<c>sub</c>, <c>name</c>, <c>role</c>) rather
/// than the <c>ClaimTypes.*</c> schema URIs, so the payload stays small and interoperable. This uses
/// <see cref="JsonWebTokenHandler"/> with <see cref="SecurityTokenDescriptor.Claims"/>, which
/// applies <b>no</b> outbound claim-type mapping — what is written here is exactly what lands in the
/// token. (The older <c>JwtSecurityTokenHandler</c> silently rewrites claim types.) `Program.cs`
/// therefore sets <c>RoleClaimType = "role"</c> / <c>NameClaimType = "name"</c> on the validation
/// side; without those, <c>[Authorize(Roles = "Admin")]</c> would never match.
/// </para>
/// <para>
/// No <c>iss</c>/<c>aud</c> is set: <c>appConfig</c> carries no issuer or audience (verified against
/// the dev DB — the JSON holds only defaultPassword, enforcePasswordPolicy and
/// symmetricSecurityKey), and inventing values here would be a fact not in the schema. Validation
/// disables both checks to match.
/// </para>
/// </remarks>
public sealed class JwtTokenService : IJwtTokenService
{
    /// <summary>Token lifetime: 24 hours from issue.</summary>
    public static readonly TimeSpan TokenLifetime = TimeSpan.FromHours(24);

    /// <summary>Claim type carrying each RoleId. Must match the validator's RoleClaimType.</summary>
    public const string RoleClaimType = "role";

    private readonly ISigningKeyProvider _keys;

    public JwtTokenService(ISigningKeyProvider keys) => _keys = keys;

    public async Task<string> CreateAccessTokenAsync(UserCredential user, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(user);

        var signingCredentials = new SigningCredentials(
            await _keys.GetAsync(ct), SecurityAlgorithms.HmacSha256);

        // One timestamp for both, so exp - iat is exactly the lifetime rather than off by the
        // microseconds between two UtcNow reads.
        var issuedAt = DateTime.UtcNow;

        var claims = new Dictionary<string, object>
        {
            [JwtRegisteredClaimNames.Sub] = user.UserId,
            [JwtRegisteredClaimNames.Name] = user.UserName
        };

        // A string[] serializes as a JSON array — verified to stay an array even for a single role
        // ("role":["Admin"]), which is what the frontend's role parsing depends on. Omitted entirely
        // when the user has no roles; an empty array claim would be noise.
        var roleIds = user.RoleIds.Where(r => !string.IsNullOrWhiteSpace(r)).Distinct().ToArray();
        if (roleIds.Length > 0) claims[RoleClaimType] = roleIds;

        var descriptor = new SecurityTokenDescriptor
        {
            Claims = claims,
            IssuedAt = issuedAt,
            NotBefore = issuedAt,
            Expires = issuedAt.Add(TokenLifetime),
            SigningCredentials = signingCredentials
        };

        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}
