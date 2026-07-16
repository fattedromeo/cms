using System.Data;

namespace CMS.API.Services;

/// <summary>
/// Cross-cutting row-audit writer: one <c>RowAudit</c> row per Insert/Update/Delete on any
/// business table. Repositories call it after their own write succeeds; it works for any entity
/// type via reflection, so there is exactly one implementation rather than one per table.
/// </summary>
/// <remarks>
/// The acting user's name is read from the current request's JWT (the <c>name</c> claim emitted by
/// <see cref="JwtTokenService"/>); with no authenticated user the row says <c>"system"</c>.
/// Repositories use the connection-bound overloads so the audit INSERT joins the operation's own
/// connection/transaction — a rolled-back or failed change then leaves no audit row.
/// </remarks>
public interface IRowAuditWriter
{
    /// <summary>
    /// Logs an Insert. ActionDesc is the value of the entity's first string-typed property in
    /// declaration order (typically a Name/Title/Code field).
    /// </summary>
    Task LogInsertAsync(string tableName, object entity, CancellationToken ct = default);

    /// <summary>
    /// Logs an Update. ActionDesc is a comma-separated list of the property names whose value
    /// differs between <paramref name="before"/> and <paramref name="after"/> (same type, compared
    /// property by property). If nothing changed, no row is written at all.
    /// </summary>
    Task LogUpdateAsync(string tableName, object before, object after, CancellationToken ct = default);

    /// <summary>
    /// Logs a Delete. ActionDesc follows the same first-string-property rule as
    /// <see cref="LogInsertAsync"/>.
    /// </summary>
    Task LogDeleteAsync(string tableName, object entity, CancellationToken ct = default);

    /// <summary>
    /// <see cref="LogInsertAsync(string, object, CancellationToken)"/> on the caller's
    /// connection/transaction, so the audit row commits and rolls back with the change itself.
    /// </summary>
    Task LogInsertAsync(IDbConnection connection, IDbTransaction? transaction,
        string tableName, object entity, CancellationToken ct = default);

    /// <summary>
    /// <see cref="LogUpdateAsync(string, object, object, CancellationToken)"/> on the caller's
    /// connection/transaction.
    /// </summary>
    Task LogUpdateAsync(IDbConnection connection, IDbTransaction? transaction,
        string tableName, object before, object after, CancellationToken ct = default);

    /// <summary>
    /// <see cref="LogDeleteAsync(string, object, CancellationToken)"/> on the caller's
    /// connection/transaction.
    /// </summary>
    Task LogDeleteAsync(IDbConnection connection, IDbTransaction? transaction,
        string tableName, object entity, CancellationToken ct = default);
}
