using CMS.API.Repositories;

namespace CMS.API.Services;

/// <summary>Issues signed JWT access tokens for authenticated users.</summary>
public interface IJwtTokenService
{
    /// <summary>
    /// Builds and signs a 24-hour access token carrying the user's identity and role claims.
    /// </summary>
    /// <remarks>
    /// The signing secret is read from <c>SysConfig['appConfig'].symmetricSecurityKey</c> on every
    /// call — never from appsettings, an env var, or a constant.
    /// </remarks>
    /// <exception cref="InvalidOperationException">
    /// The configured secret is missing, or too short to sign with HS256.
    /// </exception>
    Task<string> CreateAccessTokenAsync(UserCredential user, CancellationToken ct = default);
}
