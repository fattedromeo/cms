using System.Data;

namespace CMS.API.Data;

/// <summary>
/// Creates open ADO.NET connections for Dapper. Abstracted so repositories can be
/// unit-tested against an in-memory / fake connection without a live SQL Server.
/// </summary>
public interface IDbConnectionFactory
{
    Task<IDbConnection> CreateOpenConnectionAsync(CancellationToken ct = default);
}
