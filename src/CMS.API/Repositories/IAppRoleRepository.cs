using CMS.API.Models;

namespace CMS.API.Repositories;

public interface IAppRoleRepository
{
    Task<IEnumerable<AppRole>> GetAllAsync(CancellationToken ct = default);
    Task<IEnumerable<AppRole>> QueryAsync(AppRoleQuery query, CancellationToken ct = default);
    Task<AppRole?> GetByIdAsync(string roleId, CancellationToken ct = default);
    Task<bool> ExistsAsync(string roleId, CancellationToken ct = default);
    Task<AppRole> CreateAsync(AppRoleRequest request, CancellationToken ct = default);
    Task<bool> UpdateAsync(AppRoleRequest request, CancellationToken ct = default);
    Task<bool> DeleteAsync(string roleId, CancellationToken ct = default);
}
