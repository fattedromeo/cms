using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class PublishStatusRepository : IPublishStatusRepository
{
    private readonly IDbConnectionFactory _factory;

    public PublishStatusRepository(IDbConnectionFactory factory) => _factory = factory;

    private const string SelectColumns =
        "s.pkid, s.Description, s.IsDraft, s.IsPublished, s.IsDiscontinued";

    public async Task<IEnumerable<PublishStatus>> GetAllAsync(CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var sql = $@"SELECT {SelectColumns} FROM PublishStatus s ORDER BY s.pkid ASC;";
        return await conn.QueryAsync<PublishStatus>(new CommandDefinition(sql, cancellationToken: ct));
    }

    public async Task<IEnumerable<PublishStatus>> QueryAsync(PublishStatusQuery query, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        var where = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            where.Add("s.Description LIKE @kw");
            p.Add("kw", $"%{query.Keyword.Trim()}%");
        }

        if (query.IsDraft.HasValue)
        {
            where.Add("s.IsDraft = @IsDraft");
            p.Add("IsDraft", query.IsDraft.Value);
        }

        if (query.IsPublished.HasValue)
        {
            where.Add("s.IsPublished = @IsPublished");
            p.Add("IsPublished", query.IsPublished.Value);
        }

        if (query.IsDiscontinued.HasValue)
        {
            where.Add("s.IsDiscontinued = @IsDiscontinued");
            p.Add("IsDiscontinued", query.IsDiscontinued.Value);
        }

        var whereSql = where.Count > 0 ? $"WHERE {string.Join(" AND ", where)}" : string.Empty;
        var sql = $@"SELECT {SelectColumns} FROM PublishStatus s {whereSql} ORDER BY s.pkid ASC;";
        return await conn.QueryAsync<PublishStatus>(new CommandDefinition(sql, p, cancellationToken: ct));
    }

    public async Task<PublishStatus?> GetByIdAsync(byte pkid, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var sql = $@"SELECT {SelectColumns} FROM PublishStatus s WHERE s.pkid = @pkid;";
        return await conn.QuerySingleOrDefaultAsync<PublishStatus>(
            new CommandDefinition(sql, new { pkid }, cancellationToken: ct));
    }

    public async Task<bool> ExistsAsync(byte pkid, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var count = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(1) FROM PublishStatus WHERE pkid = @pkid;",
            new { pkid }, cancellationToken: ct));
        return count > 0;
    }

    public async Task<PublishStatus> CreateAsync(PublishStatusRequest request, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        // pkid is user-assigned (tinyint, not identity) — include it in the INSERT; no SCOPE_IDENTITY.
        const string insertSql = @"
            INSERT INTO PublishStatus (pkid, Description, IsDraft, IsPublished, IsDiscontinued)
            VALUES (@Pkid, @Description, @IsDraft, @IsPublished, @IsDiscontinued);";
        await conn.ExecuteAsync(new CommandDefinition(insertSql, request, cancellationToken: ct));

        return new PublishStatus
        {
            Pkid = request.Pkid,
            Description = request.Description,
            IsDraft = request.IsDraft,
            IsPublished = request.IsPublished,
            IsDiscontinued = request.IsDiscontinued
        };
    }

    public async Task<bool> UpdateAsync(PublishStatusRequest request, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        // pkid is the immutable key; update the mutable columns by pkid.
        const string updateSql = @"
            UPDATE PublishStatus
               SET Description = @Description,
                   IsDraft = @IsDraft,
                   IsPublished = @IsPublished,
                   IsDiscontinued = @IsDiscontinued
             WHERE pkid = @Pkid;";
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            updateSql, request, cancellationToken: ct));
        return affected > 0;
    }

    public async Task<bool> DeleteAsync(byte pkid, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM PublishStatus WHERE pkid = @pkid;",
            new { pkid }, cancellationToken: ct));
        return affected > 0;
    }
}
