using System.Security.Claims;
using CMS.API.Services;
using Microsoft.AspNetCore.Http;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// Unit tests for <see cref="RowAuditWriter"/>'s reflection logic. The shared <see cref="FakeDb"/>
/// stack stands in for SQL Server, so the assertions run against the exact SQL text and parameter
/// values Dapper would send — no live DB, per the mocked-connection convention.
/// </summary>
public class RowAuditWriterTests
{
    // Property declaration order matters to the tests: Quantity (non-string) precedes Name, proving
    // the rule is "first STRING property", not "first property"; Note is a later string that must
    // never be picked while Name exists.
    private sealed class Widget
    {
        public int Pkid { get; set; }
        public int Quantity { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Note { get; set; }
        public bool IsActive { get; set; }
        public List<int> TagIds { get; set; } = [];
    }

    private sealed class LowerCasePkidEntity
    {
        public int pkid { get; set; }
        public string Code { get; set; } = string.Empty;
    }

    // --- LogInsert ---------------------------------------------------------

    [Fact]
    public async Task LogInsert_WritesRow_WithFirstStringPropertyAsActionDesc()
    {
        var (writer, executed) = CreateWriter(AuthenticatedUser("alice"));
        var entity = new Widget { Pkid = 42, Quantity = 3, Name = "Azure Fundamentals", Note = "note" };

        await writer.LogInsertAsync("Widget", entity);

        var cmd = Assert.Single(executed);
        Assert.Contains("INSERT INTO RowAudit", cmd.Sql);
        // pkid is IDENTITY — it must not be in the INSERT column list.
        Assert.DoesNotContain("pkid", cmd.Sql, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("Widget", cmd.Parameters["TableName"]);
        Assert.Equal("Insert", cmd.Parameters["ActionType"]);
        Assert.Equal("42", cmd.Parameters["PrimaryKeyValues"]);
        Assert.Equal("Azure Fundamentals", cmd.Parameters["ActionDesc"]);
        Assert.Equal("alice", cmd.Parameters["UserName"]);
        var stamped = Assert.IsType<DateTime>(cmd.Parameters["DateTime"]);
        Assert.True(Math.Abs((DateTime.Now - stamped).TotalMinutes) < 1);
    }

    [Fact]
    public async Task LogInsert_ReadsPkid_CaseInsensitively()
    {
        var (writer, executed) = CreateWriter(AuthenticatedUser("alice"));

        await writer.LogInsertAsync("LowerCase", new LowerCasePkidEntity { pkid = 7, Code = "C7" });

        var cmd = Assert.Single(executed);
        Assert.Equal("7", cmd.Parameters["PrimaryKeyValues"]);
        Assert.Equal("C7", cmd.Parameters["ActionDesc"]);
    }

    [Fact]
    public async Task LogInsert_TruncatesActionDesc_At1000Characters()
    {
        var (writer, executed) = CreateWriter(AuthenticatedUser("alice"));
        var entity = new Widget { Pkid = 1, Name = new string('x', 1200) };

        await writer.LogInsertAsync("Widget", entity);

        var desc = Assert.IsType<string>(Assert.Single(executed).Parameters["ActionDesc"]);
        Assert.Equal(1000, desc.Length);
        Assert.Equal(new string('x', 1000), desc);
    }

    // --- LogDelete ---------------------------------------------------------

    [Fact]
    public async Task LogDelete_WritesRow_WithFirstStringPropertyAsActionDesc()
    {
        var (writer, executed) = CreateWriter(AuthenticatedUser("bob"));
        var entity = new Widget { Pkid = 9, Name = "Doomed row" };

        await writer.LogDeleteAsync("Widget", entity);

        var cmd = Assert.Single(executed);
        Assert.Equal("Delete", cmd.Parameters["ActionType"]);
        Assert.Equal("9", cmd.Parameters["PrimaryKeyValues"]);
        Assert.Equal("Doomed row", cmd.Parameters["ActionDesc"]);
        Assert.Equal("bob", cmd.Parameters["UserName"]);
    }

    // --- LogUpdate ---------------------------------------------------------

    [Fact]
    public async Task LogUpdate_ListsExactlyTheChangedPropertyNames_InDeclarationOrder()
    {
        var (writer, executed) = CreateWriter(AuthenticatedUser("alice"));
        var before = new Widget { Pkid = 5, Quantity = 1, Name = "Old", Note = "same", IsActive = false, TagIds = [1, 2] };
        var after = new Widget { Pkid = 5, Quantity = 1, Name = "New", Note = "same", IsActive = true, TagIds = [1, 3] };

        await writer.LogUpdateAsync("Widget", before, after);

        var cmd = Assert.Single(executed);
        Assert.Equal("Update", cmd.Parameters["ActionType"]);
        Assert.Equal("5", cmd.Parameters["PrimaryKeyValues"]);
        Assert.Equal("Name, IsActive, TagIds", cmd.Parameters["ActionDesc"]);
    }

    [Fact]
    public async Task LogUpdate_ComparesListsByContent_NotByReference()
    {
        var (writer, executed) = CreateWriter(AuthenticatedUser("alice"));
        // Distinct List instances, same content — must not be reported as changed.
        var before = new Widget { Pkid = 5, Quantity = 1, Name = "Same", TagIds = [1, 2] };
        var after = new Widget { Pkid = 5, Quantity = 2, Name = "Same", TagIds = [1, 2] };

        await writer.LogUpdateAsync("Widget", before, after);

        Assert.Equal("Quantity", Assert.Single(executed).Parameters["ActionDesc"]);
    }

    [Fact]
    public async Task LogUpdate_NothingChanged_WritesNoRow()
    {
        var (writer, executed) = CreateWriter(AuthenticatedUser("alice"));
        var before = new Widget { Pkid = 5, Quantity = 1, Name = "Same", Note = null, TagIds = [1, 2] };
        var after = new Widget { Pkid = 5, Quantity = 1, Name = "Same", Note = null, TagIds = [1, 2] };

        await writer.LogUpdateAsync("Widget", before, after);

        Assert.Empty(executed);
    }

    // --- UserName resolution -------------------------------------------------

    [Fact]
    public async Task LogInsert_NoHttpContext_WritesSystemAsUserName()
    {
        var (writer, executed) = CreateWriter(user: null);

        await writer.LogInsertAsync("Widget", new Widget { Pkid = 1, Name = "n" });

        Assert.Equal("system", Assert.Single(executed).Parameters["UserName"]);
    }

    [Fact]
    public async Task LogInsert_UnauthenticatedPrincipal_WritesSystemAsUserName()
    {
        // A request that reached the writer without a validated JWT: principal exists, but the
        // identity is not authenticated.
        var (writer, executed) = CreateWriter(new ClaimsPrincipal(new ClaimsIdentity()));

        await writer.LogInsertAsync("Widget", new Widget { Pkid = 1, Name = "n" });

        Assert.Equal("system", Assert.Single(executed).Parameters["UserName"]);
    }

    // --- Harness -------------------------------------------------------------

    private static (RowAuditWriter Writer, List<ExecutedCommand> Executed) CreateWriter(ClaimsPrincipal? user)
    {
        var db = new FakeDb();
        var accessor = new Mock<IHttpContextAccessor>();
        accessor.Setup(a => a.HttpContext)
            .Returns(user is null ? null : new DefaultHttpContext { User = user });
        return (new RowAuditWriter(db, accessor.Object), db.Executed);
    }

    private static ClaimsPrincipal AuthenticatedUser(string userName) =>
        // Mirrors the validated-JWT shape: MapInboundClaims is off, so the claim type is the raw
        // "name" JwtTokenService emitted (Program.cs sets NameClaimType = "name" to match).
        new(new ClaimsIdentity([new Claim("name", userName)],
            authenticationType: "Test", nameType: "name", roleType: "role"));
}
