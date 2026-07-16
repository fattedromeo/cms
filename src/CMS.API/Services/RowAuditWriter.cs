using System.Collections;
using System.Data;
using System.Globalization;
using System.Reflection;
using CMS.API.Data;
using Dapper;
using Microsoft.IdentityModel.JsonWebTokens;

namespace CMS.API.Services;

/// <summary>Reflection-based <see cref="IRowAuditWriter"/> backed by Dapper. See the interface.</summary>
public sealed class RowAuditWriter : IRowAuditWriter
{
    // Column widths from database/admin.sql — values are truncated to fit rather than letting the
    // audit INSERT throw (an oversized Note in ActionDesc must not fail the business write).
    private const int TableNameMaxLength = 50;          // varchar(50)
    private const int UserNameMaxLength = 100;          // nvarchar(100)
    private const int PrimaryKeyValuesMaxLength = 100;  // nvarchar(100)
    private const int ActionDescMaxLength = 1000;       // varchar(1000)

    /// <summary>Written as UserName when the request has no authenticated user.</summary>
    public const string SystemUserName = "system";

    private readonly IDbConnectionFactory _factory;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public RowAuditWriter(IDbConnectionFactory factory, IHttpContextAccessor httpContextAccessor)
    {
        _factory = factory;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task LogInsertAsync(string tableName, object entity, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        await LogInsertAsync(conn, null, tableName, entity, ct);
    }

    public async Task LogUpdateAsync(string tableName, object before, object after, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        await LogUpdateAsync(conn, null, tableName, before, after, ct);
    }

    public async Task LogDeleteAsync(string tableName, object entity, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        await LogDeleteAsync(conn, null, tableName, entity, ct);
    }

    public Task LogInsertAsync(IDbConnection connection, IDbTransaction? transaction,
        string tableName, object entity, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(entity);
        return WriteRowAsync(connection, transaction,
            tableName, "Insert", GetPkidAsString(entity), FirstStringPropertyValue(entity), ct);
    }

    public async Task LogUpdateAsync(IDbConnection connection, IDbTransaction? transaction,
        string tableName, object before, object after, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(before);
        ArgumentNullException.ThrowIfNull(after);
        if (before.GetType() != after.GetType())
            throw new ArgumentException(
                $"before ({before.GetType().Name}) and after ({after.GetType().Name}) must be the same entity type.",
                nameof(after));

        var changed = GetChangedPropertyNames(before, after);
        // Nothing changed → no row: an "Update, nothing changed" entry is noise, not audit trail.
        if (changed.Count == 0) return;

        await WriteRowAsync(connection, transaction,
            tableName, "Update", GetPkidAsString(after), string.Join(", ", changed), ct);
    }

    public Task LogDeleteAsync(IDbConnection connection, IDbTransaction? transaction,
        string tableName, object entity, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(entity);
        return WriteRowAsync(connection, transaction,
            tableName, "Delete", GetPkidAsString(entity), FirstStringPropertyValue(entity), ct);
    }

    private async Task WriteRowAsync(IDbConnection conn, IDbTransaction? tx,
        string tableName, string actionType, string primaryKeyValues, string? actionDesc, CancellationToken ct)
    {
        // pkid is IDENTITY — never in the column list. The connection/transaction belong to the
        // caller (repositories pass their own so the audit row rolls back with the change); this
        // method must not dispose them.
        const string sql = @"
            INSERT INTO RowAudit (TableName, UserName, PrimaryKeyValues, ActionType, ActionDesc, [DateTime])
            VALUES (@TableName, @UserName, @PrimaryKeyValues, @ActionType, @ActionDesc, @DateTime);";

        await conn.ExecuteAsync(new CommandDefinition(sql, new
        {
            TableName = Truncate(tableName, TableNameMaxLength),
            UserName = Truncate(ResolveUserName(), UserNameMaxLength),
            PrimaryKeyValues = Truncate(primaryKeyValues, PrimaryKeyValuesMaxLength),
            ActionType = actionType,
            ActionDesc = actionDesc is null ? null : Truncate(actionDesc, ActionDescMaxLength),
            DateTime = DateTime.Now
        }, tx, cancellationToken: ct));
    }

    /// <summary>
    /// The signed-in user's UserName from the current request's JWT. MapInboundClaims is off
    /// (Program.cs), so the claim type is the raw <c>name</c> JwtTokenService emitted — not the
    /// ClaimTypes.Name schema URI.
    /// </summary>
    private string ResolveUserName()
    {
        var user = _httpContextAccessor.HttpContext?.User;
        if (user?.Identity?.IsAuthenticated != true) return SystemUserName;

        var name = user.FindFirst(JwtRegisteredClaimNames.Name)?.Value ?? user.Identity.Name;
        return string.IsNullOrWhiteSpace(name) ? SystemUserName : name;
    }

    private static string GetPkidAsString(object entity)
    {
        var prop = entity.GetType().GetProperty(
                "pkid", BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase)
            ?? throw new ArgumentException(
                $"{entity.GetType().Name} has no pkid property to audit.", nameof(entity));
        return Convert.ToString(prop.GetValue(entity), CultureInfo.InvariantCulture) ?? string.Empty;
    }

    private static string? FirstStringPropertyValue(object entity) =>
        AuditableProperties(entity.GetType())
            .FirstOrDefault(p => p.PropertyType == typeof(string))
            ?.GetValue(entity) as string;

    private static List<string> GetChangedPropertyNames(object before, object after) =>
        AuditableProperties(before.GetType())
            .Where(p => !ValuesEqual(p.GetValue(before), p.GetValue(after)))
            .Select(p => p.Name)
            .ToList();

    // MetadataToken ordering pins "declaration order" down — reflection's default property order is
    // unspecified, and the first-string-property rule depends on it.
    private static IEnumerable<PropertyInfo> AuditableProperties(Type type) =>
        type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.CanRead && p.GetIndexParameters().Length == 0)
            .OrderBy(p => p.MetadataToken);

    private static bool ValuesEqual(object? a, object? b)
    {
        if (ReferenceEquals(a, b)) return true;
        if (a is null || b is null) return false;
        // Collections (the N-N List<int> pkid properties) compare by content — two reads of the same
        // row yield distinct List instances, and reference equality would flag every one as changed.
        if (a is IEnumerable ea && b is IEnumerable eb && a is not string && b is not string)
            return ea.Cast<object?>().SequenceEqual(eb.Cast<object?>());
        return Equals(a, b);
    }

    private static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength];
}
