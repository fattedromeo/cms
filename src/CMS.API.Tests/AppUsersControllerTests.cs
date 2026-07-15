using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// Endpoint tests for <see cref="AppUsersController"/>. The repository is mocked so these run
/// without a live SQL Server.
/// </summary>
/// <remarks>
/// The PasswordHash rules are enforced by the *type* (neither <see cref="AppUser"/> nor
/// <see cref="AppUserRequest"/> has the property) and by the repository's SQL, so the controller
/// tests assert the reachable half: that the DTOs carry no password surface. The rules themselves —
/// hash derived from SysConfig on create, untouched on update — need the real DB and were verified
/// against it (SHA-256 of the configured default landed in the column; an over-posted
/// "passwordHash" was ignored on both create and update; PasswordUpdatedTime stayed NULL).
/// <see cref="SysConfigRepository"/>'s JSON parsing is likewise not unit-testable here (it takes
/// IDbConnectionFactory and there is no DB-integration harness) — same class of gap as SqlException/547.
/// </remarks>
public class AppUsersControllerTests
{
    private readonly Mock<IAppUserRepository> _repo = new(MockBehavior.Strict);
    private readonly AppUsersController _controller;

    public AppUsersControllerTests()
    {
        _controller = new AppUsersController(_repo.Object);
    }

    private static AppUser Sample() => new()
    {
        Pkid = 8,
        UserId = "miles@uuu.com.tw",
        UserName = "Miles Sun",
        IsActive = true,
        PasswordUpdatedTime = new DateTime(2026, 6, 4, 12, 49, 14),
        RoleCount = 2,
        RoleIds = ["Admin", "User"]
    };

    private static AppUserRequest SampleRequest() => new()
    {
        Pkid = 8,
        UserId = "miles@uuu.com.tw",
        UserName = "Miles Sun",
        IsActive = true,
        RoleIds = ["Admin", "User"]
    };

    // --- PasswordHash must have no surface at all --------------------------
    [Fact]
    public void AppUser_HasNoPasswordProperty()
    {
        // The response model must never be able to carry the hash to a client.
        Assert.DoesNotContain(
            typeof(AppUser).GetProperties(),
            p => p.Name.Contains("Password", StringComparison.OrdinalIgnoreCase)
                 && p.Name != nameof(AppUser.PasswordUpdatedTime));
    }

    [Fact]
    public void AppUserRequest_HasNoPasswordProperty_SoItCannotBeOverPosted()
    {
        // No bindable property => a client cannot set the hash (or the updated-time) by over-posting.
        Assert.DoesNotContain(
            typeof(AppUserRequest).GetProperties(),
            p => p.Name.Contains("Password", StringComparison.OrdinalIgnoreCase));
    }

    // --- List -------------------------------------------------------------
    [Fact]
    public async Task GetAll_ReturnsOkWithUsers()
    {
        _repo.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<AppUser> { Sample() });

        var result = await _controller.GetAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Single(Assert.IsAssignableFrom<IEnumerable<AppUser>>(ok.Value));
        _repo.VerifyAll();
    }

    // --- Filter -----------------------------------------------------------
    [Fact]
    public async Task Query_PassesKeywordToRepository()
    {
        _repo.Setup(r => r.QueryAsync(
                It.Is<AppUserQuery>(q => q.Keyword == "miles"), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<AppUser> { Sample() });

        var result = await _controller.Query(new AppUserQuery { Keyword = "miles" }, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Query_PassesIsActiveAndRoleIdFilters()
    {
        _repo.Setup(r => r.QueryAsync(
                It.Is<AppUserQuery>(q => q.IsActive == true && q.RoleId == "Admin"),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<AppUser> { Sample() });

        var result = await _controller.Query(
            new AppUserQuery { IsActive = true, RoleId = "Admin" }, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Query_NullBody_UsesEmptyQuery()
    {
        _repo.Setup(r => r.QueryAsync(It.IsAny<AppUserQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<AppUser>());

        var result = await _controller.Query(null!, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        _repo.VerifyAll();
    }

    // --- View -------------------------------------------------------------
    [Fact]
    public async Task GetById_Existing_ReturnsOkWithRoleIds()
    {
        _repo.Setup(r => r.GetByIdAsync("miles@uuu.com.tw", It.IsAny<CancellationToken>()))
            .ReturnsAsync(Sample());

        var result = await _controller.GetById("miles@uuu.com.tw", CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var user = Assert.IsType<AppUser>(ok.Value);
        Assert.Equal("miles@uuu.com.tw", user.UserId);
        Assert.Equal(["Admin", "User"], user.RoleIds);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task GetById_Missing_ReturnsNotFound()
    {
        _repo.Setup(r => r.GetByIdAsync("nobody@example.com", It.IsAny<CancellationToken>()))
            .ReturnsAsync((AppUser?)null);

        var result = await _controller.GetById("nobody@example.com", CancellationToken.None);

        Assert.IsType<NotFoundResult>(result.Result);
        _repo.VerifyAll();
    }

    // --- Add --------------------------------------------------------------
    [Fact]
    public async Task Create_Valid_ReturnsCreatedAtActionKeyedOnUserId()
    {
        var request = SampleRequest();
        _repo.Setup(r => r.ExistsAsync(request.UserId, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(r => r.CreateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(Sample());

        var result = await _controller.Create(request, CancellationToken.None);

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(nameof(AppUsersController.GetById), created.ActionName);
        // Routed by UserId (the clustered PK), never by the surrogate pkid.
        Assert.Equal("miles@uuu.com.tw", created.RouteValues!["id"]);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Create_DuplicateUserId_ReturnsConflict()
    {
        var request = SampleRequest();
        _repo.Setup(r => r.ExistsAsync(request.UserId, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Create(request, CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(result.Result);
        _repo.Verify(r => r.CreateAsync(It.IsAny<AppUserRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Create_InvalidModel_ReturnsValidationProblem()
    {
        _controller.ModelState.AddModelError(nameof(AppUserRequest.UserId), "Required");

        var result = await _controller.Create(new AppUserRequest(), CancellationToken.None);

        Assert.IsType<ObjectResult>(result.Result);
        _repo.Verify(r => r.CreateAsync(It.IsAny<AppUserRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // --- Edit -------------------------------------------------------------
    [Fact]
    public async Task Update_Existing_ReturnsNoContent()
    {
        var request = SampleRequest();
        _repo.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Update_Missing_ReturnsNotFound()
    {
        var request = SampleRequest();
        request.UserId = "nobody@example.com";
        _repo.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Update_InvalidModel_ReturnsValidationProblem()
    {
        _controller.ModelState.AddModelError(nameof(AppUserRequest.UserName), "Required");

        var result = await _controller.Update(new AppUserRequest { UserId = "x" }, CancellationToken.None);

        Assert.IsType<ObjectResult>(result);
        _repo.Verify(r => r.UpdateAsync(It.IsAny<AppUserRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // --- Delete -----------------------------------------------------------
    [Fact]
    public async Task Delete_Existing_ReturnsNoContent()
    {
        _repo.Setup(r => r.DeleteAsync("miles@uuu.com.tw", It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Delete("miles@uuu.com.tw", CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Delete_Missing_ReturnsNotFound()
    {
        _repo.Setup(r => r.DeleteAsync("nobody@example.com", It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Delete("nobody@example.com", CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        _repo.VerifyAll();
    }
}
