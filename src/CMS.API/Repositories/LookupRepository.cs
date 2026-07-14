using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class LookupRepository : ILookupRepository
{
    private readonly IDbConnectionFactory _factory;

    public LookupRepository(IDbConnectionFactory factory) => _factory = factory;

    public async Task<IEnumerable<LookupItem>> GetAppUsersAsync(CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        const string sql = @"
            SELECT UserId AS Pkid, (UserName + ' (' + UserId + ')') AS Label
            FROM AppUser
            ORDER BY UserName ASC;";
        return await conn.QueryAsync<LookupItem>(new CommandDefinition(sql, cancellationToken: ct));
    }

    public async Task<IEnumerable<LookupItem>> GetPublishStatusesAsync(CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        // LookupItem.Pkid is a string; cast the tinyint pkid to varchar.
        // ORDER BY must be qualified (s.pkid): an unqualified "pkid" would bind to the
        // varchar select-list alias and sort lexicographically (1, 2, 200, 3).
        const string sql = @"
            SELECT CAST(s.pkid AS varchar(3)) AS Pkid, s.Description AS Label
            FROM PublishStatus s
            ORDER BY s.pkid ASC;";
        return await conn.QueryAsync<LookupItem>(new CommandDefinition(sql, cancellationToken: ct));
    }

    public async Task<IEnumerable<LookupItem>> GetPartnersAsync(CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        // LookupItem.Pkid is a string; cast the smallint pkid to varchar.
        const string sql = @"
            SELECT CAST(pkid AS varchar(6)) AS Pkid, Name AS Label
            FROM Partner
            ORDER BY DisplayOrder ASC;";
        return await conn.QueryAsync<LookupItem>(new CommandDefinition(sql, cancellationToken: ct));
    }

    public async Task<IEnumerable<LookupItem>> GetCourseGroupsAsync(CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        // LookupItem.Pkid is a string; cast the smallint pkid to varchar.
        // CourseGroup has no DisplayOrder column — pkid ASC is the stable ordering.
        // ORDER BY must be qualified (g.pkid): an unqualified "pkid" would bind to the
        // varchar select-list alias and sort lexicographically (10, 100, 11, 2).
        const string sql = @"
            SELECT CAST(g.pkid AS varchar(6)) AS Pkid, g.Description AS Label
            FROM CourseGroup g
            ORDER BY g.pkid ASC;";
        return await conn.QueryAsync<LookupItem>(new CommandDefinition(sql, cancellationToken: ct));
    }
}
