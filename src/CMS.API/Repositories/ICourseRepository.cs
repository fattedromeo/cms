using CMS.API.Models;

namespace CMS.API.Repositories;

public interface ICourseRepository
{
    Task<IEnumerable<Course>> GetAllAsync(CancellationToken ct = default);
    Task<IEnumerable<Course>> QueryAsync(CourseQuery query, CancellationToken ct = default);

    /// <summary>Single course including the FK nav objects and both N-N pkid lists.</summary>
    Task<Course?> GetByIdAsync(int pkid, CancellationToken ct = default);

    Task<Course> CreateAsync(CourseRequest request, CancellationToken ct = default);
    Task<bool> UpdateAsync(CourseRequest request, CancellationToken ct = default);
    Task<bool> DeleteAsync(int pkid, CancellationToken ct = default);
}
