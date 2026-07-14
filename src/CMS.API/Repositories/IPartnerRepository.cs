using CMS.API.Models;

namespace CMS.API.Repositories;

public interface IPartnerRepository
{
    Task<IEnumerable<Partner>> GetAllAsync(CancellationToken ct = default);
    Task<IEnumerable<Partner>> QueryAsync(PartnerQuery query, CancellationToken ct = default);
    Task<Partner?> GetByIdAsync(short pkid, CancellationToken ct = default);
    Task<Partner> CreateAsync(PartnerRequest request, CancellationToken ct = default);
    Task<bool> UpdateAsync(PartnerRequest request, CancellationToken ct = default);
    Task<bool> DeleteAsync(short pkid, CancellationToken ct = default);
}
