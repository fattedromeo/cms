using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class RowAuditRepository : IRowAuditRepository
{
    private readonly IDbConnectionFactory _factory;

    public RowAuditRepository(IDbConnectionFactory factory) => _factory = factory;

    public async Task<IEnumerable<RowAuditEntry>> GetForRecordAsync(
        string tableName, string pkid, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        // [DateTime] is bracketed (reserved word). Newest first; a.pkid DESC breaks ties — one
        // transaction can write several rows within datetime's 3ms tick (e.g. a FeaturedPromoItem
        // swap logs two Updates), and the IDENTITY pkid is the true insertion order.
        const string sql = @"
            SELECT a.[DateTime], a.UserName, a.ActionType, a.ActionDesc
            FROM RowAudit a
            WHERE a.TableName = @tableName AND a.PrimaryKeyValues = @pkid
            ORDER BY a.[DateTime] DESC, a.pkid DESC;";
        return await conn.QueryAsync<RowAuditEntry>(new CommandDefinition(
            sql, new { tableName, pkid }, cancellationToken: ct));
    }
}
