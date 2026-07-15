using System.Data;
using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class AppUserRepository : IAppUserRepository
{
    private readonly IDbConnectionFactory _factory;
    private readonly ISysConfigRepository _sysConfig;

    public AppUserRepository(IDbConnectionFactory factory, ISysConfigRepository sysConfig)
    {
        _factory = factory;
        _sysConfig = sysConfig;
    }

    // PasswordHash is NEVER in a SELECT list — it must not reach a client.
    // No nchar columns -> no RTRIM.
    private const string SelectColumns = @"
        u.pkid, u.UserId, u.UserName, u.IsActive, u.PasswordUpdatedTime,
        (SELECT COUNT(*) FROM AppUserRole ur WHERE ur.UserId = u.UserId) AS RoleCount";

    public async Task<IEnumerable<AppUser>> GetAllAsync(CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var sql = $@"SELECT {SelectColumns} FROM AppUser u ORDER BY u.UserId ASC;";
        return await conn.QueryAsync<AppUser>(new CommandDefinition(sql, cancellationToken: ct));
    }

    public async Task<IEnumerable<AppUser>> QueryAsync(AppUserQuery query, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        var where = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            where.Add("(u.UserId LIKE @kw OR u.UserName LIKE @kw)");
            p.Add("kw", $"%{query.Keyword.Trim()}%");
        }

        if (query.IsActive.HasValue)
        {
            where.Add("u.IsActive = @IsActive");
            p.Add("IsActive", query.IsActive.Value);
        }

        if (!string.IsNullOrWhiteSpace(query.RoleId))
        {
            // N-N filter across the junction.
            where.Add("EXISTS (SELECT 1 FROM AppUserRole ur WHERE ur.UserId = u.UserId AND ur.RoleId = @RoleId)");
            p.Add("RoleId", query.RoleId.Trim());
        }

        var whereSql = where.Count > 0 ? $"WHERE {string.Join(" AND ", where)}" : string.Empty;
        var sql = $@"SELECT {SelectColumns} FROM AppUser u {whereSql} ORDER BY u.UserId ASC;";
        return await conn.QueryAsync<AppUser>(new CommandDefinition(sql, p, cancellationToken: ct));
    }

    public async Task<AppUser?> GetByIdAsync(string userId, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        var sql = $@"SELECT {SelectColumns} FROM AppUser u WHERE u.UserId = @userId;";
        var user = await conn.QuerySingleOrDefaultAsync<AppUser>(
            new CommandDefinition(sql, new { userId }, cancellationToken: ct));
        if (user is null) return null;

        var roleIds = await conn.QueryAsync<string>(new CommandDefinition(
            "SELECT RoleId FROM AppUserRole WHERE UserId = @userId ORDER BY RoleId ASC;",
            new { userId }, cancellationToken: ct));
        user.RoleIds = roleIds.ToList();
        return user;
    }

    public async Task<bool> ExistsAsync(string userId, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var count = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(1) FROM AppUser WHERE UserId = @userId;",
            new { userId }, cancellationToken: ct));
        return count > 0;
    }

    public async Task<AppUser> CreateAsync(AppUserRequest request, CancellationToken ct = default)
    {
        // Derived server-side from SysConfig['appConfig'].defaultPassword — never from the request
        // (AppUserRequest has no PasswordHash property to bind). Throws rather than falling back to
        // a guessable password if the config is missing.
        var passwordHash = PasswordHasher.Hash(await _sysConfig.GetDefaultPasswordAsync(ct));

        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // PasswordUpdatedTime is written as NULL: the account is still on the default password and
        // has never chosen one. appConfig sets enforcePasswordPolicy, so NULL is the signal a login
        // app can use to force a change on first sign-in.
        const string insertSql = @"
            INSERT INTO AppUser (UserId, UserName, IsActive, PasswordHash, PasswordUpdatedTime)
            VALUES (@UserId, @UserName, @IsActive, @PasswordHash, NULL);
            SELECT CAST(SCOPE_IDENTITY() AS int);";
        var pkid = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            insertSql,
            new { request.UserId, request.UserName, request.IsActive, PasswordHash = passwordHash },
            tx, cancellationToken: ct));

        await ReplaceRolesAsync(conn, tx, request.UserId, request.RoleIds, ct);
        tx.Commit();

        return new AppUser
        {
            Pkid = pkid,
            UserId = request.UserId,
            UserName = request.UserName,
            IsActive = request.IsActive,
            PasswordUpdatedTime = null,
            RoleCount = request.RoleIds.Distinct().Count(),
            RoleIds = request.RoleIds
        };
    }

    public async Task<bool> UpdateAsync(AppUserRequest request, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // UserId is the immutable logical key. PasswordHash and PasswordUpdatedTime are absent from
        // the SET list by design — an update must never alter the password. A reset flows through a
        // dedicated endpoint (not built yet; see spec/auth/AppUser.md).
        const string updateSql = @"
            UPDATE AppUser
               SET UserName = @UserName,
                   IsActive = @IsActive
             WHERE UserId = @UserId;";
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            updateSql, request, tx, cancellationToken: ct));

        if (affected == 0)
        {
            tx.Rollback();
            return false;
        }

        await ReplaceRolesAsync(conn, tx, request.UserId, request.RoleIds, ct);
        tx.Commit();
        return true;
    }

    public async Task<bool> DeleteAsync(string userId, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // FK_AppUserRole_AppUser does NOT cascade, so the junction rows must go first
        // (same as AppRoleRepository.DeleteAsync).
        await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM AppUserRole WHERE UserId = @userId;",
            new { userId }, tx, cancellationToken: ct));
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM AppUser WHERE UserId = @userId;",
            new { userId }, tx, cancellationToken: ct));

        tx.Commit();
        return affected > 0;
    }

    /// <summary>N-N sync: delete-then-reinsert the AppUserRole rows for a user.</summary>
    /// <remarks>
    /// Mirrors <c>AppRoleRepository.ReplaceUsersAsync</c> but keyed on UserId, so the two sides of
    /// the same junction are complementary rather than conflicting. AppUserRole.pkid is IDENTITY →
    /// excluded from the INSERT.
    /// </remarks>
    private static async Task ReplaceRolesAsync(
        IDbConnection conn, IDbTransaction tx, string userId, List<string> roleIds, CancellationToken ct)
    {
        await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM AppUserRole WHERE UserId = @userId;",
            new { userId }, tx, cancellationToken: ct));

        var distinct = roleIds.Where(r => !string.IsNullOrWhiteSpace(r)).Distinct().ToList();
        if (distinct.Count == 0) return;

        await conn.ExecuteAsync(new CommandDefinition(
            "INSERT INTO AppUserRole (UserId, RoleId) VALUES (@userId, @RoleId);",
            distinct.Select(r => new { userId, RoleId = r }), tx, cancellationToken: ct));
    }
}
