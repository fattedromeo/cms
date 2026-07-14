using CMS.API.Models;

namespace CMS.API.Repositories;

public interface IPublishStatusRepository
{
    Task<IEnumerable<PublishStatus>> GetAllAsync(CancellationToken ct = default);
    Task<IEnumerable<PublishStatus>> QueryAsync(PublishStatusQuery query, CancellationToken ct = default);
    Task<PublishStatus?> GetByIdAsync(byte pkid, CancellationToken ct = default);
    Task<bool> ExistsAsync(byte pkid, CancellationToken ct = default);
    Task<PublishStatus> CreateAsync(PublishStatusRequest request, CancellationToken ct = default);
    Task<bool> UpdateAsync(PublishStatusRequest request, CancellationToken ct = default);
    Task<bool> DeleteAsync(byte pkid, CancellationToken ct = default);
}
