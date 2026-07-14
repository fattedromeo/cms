using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// Endpoint tests for <see cref="CourseGroupsController"/>. The repository is mocked so these
/// run without a live SQL Server. Covers list/filter, view (found + not-found), add
/// (including invalid-model 400), edit, and delete.
/// </summary>
/// <remarks>
/// The 547 → 409 delete path is not covered here: <c>SqlException</c> has no public constructor,
/// so it cannot be fabricated for a mock to throw. That path needs integration coverage.
/// </remarks>
public class CourseGroupsControllerTests
{
    private readonly Mock<ICourseGroupRepository> _repo = new(MockBehavior.Strict);
    private readonly CourseGroupsController _controller;

    public CourseGroupsControllerTests()
    {
        _controller = new CourseGroupsController(_repo.Object);
    }

    private static CourseGroup Sample() => new()
    {
        Pkid = 1,
        Description = "資訊安全"
    };

    private static CourseGroupRequest SampleRequest() => new()
    {
        Pkid = 1,
        Description = "資訊安全"
    };

    // --- List -------------------------------------------------------------
    [Fact]
    public async Task GetAll_ReturnsOkWithCourseGroups()
    {
        var groups = new List<CourseGroup> { Sample() };
        _repo.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync(groups);

        var result = await _controller.GetAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var returned = Assert.IsAssignableFrom<IEnumerable<CourseGroup>>(ok.Value);
        Assert.Single(returned);
        _repo.VerifyAll();
    }

    // --- Filter -----------------------------------------------------------
    [Fact]
    public async Task Query_PassesKeywordToRepository_AndReturnsMatches()
    {
        var query = new CourseGroupQuery { Keyword = "資訊" };
        var matches = new List<CourseGroup> { Sample() };
        _repo.Setup(r => r.QueryAsync(
                It.Is<CourseGroupQuery>(q => q.Keyword == "資訊"),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(matches);

        var result = await _controller.Query(query, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var returned = Assert.IsAssignableFrom<IEnumerable<CourseGroup>>(ok.Value);
        Assert.Single(returned);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Query_NullBody_UsesEmptyQuery()
    {
        _repo.Setup(r => r.QueryAsync(It.IsAny<CourseGroupQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<CourseGroup>());

        var result = await _controller.Query(null!, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        _repo.VerifyAll();
    }

    // --- View -------------------------------------------------------------
    [Fact]
    public async Task GetById_Existing_ReturnsOk()
    {
        _repo.Setup(r => r.GetByIdAsync((short)1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Sample());

        var result = await _controller.GetById(1, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var group = Assert.IsType<CourseGroup>(ok.Value);
        Assert.Equal((short)1, group.Pkid);
        Assert.Equal("資訊安全", group.Description);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task GetById_Missing_ReturnsNotFound()
    {
        _repo.Setup(r => r.GetByIdAsync((short)99, It.IsAny<CancellationToken>()))
            .ReturnsAsync((CourseGroup?)null);

        var result = await _controller.GetById(99, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result.Result);
        _repo.VerifyAll();
    }

    // --- Add --------------------------------------------------------------
    [Fact]
    public async Task Create_Valid_ReturnsCreatedAtActionWithLocation()
    {
        var request = SampleRequest();
        _repo.Setup(r => r.CreateAsync(request, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Sample());

        var result = await _controller.Create(request, CancellationToken.None);

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(nameof(CourseGroupsController.GetById), created.ActionName);
        Assert.Equal((short)1, created.RouteValues!["id"]);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Create_InvalidModel_ReturnsValidationProblem()
    {
        _controller.ModelState.AddModelError(nameof(CourseGroupRequest.Description), "Required");

        var result = await _controller.Create(new CourseGroupRequest(), CancellationToken.None);

        Assert.IsType<ObjectResult>(result.Result); // ValidationProblem -> ObjectResult(ValidationProblemDetails)
        _repo.Verify(r => r.CreateAsync(It.IsAny<CourseGroupRequest>(), It.IsAny<CancellationToken>()), Times.Never);
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
        request.Pkid = 99;
        _repo.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Update_InvalidModel_ReturnsValidationProblem()
    {
        _controller.ModelState.AddModelError(nameof(CourseGroupRequest.Description), "Required");

        var result = await _controller.Update(new CourseGroupRequest { Pkid = 1 }, CancellationToken.None);

        Assert.IsType<ObjectResult>(result);
        _repo.Verify(r => r.UpdateAsync(It.IsAny<CourseGroupRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // --- Delete -----------------------------------------------------------
    [Fact]
    public async Task Delete_Existing_ReturnsNoContent()
    {
        _repo.Setup(r => r.DeleteAsync((short)1, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Delete(1, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Delete_Missing_ReturnsNotFound()
    {
        _repo.Setup(r => r.DeleteAsync((short)99, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Delete(99, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        _repo.VerifyAll();
    }
}
