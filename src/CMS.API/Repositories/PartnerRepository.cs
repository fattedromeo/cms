using System.Data;
using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Services;
using Dapper;

namespace CMS.API.Repositories;

public sealed class PartnerRepository : IPartnerRepository
{
    private const string TableName = "Partner";

    private readonly IDbConnectionFactory _factory;
    private readonly IRowAuditWriter _audit;

    public PartnerRepository(IDbConnectionFactory factory, IRowAuditWriter audit)
    {
        _factory = factory;
        _audit = audit;
    }

    // No nchar columns → no RTRIM needed; no FK JOINs (Partner has no FKs).
    private const string SelectColumns =
        "p.pkid, p.Name, p.AppKey, p.NameOnPartnerMenu, p.NameOnCourseDetailPage, p.DisplayOrder, p.ImageFilename";

    /// <summary>Row image on the caller's connection/transaction — the audit before/after compare.</summary>
    private static Task<Partner?> SnapshotAsync(
        IDbConnection conn, IDbTransaction tx, short pkid, CancellationToken ct) =>
        conn.QuerySingleOrDefaultAsync<Partner>(new CommandDefinition(
            $"SELECT {SelectColumns} FROM Partner p WHERE p.pkid = @pkid;",
            new { pkid }, tx, cancellationToken: ct));

    public async Task<IEnumerable<Partner>> GetAllAsync(CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        // DisplayOrder has few distinct values (heavy ties) — p.pkid breaks ties deterministically
        // instead of relying on incidental heap/index order, which is not guaranteed stable.
        var sql = $@"SELECT {SelectColumns} FROM Partner p ORDER BY p.DisplayOrder ASC, p.pkid ASC;";
        return await conn.QueryAsync<Partner>(new CommandDefinition(sql, cancellationToken: ct));
    }

    public async Task<IEnumerable<Partner>> QueryAsync(PartnerQuery query, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        var where = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            where.Add(@"(p.Name LIKE @kw OR p.AppKey LIKE @kw
                        OR p.NameOnPartnerMenu LIKE @kw OR p.NameOnCourseDetailPage LIKE @kw)");
            p.Add("kw", $"%{query.Keyword.Trim()}%");
        }

        var whereSql = where.Count > 0 ? $"WHERE {string.Join(" AND ", where)}" : string.Empty;
        var sql = $@"SELECT {SelectColumns} FROM Partner p {whereSql} ORDER BY p.DisplayOrder ASC, p.pkid ASC;";
        return await conn.QueryAsync<Partner>(new CommandDefinition(sql, p, cancellationToken: ct));
    }

    public async Task<Partner?> GetByIdAsync(short pkid, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var sql = $@"SELECT {SelectColumns} FROM Partner p WHERE p.pkid = @pkid;";
        return await conn.QuerySingleOrDefaultAsync<Partner>(
            new CommandDefinition(sql, new { pkid }, cancellationToken: ct));
    }

    public async Task<Partner> CreateAsync(PartnerRequest request, CancellationToken ct = default)
    {
        // Transaction spans the INSERT and its audit row so neither can exist without the other.
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // pkid is smallint IDENTITY — excluded from the INSERT; return the new key.
        const string insertSql = @"
            INSERT INTO Partner (Name, AppKey, NameOnPartnerMenu, NameOnCourseDetailPage, DisplayOrder, ImageFilename)
            VALUES (@Name, @AppKey, @NameOnPartnerMenu, @NameOnCourseDetailPage, @DisplayOrder, @ImageFilename);
            SELECT CAST(SCOPE_IDENTITY() AS smallint);";
        var pkid = await conn.ExecuteScalarAsync<short>(new CommandDefinition(
            insertSql, request, tx, cancellationToken: ct));

        var created = new Partner
        {
            Pkid = pkid,
            Name = request.Name,
            AppKey = request.AppKey,
            NameOnPartnerMenu = request.NameOnPartnerMenu,
            NameOnCourseDetailPage = request.NameOnCourseDetailPage,
            DisplayOrder = request.DisplayOrder,
            ImageFilename = request.ImageFilename
        };

        await _audit.LogInsertAsync(conn, tx, TableName, created, ct);
        tx.Commit();
        return created;
    }

    public async Task<bool> UpdateAsync(PartnerRequest request, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // The "before" image feeds the audit's changed-column list; a missing row returns false,
        // and the disposed (uncommitted) transaction rolls back with no audit row written.
        var before = await SnapshotAsync(conn, tx, request.Pkid, ct);
        if (before is null) return false;

        // pkid is the immutable identity key; update the mutable columns by pkid.
        const string updateSql = @"
            UPDATE Partner
               SET Name = @Name,
                   AppKey = @AppKey,
                   NameOnPartnerMenu = @NameOnPartnerMenu,
                   NameOnCourseDetailPage = @NameOnCourseDetailPage,
                   DisplayOrder = @DisplayOrder,
                   ImageFilename = @ImageFilename
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

        // Load first — after the DELETE the row's Name (the audit ActionDesc) is gone.
        var row = await SnapshotAsync(conn, tx, pkid, ct);
        if (row is null) return false;

        // A FK violation (Course/Certification/PartnerCourseGroup still referencing this partner)
        // surfaces as SqlException 547 and is translated to 409 by the controller; the exception
        // unwinds through the using blocks, so the transaction rolls back and no audit row is left.
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM Partner WHERE pkid = @pkid;",
            new { pkid }, tx, cancellationToken: ct));
        if (affected == 0) return false;

        await _audit.LogDeleteAsync(conn, tx, TableName, row, ct);
        tx.Commit();
        return true;
    }
}
