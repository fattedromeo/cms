using System.Data;
using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Services;
using Dapper;

namespace CMS.API.Repositories;

public sealed class AppRoleRepository : IAppRoleRepository
{
    private const string TableName = "AppRole";

    private readonly IDbConnectionFactory _factory;
    private readonly IRowAuditWriter _audit;

    public AppRoleRepository(IDbConnectionFactory factory, IRowAuditWriter audit)
    {
        _factory = factory;
        _audit = audit;
    }

    private const string SelectColumns = @"
        r.pkid, r.RoleId, r.RoleName, r.PermissionLevel, r.Description,
        (SELECT COUNT(*) FROM AppUserRole ur WHERE ur.RoleId = r.RoleId) AS UserCount";

    /// <summary>
    /// Row image on the caller's connection/transaction — the audit before/after compare. Selects
    /// the real AppRole columns plus the junction UserIds (membership is edited through this form,
    /// so it belongs in the changed-column list), but NOT the derived UserCount — it moves in
    /// lockstep with UserIds and would report every membership change twice.
    /// </summary>
    private static async Task<AppRole?> SnapshotAsync(
        IDbConnection conn, IDbTransaction tx, string roleId, CancellationToken ct)
    {
        var role = await conn.QuerySingleOrDefaultAsync<AppRole>(new CommandDefinition(
            "SELECT r.pkid, r.RoleId, r.RoleName, r.PermissionLevel, r.Description FROM AppRole r WHERE r.RoleId = @roleId;",
            new { roleId }, tx, cancellationToken: ct));
        if (role is null) return null;

        var userIds = await conn.QueryAsync<string>(new CommandDefinition(
            "SELECT UserId FROM AppUserRole WHERE RoleId = @roleId ORDER BY UserId ASC;",
            new { roleId }, tx, cancellationToken: ct));
        role.UserIds = userIds.ToList();
        return role;
    }

    public async Task<IEnumerable<AppRole>> GetAllAsync(CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var sql = $@"SELECT {SelectColumns} FROM AppRole r ORDER BY r.RoleId ASC;";
        return await conn.QueryAsync<AppRole>(new CommandDefinition(sql, cancellationToken: ct));
    }

    public async Task<IEnumerable<AppRole>> QueryAsync(AppRoleQuery query, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        var where = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            where.Add("(r.RoleId LIKE @kw OR r.RoleName LIKE @kw OR r.Description LIKE @kw)");
            p.Add("kw", $"%{query.Keyword.Trim()}%");
        }

        if (query.PermissionLevel.HasValue)
        {
            where.Add("r.PermissionLevel = @PermissionLevel");
            p.Add("PermissionLevel", query.PermissionLevel.Value);
        }

        var whereSql = where.Count > 0 ? $"WHERE {string.Join(" AND ", where)}" : string.Empty;
        var sql = $@"SELECT {SelectColumns} FROM AppRole r {whereSql} ORDER BY r.RoleId ASC;";
        return await conn.QueryAsync<AppRole>(new CommandDefinition(sql, p, cancellationToken: ct));
    }

    public async Task<AppRole?> GetByIdAsync(string roleId, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        var sql = $@"SELECT {SelectColumns} FROM AppRole r WHERE r.RoleId = @roleId;";
        var role = await conn.QuerySingleOrDefaultAsync<AppRole>(
            new CommandDefinition(sql, new { roleId }, cancellationToken: ct));
        if (role is null) return null;

        var userIds = await conn.QueryAsync<string>(new CommandDefinition(
            "SELECT UserId FROM AppUserRole WHERE RoleId = @roleId ORDER BY UserId ASC;",
            new { roleId }, cancellationToken: ct));
        role.UserIds = userIds.ToList();
        return role;
    }

    public async Task<bool> ExistsAsync(string roleId, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var count = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(1) FROM AppRole WHERE RoleId = @roleId;",
            new { roleId }, cancellationToken: ct));
        return count > 0;
    }

    public async Task<AppRole> CreateAsync(AppRoleRequest request, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        const string insertSql = @"
            INSERT INTO AppRole (RoleId, RoleName, PermissionLevel, Description)
            VALUES (@RoleId, @RoleName, @PermissionLevel, @Description);
            SELECT CAST(SCOPE_IDENTITY() AS int);";
        var pkid = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            insertSql, request, tx, cancellationToken: ct));

        await ReplaceUsersAsync(conn, tx, request.RoleId, request.UserIds, ct);

        var created = new AppRole
        {
            Pkid = pkid,
            RoleId = request.RoleId,
            RoleName = request.RoleName,
            PermissionLevel = request.PermissionLevel,
            Description = request.Description,
            UserCount = request.UserIds.Count,
            UserIds = request.UserIds
        };

        await _audit.LogInsertAsync(conn, tx, TableName, created, ct);
        tx.Commit();
        return created;
    }

    public async Task<bool> UpdateAsync(AppRoleRequest request, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // The "before" image feeds the audit's changed-column list. A missing role returns false —
        // the same outcome the affected == 0 branch used to produce.
        var before = await SnapshotAsync(conn, tx, request.RoleId, ct);
        if (before is null)
        {
            tx.Rollback();
            return false;
        }

        // RoleId is the immutable logical key; update the mutable columns by RoleId.
        const string updateSql = @"
            UPDATE AppRole
               SET RoleName = @RoleName,
                   PermissionLevel = @PermissionLevel,
                   Description = @Description
             WHERE RoleId = @RoleId;";
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            updateSql, request, tx, cancellationToken: ct));

        if (affected == 0)
        {
            tx.Rollback();
            return false;
        }

        await ReplaceUsersAsync(conn, tx, request.RoleId, request.UserIds, ct);

        var after = await SnapshotAsync(conn, tx, request.RoleId, ct);
        await _audit.LogUpdateAsync(conn, tx, TableName, before, after!, ct);
        tx.Commit();
        return true;
    }

    public async Task<bool> DeleteAsync(string roleId, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // Load first — after the DELETE the row's RoleId (the audit ActionDesc) is gone. A missing
        // role short-circuits to false, which is what "DELETE affected 0 rows" reported before.
        var row = await SnapshotAsync(conn, tx, roleId, ct);
        if (row is null)
        {
            tx.Rollback();
            return false;
        }

        // Remove junction rows first to satisfy the FK, then the role itself.
        await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM AppUserRole WHERE RoleId = @roleId;",
            new { roleId }, tx, cancellationToken: ct));
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM AppRole WHERE RoleId = @roleId;",
            new { roleId }, tx, cancellationToken: ct));

        if (affected == 0)
        {
            tx.Rollback();
            return false;
        }

        await _audit.LogDeleteAsync(conn, tx, TableName, row, ct);
        tx.Commit();
        return true;
    }

    /// <summary>N-N sync: delete-then-reinsert the AppUserRole rows for a role.</summary>
    private static async Task ReplaceUsersAsync(
        IDbConnection conn, IDbTransaction tx, string roleId, List<string> userIds, CancellationToken ct)
    {
        await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM AppUserRole WHERE RoleId = @roleId;",
            new { roleId }, tx, cancellationToken: ct));

        var distinct = userIds.Where(u => !string.IsNullOrWhiteSpace(u)).Distinct().ToList();
        if (distinct.Count == 0) return;

        await conn.ExecuteAsync(new CommandDefinition(
            "INSERT INTO AppUserRole (UserId, RoleId) VALUES (@UserId, @roleId);",
            distinct.Select(u => new { UserId = u, roleId }), tx, cancellationToken: ct));
    }
}
