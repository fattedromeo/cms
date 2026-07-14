using CMS.API.Models;

namespace CMS.API.Repositories;

public interface ICourseGroupRepository
{
    Task<IEnumerable<CourseGroup>> GetAllAsync(CancellationToken ct = default);
    Task<IEnumerable<CourseGroup>> QueryAsync(CourseGroupQuery query, CancellationToken ct = default);
    Task<CourseGroup?> GetByIdAsync(short pkid, CancellationToken ct = default);
    Task<CourseGroup> CreateAsync(CourseGroupRequest request, CancellationToken ct = default);
    Task<bool> UpdateAsync(CourseGroupRequest request, CancellationToken ct = default);
    Task<bool> DeleteAsync(short pkid, CancellationToken ct = default);
}
