using System.Data;
using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// Endpoint tests for <see cref="RowAuditController"/> (mocked repository) plus SQL-shape tests
/// for <see cref="RowAuditRepository"/> against the shared <see cref="FakeDb"/> — together they
/// cover "filters by tableName + pkid" and "newest first".
/// </summary>
public class RowAuditControllerTests
{
    private readonly Mock<IRowAuditRepository> _repo = new(MockBehavior.Strict);
    private readonly RowAuditController _controller;

    public RowAuditControllerTests() => _controller = new RowAuditController(_repo.Object);

    private static List<RowAuditEntry> SampleTrail() =>
    [
        new() { DateTime = new DateTime(2026, 7, 2, 9, 30, 0), UserName = "bob", ActionType = "Update", ActionDesc = "Title" },
        new() { DateTime = new DateTime(2026, 6, 1, 8, 0, 0), UserName = "alice", ActionType = "Insert", ActionDesc = "AZ-900" }
    ];

    // --- Controller ----------------------------------------------------------

    [Fact]
    public async Task Get_FiltersByTableNameAndPkid_AndReturnsTheTrail()
    {
        var trail = SampleTrail();
        _repo.Setup(r => r.GetForRecordAsync("Course", "123", It.IsAny<CancellationToken>()))
             .ReturnsAsync(trail);

        var result = await _controller.GetForRecord("Course", "123", CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Same(trail, ok.Value);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Get_TrimsTheQueryParameters()
    {
        _repo.Setup(r => r.GetForRecordAsync("Course", "123", It.IsAny<CancellationToken>()))
             .ReturnsAsync([]);

        var result = await _controller.GetForRecord(" Course ", " 123 ", CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        _repo.VerifyAll();
    }

    [Theory]
    [InlineData(null, "123")]
    [InlineData("", "123")]
    [InlineData("   ", "123")]
    [InlineData("Course", null)]
    [InlineData("Course", "")]
    [InlineData("Course", "   ")]
    public async Task Get_WithMissingParameter_Returns400_WithoutTouchingTheRepository(
        string? tableName, string? pkid)
    {
        var result = await _controller.GetForRecord(tableName, pkid, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result.Result);
        _repo.VerifyNoOtherCalls();
    }

    // --- Repository SQL shape (FakeDb) ----------------------------------------

    [Fact]
    public async Task Repository_QueriesByTableNameAndPkid_OrderedNewestFirst()
    {
        var db = new FakeDb();
        db.QueryHandler = _ =>
        {
            var dt = new DataTable();
            dt.Columns.Add("DateTime", typeof(DateTime));
            dt.Columns.Add("UserName", typeof(string));
            dt.Columns.Add("ActionType", typeof(string));
            dt.Columns.Add("ActionDesc", typeof(string));
            dt.Rows.Add(new DateTime(2026, 7, 2, 9, 30, 0), "bob", "Update", "Title");
            dt.Rows.Add(new DateTime(2026, 6, 1, 8, 0, 0), "alice", "Insert", "AZ-900");
            return dt;
        };
        var repo = new RowAuditRepository(db);

        var rows = (await repo.GetForRecordAsync("Course", "123")).ToList();

        var cmd = Assert.Single(db.Executed);
        // Both filters are parameterised — not interpolated.
        Assert.Contains("TableName = @tableName", cmd.Sql);
        Assert.Contains("PrimaryKeyValues = @pkid", cmd.Sql);
        Assert.Equal("Course", cmd.Parameters["tableName"]);
        Assert.Equal("123", cmd.Parameters["pkid"]);
        // Newest first, with the IDENTITY pkid as the tie-break within datetime's 3ms tick.
        Assert.Contains("ORDER BY a.[DateTime] DESC, a.pkid DESC", cmd.Sql);

        Assert.Equal(2, rows.Count);
        Assert.Equal("bob", rows[0].UserName);
        Assert.Equal("Update", rows[0].ActionType);
        Assert.Equal(new DateTime(2026, 7, 2, 9, 30, 0), rows[0].DateTime);
        Assert.Equal("alice", rows[1].UserName);
    }
}
