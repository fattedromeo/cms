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
        const string sql = @"
            SELECT CAST(pkid AS varchar(3)) AS Pkid, Description AS Label
            FROM PublishStatus
            ORDER BY pkid ASC;";
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
}
