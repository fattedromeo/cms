using System.Data;
using System.Security.Claims;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.AspNetCore.Http;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// Proves the RowAudit retrofit on one repository (<see cref="PublishStatusRepository"/> — the
/// simplest of the seven, so the audit wiring is the only moving part). The real repository runs
/// its real SQL against the shared <see cref="FakeDb"/>; the tests assert which RowAudit INSERT
/// each path produces, that it shares the operation's transaction, and that a failed change
/// produces none at all.
/// </summary>
public class PublishStatusRepositoryAuditTests
{
    // --- Insert --------------------------------------------------------------

    [Fact]
    public async Task Create_WritesInsertAuditRow_WithFirstStringColumn_InSameTransaction()
    {
        var db = new FakeDb();
        var repo = CreateRepo(db);

        await repo.CreateAsync(new PublishStatusRequest
        {
            Pkid = 9,
            Description = "審核中",
            IsDraft = true
        });

        var audit = Assert.Single(db.AuditInserts);
        Assert.Equal("PublishStatus", audit.Parameters["TableName"]);
        Assert.Equal("Insert", audit.Parameters["ActionType"]);
        Assert.Equal("9", audit.Parameters["PrimaryKeyValues"]);
        Assert.Equal("審核中", audit.Parameters["ActionDesc"]);
        Assert.Equal("alice", audit.Parameters["UserName"]);

        // The audit row follows the business INSERT and both ride the one committed transaction.
        var insertIndex = db.Executed.FindIndex(c => c.Sql.Contains("INSERT INTO PublishStatus"));
        var auditIndex = db.Executed.FindIndex(c => c.Sql.Contains("INSERT INTO RowAudit"));
        Assert.True(insertIndex >= 0 && insertIndex < auditIndex);
        var tx = Assert.Single(db.Transactions);
        Assert.True(tx.Committed);
    }

    // --- Update --------------------------------------------------------------

    [Fact]
    public async Task Update_WritesUpdateAuditRow_ListingExactlyTheChangedColumns()
    {
        var db = new FakeDb();
        // The repository snapshots the row twice on its own transaction — before and after the
        // UPDATE. First SELECT answers with the old image, second with the new one.
        var snapshots = new Queue<DataTable>([
            StatusRow(2, "草稿", isDraft: true, isPublished: false, isDiscontinued: false),
            StatusRow(2, "已發布", isDraft: false, isPublished: true, isDiscontinued: false)
        ]);
        db.QueryHandler = _ => snapshots.Dequeue();
        var repo = CreateRepo(db);

        var ok = await repo.UpdateAsync(new PublishStatusRequest
        {
            Pkid = 2,
            Description = "已發布",
            IsPublished = true
        });

        Assert.True(ok);
        var audit = Assert.Single(db.AuditInserts);
        Assert.Equal("Update", audit.Parameters["ActionType"]);
        Assert.Equal("2", audit.Parameters["PrimaryKeyValues"]);
        // Exactly the changed columns, in the model's declaration order — Pkid unchanged, so absent.
        Assert.Equal("Description, IsDraft, IsPublished", audit.Parameters["ActionDesc"]);
        Assert.True(Assert.Single(db.Transactions).Committed);
    }

    // --- Delete --------------------------------------------------------------

    [Fact]
    public async Task Delete_WritesDeleteAuditRow_WithTheRowsFirstStringColumn()
    {
        var db = new FakeDb();
        db.QueryHandler = _ => StatusRow(3, "已下架", isDraft: false, isPublished: false, isDiscontinued: true);
        var repo = CreateRepo(db, userName: "bob");

        var ok = await repo.DeleteAsync(3);

        Assert.True(ok);
        var audit = Assert.Single(db.AuditInserts);
        Assert.Equal("PublishStatus", audit.Parameters["TableName"]);
        Assert.Equal("Delete", audit.Parameters["ActionType"]);
        Assert.Equal("3", audit.Parameters["PrimaryKeyValues"]);
        Assert.Equal("已下架", audit.Parameters["ActionDesc"]);
        Assert.Equal("bob", audit.Parameters["UserName"]);

        // The row is loaded BEFORE the DELETE — afterwards its Description would be gone.
        var snapshotIndex = db.Executed.FindIndex(c => c.Sql.TrimStart().StartsWith("SELECT"));
        var deleteIndex = db.Executed.FindIndex(c => c.Sql.Contains("DELETE FROM PublishStatus"));
        Assert.True(snapshotIndex >= 0 && snapshotIndex < deleteIndex);
        Assert.True(Assert.Single(db.Transactions).Committed);
    }

