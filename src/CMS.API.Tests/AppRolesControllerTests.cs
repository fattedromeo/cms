using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// Endpoint tests for <see cref="AppRolesController"/>. The repository is mocked so
/// these run without a live SQL Server while still exercising controller behaviour
/// (status codes, routing, N-N payloads) for list/filter, view, add, and edit.
/// </summary>
public class AppRolesControllerTests
{
    private readonly Mock<IAppRoleRepository> _repo = new(MockBehavior.Strict);
    private readonly AppRolesController _controller;

    public AppRolesControllerTests()
    {
        _controller = new AppRolesController(_repo.Object);
    }

    private static AppRole SampleRole() => new()
    {
        Pkid = 1,
        RoleId = "Admin",
        RoleName = "Administrator",
        PermissionLevel = 1,
        Description = "系統管理員",
        UserCount = 3,
        UserIds = ["helen", "Jenny_Tsao", "miles@uuu.com.tw"]
    };

    // --- List -------------------------------------------------------------
    [Fact]
    public async Task GetAll_ReturnsOkWithRoles()
    {
        var roles = new List<AppRole> { SampleRole() };
        _repo.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync(roles);

        var result = await _controller.GetAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var returned = Assert.IsAssignableFrom<IEnumerable<AppRole>>(ok.Value);
        Assert.Single(returned);
        _repo.VerifyAll();
    }

    // --- Filter -----------------------------------------------------------
    [Fact]
    public async Task Query_PassesFilterToRepository_AndReturnsMatches()
    {
        var query = new AppRoleQuery { Keyword = "Admin", PermissionLevel = 1 };
        var matches = new List<AppRole> { SampleRole() };
        _repo.Setup(r => r.QueryAsync(
                It.Is<AppRoleQuery>(q => q.Keyword == "Admin" && q.PermissionLevel == 1),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(matches);

        var result = await _controller.Query(query, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var returned = Assert.IsAssignableFrom<IEnumerable<AppRole>>(ok.Value);
        Assert.Single(returned);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Query_NullBody_UsesEmptyQuery()
    {
        _repo.Setup(r => r.QueryAsync(It.IsAny<AppRoleQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<AppRole>());

        var result = await _controller.Query(null!, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        _repo.VerifyAll();
    }

    // --- View -------------------------------------------------------------
    [Fact]
    public async Task GetById_Existing_ReturnsOkWithUserIds()
    {
        _repo.Setup(r => r.GetByIdAsync("Admin", It.IsAny<CancellationToken>()))
            .ReturnsAsync(SampleRole());

        var result = await _controller.GetById("Admin", CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var role = Assert.IsType<AppRole>(ok.Value);
        Assert.Equal("Admin", role.RoleId);
        Assert.Equal(3, role.UserIds.Count);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task GetById_Missing_ReturnsNotFound()
    {
        _repo.Setup(r => r.GetByIdAsync("Nope", It.IsAny<CancellationToken>()))
            .ReturnsAsync((AppRole?)null);

        var result = await _controller.GetById("Nope", CancellationToken.None);

        Assert.IsType<NotFoundResult>(result.Result);
        _repo.VerifyAll();
    }

    // --- Add --------------------------------------------------------------
    [Fact]
    public async Task Create_New_ReturnsCreatedAtActionWithLocation()
    {
        var request = new AppRoleRequest
        {
            RoleId = "Editor",
            RoleName = "Editor",
            PermissionLevel = 50,
            Description = "編輯者",
            UserIds = ["helen"]
        };
        _repo.Setup(r => r.ExistsAsync("Editor", It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(r => r.CreateAsync(request, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AppRole { Pkid = 5, RoleId = "Editor", RoleName = "Editor", PermissionLevel = 50, UserCount = 1 });

        var result = await _controller.Create(request, CancellationToken.None);

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(nameof(AppRolesController.GetById), created.ActionName);
        Assert.Equal("Editor", created.RouteValues!["id"]);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Create_DuplicateRoleId_ReturnsConflict()
    {
        var request = new AppRoleRequest { RoleId = "Admin", RoleName = "Administrator" };
        _repo.Setup(r => r.ExistsAsync("Admin", It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Create(request, CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(result.Result);
        _repo.Verify(r => r.CreateAsync(It.IsAny<AppRoleRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Create_InvalidModel_ReturnsValidationProblem()
    {
        _controller.ModelState.AddModelError(nameof(AppRoleRequest.RoleId), "Required");

        var result = await _controller.Create(new AppRoleRequest(), CancellationToken.None);

        Assert.IsType<ObjectResult>(result.Result); // ValidationProblem -> ObjectResult(ValidationProblemDetails)
        _repo.Verify(r => r.ExistsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // --- Edit -------------------------------------------------------------
    [Fact]
    public async Task Update_Existing_ReturnsNoContent()
    {
        var request = new AppRoleRequest
        {
            Pkid = 1,
            RoleId = "Admin",
            RoleName = "Administrator (renamed)",
            PermissionLevel = 1,
            UserIds = ["helen", "miles@uuu.com.tw"]
        };
        _repo.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Update_Missing_ReturnsNotFound()
    {
        var request = new AppRoleRequest { RoleId = "Ghost", RoleName = "Ghost" };
        _repo.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Update_InvalidModel_ReturnsValidationProblem()
    {
        _controller.ModelState.AddModelError(nameof(AppRoleRequest.RoleName), "Required");

        var result = await _controller.Update(new AppRoleRequest { RoleId = "Admin" }, CancellationToken.None);

        Assert.IsType<ObjectResult>(result);
        _repo.Verify(r => r.UpdateAsync(It.IsAny<AppRoleRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // --- Delete -----------------------------------------------------------
    [Fact]
    public async Task Delete_Existing_ReturnsNoContent()
    {
        _repo.Setup(r => r.DeleteAsync("Admin", It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Delete("Admin", CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Delete_Missing_ReturnsNotFound()
    {
        _repo.Setup(r => r.DeleteAsync("Ghost", It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Delete("Ghost", CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        _repo.VerifyAll();
    }
}
