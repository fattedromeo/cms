using System.Data;
using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Services;
using Dapper;

namespace CMS.API.Repositories;

public sealed class PublishStatusRepository : IPublishStatusRepository
{
    private const string TableName = "PublishStatus";

    private readonly IDbConnectionFactory _factory;
    private readonly IRowAuditWriter _audit;

    public PublishStatusRepository(IDbConnectionFactory factory, IRowAuditWriter audit)
    {
        _factory = factory;
        _audit = audit;
    }

    private const string SelectColumns =
        "s.pkid, s.Description, s.IsDraft, s.IsPublished, s.IsDiscontinued";

    /// <summary>Row image on the caller's connection/transaction — the audit before/after compare.</summary>
    private static Task<PublishStatus?> SnapshotAsync(
        IDbConnection conn, IDbTransaction tx, byte pkid, CancellationToken ct) =>
        conn.QuerySingleOrDefaultAsync<PublishStatus>(new CommandDefinition(
            $"SELECT {SelectColumns} FROM PublishStatus s WHERE s.pkid = @pkid;",
            new { pkid }, tx, cancellationToken: ct));

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
        // Transaction spans the INSERT and its audit row so neither can exist without the other.
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // pkid is user-assigned (tinyint, not identity) — include it in the INSERT; no SCOPE_IDENTITY.
        const string insertSql = @"
            INSERT INTO PublishStatus (pkid, Description, IsDraft, IsPublished, IsDiscontinued)
            VALUES (@Pkid, @Description, @IsDraft, @IsPublished, @IsDiscontinued);";
        await conn.ExecuteAsync(new CommandDefinition(insertSql, request, tx, cancellationToken: ct));

        var created = new PublishStatus
        {
            Pkid = request.Pkid,
            Description = request.Description,
            IsDraft = request.IsDraft,
            IsPublished = request.IsPublished,
            IsDiscontinued = request.IsDiscontinued
        };

        await _audit.LogInsertAsync(conn, tx, TableName, created, ct);
        tx.Commit();
        return created;
    }

    public async Task<bool> UpdateAsync(PublishStatusRequest request, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // The "before" image feeds the audit's changed-column list. A missing row returns false
        // here, matching what affected == 0 used to report; disposing the uncommitted transaction
        // rolls back, so no audit row survives a failed change.
        var before = await SnapshotAsync(conn, tx, request.Pkid, ct);
        if (before is null) return false;

        // pkid is the immutable key; update the mutable columns by pkid.
        const string updateSql = @"
            UPDATE PublishStatus
               SET Description = @Description,
                   IsDraft = @IsDraft,
                   IsPublished = @IsPublished,
                   IsDiscontinued = @IsDiscontinued
             WHERE pkid = @Pkid;";
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            updateSql, request, tx, cancellationToken: ct));
        if (affected == 0) return false;

        var after = await SnapshotAsync(conn, tx, request.Pkid, ct);
        await _audit.LogUpdateAsync(conn, tx, TableName, before, after!, ct);
        tx.Commit();
        return true;
    }

    public async Task<bool> DeleteAsync(byte pkid, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // Load first — after the DELETE the row's Description (the audit ActionDesc) is gone.
        var row = await SnapshotAsync(conn, tx, pkid, ct);
        if (row is null) return false;

        var affected = await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM PublishStatus WHERE pkid = @pkid;",
            new { pkid }, tx, cancellationToken: ct));
        if (affected == 0) return false;

        await _audit.LogDeleteAsync(conn, tx, TableName, row, ct);
        tx.Commit();
        return true;
    }
}
