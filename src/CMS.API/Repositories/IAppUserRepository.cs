using CMS.API.Models;

namespace CMS.API.Repositories;

public interface IAppUserRepository
{
    Task<IEnumerable<AppUser>> GetAllAsync(CancellationToken ct = default);
    Task<IEnumerable<AppUser>> QueryAsync(AppUserQuery query, CancellationToken ct = default);
    Task<AppUser?> GetByIdAsync(string userId, CancellationToken ct = default);
    Task<bool> ExistsAsync(string userId, CancellationToken ct = default);

    /// <summary>
    /// Creates a user. PasswordHash is derived server-side from the configured default password —
    /// it is never taken from the request. PasswordUpdatedTime is written as NULL ("still on the
    /// default password").
    /// </summary>
    Task<AppUser> CreateAsync(AppUserRequest request, CancellationToken ct = default);

    /// <summary>Updates a user. Never touches PasswordHash or PasswordUpdatedTime.</summary>
    Task<bool> UpdateAsync(AppUserRequest request, CancellationToken ct = default);

    Task<bool> DeleteAsync(string userId, CancellationToken ct = default);
}
