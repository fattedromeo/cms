using System.Data;
using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Services;
using Dapper;

namespace CMS.API.Repositories;

public sealed class CourseGroupRepository : ICourseGroupRepository
{
    private const string TableName = "CourseGroup";

    private readonly IDbConnectionFactory _factory;
    private readonly IRowAuditWriter _audit;

    public CourseGroupRepository(IDbConnectionFactory factory, IRowAuditWriter audit)
    {
        _factory = factory;
        _audit = audit;
    }

    // Description is nvarchar (not nchar) → no RTRIM needed; CourseGroup has no FKs → no JOINs.
    private const string SelectColumns = "g.pkid, g.Description";

    /// <summary>Row image on the caller's connection/transaction — the audit before/after compare.</summary>
    private static Task<CourseGroup?> SnapshotAsync(
        IDbConnection conn, IDbTransaction tx, short pkid, CancellationToken ct) =>
        conn.QuerySingleOrDefaultAsync<CourseGroup>(new CommandDefinition(
            $"SELECT {SelectColumns} FROM CourseGroup g WHERE g.pkid = @pkid;",
            new { pkid }, tx, cancellationToken: ct));

    public async Task<IEnumerable<CourseGroup>> GetAllAsync(CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var sql = $@"SELECT {SelectColumns} FROM CourseGroup g ORDER BY g.pkid ASC;";
        return await conn.QueryAsync<CourseGroup>(new CommandDefinition(sql, cancellationToken: ct));
    }

    public async Task<IEnumerable<CourseGroup>> QueryAsync(CourseGroupQuery query, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        var where = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            where.Add("g.Description LIKE @kw");
            p.Add("kw", $"%{query.Keyword.Trim()}%");
        }

        var whereSql = where.Count > 0 ? $"WHERE {string.Join(" AND ", where)}" : string.Empty;
        var sql = $@"SELECT {SelectColumns} FROM CourseGroup g {whereSql} ORDER BY g.pkid ASC;";
        return await conn.QueryAsync<CourseGroup>(new CommandDefinition(sql, p, cancellationToken: ct));
    }

    public async Task<CourseGroup?> GetByIdAsync(short pkid, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var sql = $@"SELECT {SelectColumns} FROM CourseGroup g WHERE g.pkid = @pkid;";
        return await conn.QuerySingleOrDefaultAsync<CourseGroup>(
            new CommandDefinition(sql, new { pkid }, cancellationToken: ct));
    }

    public async Task<CourseGroup> CreateAsync(CourseGroupRequest request, CancellationToken ct = default)
    {
        // Transaction spans the INSERT and its audit row so neither can exist without the other.
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // pkid is smallint IDENTITY — excluded from the INSERT; return the new key.
        const string insertSql = @"
            INSERT INTO CourseGroup (Description)
            VALUES (@Description);
            SELECT CAST(SCOPE_IDENTITY() AS smallint);";
        var pkid = await conn.ExecuteScalarAsync<short>(new CommandDefinition(
            insertSql, request, tx, cancellationToken: ct));

        var created = new CourseGroup
        {
            Pkid = pkid,
            Description = request.Description
        };

        await _audit.LogInsertAsync(conn, tx, TableName, created, ct);
        tx.Commit();
        return created;
    }

    public async Task<bool> UpdateAsync(CourseGroupRequest request, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // The "before" image feeds the audit's changed-column list; a missing row returns false,
        // and the disposed (uncommitted) transaction rolls back with no audit row written.
        var before = await SnapshotAsync(conn, tx, request.Pkid, ct);
        if (before is null) return false;

        // pkid is the immutable identity key; only Description is mutable.
        const string updateSql = @"
            UPDATE CourseGroup
               SET Description = @Description
             WHERE pkid = @Pkid;";
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            updateSql, request, tx, cancellationToken: ct));
        if (affected == 0) return false;

        var after = await SnapshotAsync(conn, tx, request.Pkid, ct);
        await _audit.LogUpdateAsync(conn, tx, TableName, before, after!, ct);
        tx.Commit();
        return true;
    }

    public async Task<bool> DeleteAsync(short pkid, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // Load first — after the DELETE the row's Description (the audit ActionDesc) is gone.
        var row = await SnapshotAsync(conn, tx, pkid, ct);
        if (row is null) return false;

        // FK_Course_CourseGroup is ON DELETE CASCADE: any Course rows in this group are deleted
        // along with it (no 547 raised). FK_PartnerCourseGroup_CourseGroup does NOT cascade, so a
        // group still used by a PartnerCourseGroup row raises SqlException 547 → 409 in the
        // controller; the exception rolls the transaction back, so no audit row is left behind.
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM CourseGroup WHERE pkid = @pkid;",
            new { pkid }, tx, cancellationToken: ct));
        if (affected == 0) return false;

        await _audit.LogDeleteAsync(conn, tx, TableName, row, ct);
        tx.Commit();
        return true;
    }
}
