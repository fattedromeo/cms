using CMS.API.Data;
using Dapper;

namespace CMS.API.Repositories;

public sealed class AuthRepository : IAuthRepository
{
    private readonly IDbConnectionFactory _factory;

    public AuthRepository(IDbConnectionFactory factory) => _factory = factory;

    public async Task<UserCredential?> FindByUserIdAsync(string userId, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        // The ONLY SELECT in the codebase that reads PasswordHash. It feeds the comparison in
        // AuthController and stops there — no DTO can carry it outwards.
        // No nchar columns here -> no RTRIM needed.
        const string sql = @"
            SELECT u.UserId, u.UserName, u.PasswordHash, u.IsActive
              FROM AppUser u
             WHERE u.UserId = @userId;";

        var row = await conn.QuerySingleOrDefaultAsync<CredentialRow>(
            new CommandDefinition(sql, new { userId }, cancellationToken: ct));
        if (row is null) return null;

        // Keyed on the STORED UserId, not the supplied one: the collation is case-insensitive, so
        // the two can differ in case and only the stored value is guaranteed to match the junction.
        var roleIds = await conn.QueryAsync<string>(new CommandDefinition(
            "SELECT RoleId FROM AppUserRole WHERE UserId = @userId ORDER BY RoleId ASC;",
            new { userId = row.UserId }, cancellationToken: ct));

        return new UserCredential(row.UserId, row.UserName, row.PasswordHash, row.IsActive, roleIds.ToList());
    }

    public async Task<bool> UpdateUserNameAsync(string userId, string userName, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        // UserName is the ONLY column in the SET list. UserId is the key (immutable), and IsActive /
        // PasswordHash / PasswordUpdatedTime are absent by design — a self-service rename must not be
        // able to re-enable a disabled account or disturb the password. Roles live in AppUserRole and
        // are not touched at all.
        const string sql = @"
            UPDATE AppUser
               SET UserName = @userName
             WHERE UserId = @userId;";

        var affected = await conn.ExecuteAsync(new CommandDefinition(
            sql, new { userId, userName }, cancellationToken: ct));
        return affected > 0;
    }

    public async Task<bool> UpdatePasswordAsync(
        string userId, string passwordHash, DateTime? updatedAtUtc, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        // PasswordHash + PasswordUpdatedTime only. UserName / IsActive stay out of the SET list, and
        // roles are untouched. The timestamp is passed in rather than taken from SQL's GETDATE() so
        // that (a) it is unambiguously UTC — GETDATE() would be the DB server's local clock —
        // (b) the controller test can assert it was set, and (c) a NULL is expressible at all, which
        // GETDATE() could not do. A null DateTime? binds to SQL NULL, which is what a reset-to-
        // default writes; see the interface docs for why that is not merely "no audit value".
        const string sql = @"
            UPDATE AppUser
               SET PasswordHash = @passwordHash,
                   PasswordUpdatedTime = @updatedAtUtc
             WHERE UserId = @userId;";

        var affected = await conn.ExecuteAsync(new CommandDefinition(
            sql, new { userId, passwordHash, updatedAtUtc }, cancellationToken: ct));
        return affected > 0;
    }

    /// <summary>Dapper landing type. Private: the hash must not travel further than this file's mapping.</summary>
    private sealed class CredentialRow
    {
        public string UserId { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public bool IsActive { get; set; }
    }
}
