using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using CMS.API.Data;

namespace CMS.API.Tests;

/// <summary>One command Dapper executed against the fake connection: SQL text + parameter values.</summary>
public sealed record ExecutedCommand(string Sql, Dictionary<string, object?> Parameters);

/// <summary>
/// Capturing fake ADO.NET stack (factory → connection → command → transaction) so repository and
/// service tests can assert the exact SQL text and parameter values Dapper sends — no live SQL
/// Server, per the mocked-connection convention. Shared by <see cref="RowAuditWriterTests"/> and
/// the repository audit tests.
/// </summary>
/// <remarks>
/// Reads are answered by <see cref="QueryHandler"/> as a DataTable — DataTableReader is a real
/// DbDataReader, which is everything Dapper's materializer needs. Writes return
/// <see cref="NonQueryHandler"/> (default: 1 row affected). Scalar inserts (SCOPE_IDENTITY) return
/// <see cref="ScalarHandler"/>.
/// </remarks>
public sealed class FakeDb : IDbConnectionFactory
{
    /// <summary>Every command executed, in order — reads and writes both.</summary>
    public List<ExecutedCommand> Executed { get; } = [];

    /// <summary>Every transaction begun on any connection from this factory, in order.</summary>
    public List<FakeDbTransaction> Transactions { get; } = [];

    /// <summary>Answers ExecuteReader calls. Null result (or unset) → empty result set.</summary>
    public Func<ExecutedCommand, DataTable?>? QueryHandler { get; set; }

    /// <summary>Answers ExecuteNonQuery calls with the affected-row count. Defaults to 1.</summary>
    public Func<ExecutedCommand, int> NonQueryHandler { get; set; } = _ => 1;

    /// <summary>Answers ExecuteScalar calls (SCOPE_IDENTITY-style inserts). Defaults to 0.</summary>
    public Func<ExecutedCommand, object?> ScalarHandler { get; set; } = _ => 0;

    /// <summary>The RowAudit INSERTs among everything executed, in order.</summary>
    public List<ExecutedCommand> AuditInserts =>
        Executed.Where(c => c.Sql.Contains("INSERT INTO RowAudit")).ToList();

    public Task<IDbConnection> CreateOpenConnectionAsync(CancellationToken ct = default) =>
        Task.FromResult<IDbConnection>(new FakeDbConnection(this));
}

public sealed class FakeDbConnection(FakeDb db) : DbConnection
{
    private ConnectionState _state = ConnectionState.Open;

    [AllowNull] public override string ConnectionString { get; set; } = string.Empty;
    public override string Database => "Fake";
    public override string DataSource => "Fake";
    public override string ServerVersion => "0.0";
    public override ConnectionState State => _state;

    public override void ChangeDatabase(string databaseName) { }
    public override void Close() => _state = ConnectionState.Closed;
    public override void Open() => _state = ConnectionState.Open;

    protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel)
    {
        var tx = new FakeDbTransaction(this, isolationLevel);
        db.Transactions.Add(tx);
        return tx;
    }

    protected override DbCommand CreateDbCommand() => new FakeDbCommand(db) { Connection = this };
}

/// <summary>Tracks Commit/Rollback so tests can assert a failed change never committed.</summary>
public sealed class FakeDbTransaction(FakeDbConnection conn, IsolationLevel isolationLevel) : DbTransaction
{
    public bool Committed { get; private set; }
    public bool RolledBack { get; private set; }

    public override IsolationLevel IsolationLevel { get; } = isolationLevel;
    protected override DbConnection DbConnection => conn;

    public override void Commit() => Committed = true;
    public override void Rollback() => RolledBack = true;
}

public sealed class FakeDbCommand(FakeDb db) : DbCommand
{
    private readonly FakeParameterCollection _parameters = [];

    [AllowNull] public override string CommandText { get; set; } = string.Empty;
    public override int CommandTimeout { get; set; }
    public override CommandType CommandType { get; set; }
    public override bool DesignTimeVisible { get; set; }
    public override UpdateRowSource UpdatedRowSource { get; set; }
    protected override DbConnection? DbConnection { get; set; }
    protected override DbParameterCollection DbParameterCollection => _parameters;
    protected override DbTransaction? DbTransaction { get; set; }

    public override void Cancel() { }
    public override void Prepare() { }

    public override int ExecuteNonQuery() => db.NonQueryHandler(Record());

    public override Task<int> ExecuteNonQueryAsync(CancellationToken cancellationToken) =>
        Task.FromResult(ExecuteNonQuery());

    public override object? ExecuteScalar() => db.ScalarHandler(Record());

    protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior) =>
        (db.QueryHandler?.Invoke(Record()) ?? new DataTable()).CreateDataReader();

    protected override DbParameter CreateDbParameter() => new FakeDbParameter();

    private ExecutedCommand Record()
    {
        var command = new ExecutedCommand(
            CommandText,
            _parameters.Items.ToDictionary(
                p => p.ParameterName,
                p => p.Value == DBNull.Value ? null : p.Value));
        db.Executed.Add(command);
        return command;
    }
}

public sealed class FakeDbParameter : DbParameter
{
    public override DbType DbType { get; set; }
    public override ParameterDirection Direction { get; set; }
    public override bool IsNullable { get; set; }
    [AllowNull] public override string ParameterName { get; set; } = string.Empty;
    public override int Size { get; set; }
    [AllowNull] public override string SourceColumn { get; set; } = string.Empty;
    public override bool SourceColumnNullMapping { get; set; }
    public override object? Value { get; set; }
    public override void ResetDbType() => DbType = DbType.Object;
}

public sealed class FakeParameterCollection : DbParameterCollection, IEnumerable<DbParameter>
{
    public List<DbParameter> Items { get; } = [];

    public override int Count => Items.Count;
    public override object SyncRoot => ((System.Collections.ICollection)Items).SyncRoot;

    public override int Add(object value)
    {
        Items.Add((DbParameter)value);
        return Items.Count - 1;
    }

    public void Add(DbParameter value) => Items.Add(value);
    public override void AddRange(Array values) => Items.AddRange(values.Cast<DbParameter>());
    public override void Clear() => Items.Clear();
    public override bool Contains(object value) => Items.Contains((DbParameter)value);
    public override bool Contains(string value) => Items.Any(p => p.ParameterName == value);
    public override void CopyTo(Array array, int index) => ((System.Collections.ICollection)Items).CopyTo(array, index);
    public override System.Collections.IEnumerator GetEnumerator() => Items.GetEnumerator();
    IEnumerator<DbParameter> IEnumerable<DbParameter>.GetEnumerator() => Items.GetEnumerator();
    public override int IndexOf(object value) => Items.IndexOf((DbParameter)value);
    public override int IndexOf(string parameterName) => Items.FindIndex(p => p.ParameterName == parameterName);
    public override void Insert(int index, object value) => Items.Insert(index, (DbParameter)value);
    public override void Remove(object value) => Items.Remove((DbParameter)value);
    public override void RemoveAt(int index) => Items.RemoveAt(index);
    public override void RemoveAt(string parameterName) => Items.RemoveAt(IndexOf(parameterName));
    protected override DbParameter GetParameter(int index) => Items[index];
    protected override DbParameter GetParameter(string parameterName) => Items[IndexOf(parameterName)];
    protected override void SetParameter(int index, DbParameter value) => Items[index] = value;
    protected override void SetParameter(string parameterName, DbParameter value) => Items[IndexOf(parameterName)] = value;
}