    // --- Failure paths: no audit row may survive -------------------------------

    [Fact]
    public async Task Update_AffectingNoRows_WritesNoAuditRow_AndDoesNotCommit()
    {
        var db = new FakeDb();
        db.QueryHandler = _ => StatusRow(2, "草稿", isDraft: true, isPublished: false, isDiscontinued: false);
        // The row vanished between snapshot and UPDATE (or the WHERE missed): 0 rows affected.
        db.NonQueryHandler = cmd => cmd.Sql.Contains("UPDATE PublishStatus") ? 0 : 1;
        var repo = CreateRepo(db);

        var ok = await repo.UpdateAsync(new PublishStatusRequest { Pkid = 2, Description = "x" });

        Assert.False(ok);
        Assert.Empty(db.AuditInserts);
        Assert.False(Assert.Single(db.Transactions).Committed);
    }

    [Fact]
    public async Task Update_OfMissingRow_WritesNoAuditRow_AndRunsNoUpdate()
    {
        var db = new FakeDb();
        // No QueryHandler → the before-snapshot returns nothing.
        var repo = CreateRepo(db);

        var ok = await repo.UpdateAsync(new PublishStatusRequest { Pkid = 99, Description = "x" });

        Assert.False(ok);
        Assert.Empty(db.AuditInserts);
        Assert.DoesNotContain(db.Executed, c => c.Sql.Contains("UPDATE PublishStatus"));
        Assert.False(Assert.Single(db.Transactions).Committed);
    }

    [Fact]
    public async Task Create_ThatThrows_WritesNoAuditRow_AndDoesNotCommit()
    {
        var db = new FakeDb();
        // The INSERT itself fails (e.g. duplicate user-assigned pkid → PK violation).
        db.NonQueryHandler = cmd => cmd.Sql.Contains("INSERT INTO PublishStatus")
            ? throw new InvalidOperationException("PK violation")
            : 1;
        var repo = CreateRepo(db);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            repo.CreateAsync(new PublishStatusRequest { Pkid = 2, Description = "dup" }));

        Assert.Empty(db.AuditInserts);
        Assert.False(Assert.Single(db.Transactions).Committed);
    }

    [Fact]
    public async Task Delete_AffectingNoRows_WritesNoAuditRow_AndDoesNotCommit()
    {
        var db = new FakeDb();
        db.QueryHandler = _ => StatusRow(3, "已下架", isDraft: false, isPublished: false, isDiscontinued: true);
        db.NonQueryHandler = cmd => cmd.Sql.Contains("DELETE FROM PublishStatus") ? 0 : 1;
        var repo = CreateRepo(db);

        var ok = await repo.DeleteAsync(3);

        Assert.False(ok);
        Assert.Empty(db.AuditInserts);
        Assert.False(Assert.Single(db.Transactions).Committed);
    }

    // --- Harness -------------------------------------------------------------

    private static PublishStatusRepository CreateRepo(FakeDb db, string userName = "alice")
    {
        var accessor = new Mock<IHttpContextAccessor>();
        accessor.Setup(a => a.HttpContext).Returns(new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("name", userName)],
                authenticationType: "Test", nameType: "name", roleType: "role"))
        });
        return new PublishStatusRepository(db, new RowAuditWriter(db, accessor.Object));
    }

    /// <summary>One PublishStatus row as the fake reader returns it (column names as in the SELECT).</summary>
    private static DataTable StatusRow(byte pkid, string description, bool isDraft, bool isPublished, bool isDiscontinued)
    {
        var dt = new DataTable();
        dt.Columns.Add("pkid", typeof(byte));
        dt.Columns.Add("Description", typeof(string));
        dt.Columns.Add("IsDraft", typeof(bool));
        dt.Columns.Add("IsPublished", typeof(bool));
        dt.Columns.Add("IsDiscontinued", typeof(bool));
        dt.Rows.Add(pkid, description, isDraft, isPublished, isDiscontinued);
        return dt;
    }
}
