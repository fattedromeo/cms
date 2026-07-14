using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// Endpoint tests for <see cref="PublishStatusesController"/>. The repository is mocked so
/// these run without a live SQL Server. Covers list/filter, view, add (including the
/// user-assigned-pkid 409 path), edit, and delete.
/// </summary>
public class PublishStatusesControllerTests
{
    private readonly Mock<IPublishStatusRepository> _repo = new(MockBehavior.Strict);
    private readonly PublishStatusesController _controller;

    public PublishStatusesControllerTests()
    {
        _controller = new PublishStatusesController(_repo.Object);
    }

    private static PublishStatus Sample() => new()
    {
        Pkid = 2,
        Description = "已發布",
        IsDraft = false,
        IsPublished = true,
        IsDiscontinued = false
    };

    // --- List -------------------------------------------------------------
    [Fact]
    public async Task GetAll_ReturnsOkWithStatuses()
    {
        var statuses = new List<PublishStatus> { Sample() };
        _repo.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync(statuses);

        var result = await _controller.GetAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var returned = Assert.IsAssignableFrom<IEnumerable<PublishStatus>>(ok.Value);
        Assert.Single(returned);
        _repo.VerifyAll();
    }

    // --- Filter -----------------------------------------------------------
    [Fact]
    public async Task Query_PassesFilterToRepository_AndReturnsMatches()
    {
        var query = new PublishStatusQuery { Keyword = "發布", IsPublished = true };
        var matches = new List<PublishStatus> { Sample() };
        _repo.Setup(r => r.QueryAsync(
                It.Is<PublishStatusQuery>(q => q.Keyword == "發布" && q.IsPublished == true),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(matches);

        var result = await _controller.Query(query, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var returned = Assert.IsAssignableFrom<IEnumerable<PublishStatus>>(ok.Value);
        Assert.Single(returned);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Query_NullBody_UsesEmptyQuery()
    {
        _repo.Setup(r => r.QueryAsync(It.IsAny<PublishStatusQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<PublishStatus>());

        var result = await _controller.Query(null!, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        _repo.VerifyAll();
    }

    // --- View -------------------------------------------------------------
    [Fact]
    public async Task GetById_Existing_ReturnsOk()
    {
        _repo.Setup(r => r.GetByIdAsync((byte)2, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Sample());

        var result = await _controller.GetById(2, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var status = Assert.IsType<PublishStatus>(ok.Value);
        Assert.Equal((byte)2, status.Pkid);
        Assert.True(status.IsPublished);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task GetById_Missing_ReturnsNotFound()
    {
        _repo.Setup(r => r.GetByIdAsync((byte)99, It.IsAny<CancellationToken>()))
            .ReturnsAsync((PublishStatus?)null);

        var result = await _controller.GetById(99, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result.Result);
        _repo.VerifyAll();
    }

    // --- Add --------------------------------------------------------------
    [Fact]
    public async Task Create_New_ReturnsCreatedAtActionWithLocation()
    {
        var request = new PublishStatusRequest
        {
            Pkid = 3,
            Description = "已停用",
            IsDraft = false,
            IsPublished = false,
            IsDiscontinued = true
        };
        _repo.Setup(r => r.ExistsAsync((byte)3, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _repo.Setup(r => r.CreateAsync(request, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PublishStatus { Pkid = 3, Description = "已停用", IsDiscontinued = true });

        var result = await _controller.Create(request, CancellationToken.None);

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(nameof(PublishStatusesController.GetById), created.ActionName);
        Assert.Equal((byte)3, created.RouteValues!["id"]);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Create_DuplicatePkid_ReturnsConflict()
    {
        var request = new PublishStatusRequest { Pkid = 2, Description = "已發布" };
        _repo.Setup(r => r.ExistsAsync((byte)2, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Create(request, CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(result.Result);
        _repo.Verify(r => r.CreateAsync(It.IsAny<PublishStatusRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Create_InvalidModel_ReturnsValidationProblem()
    {
        _controller.ModelState.AddModelError(nameof(PublishStatusRequest.Description), "Required");

        var result = await _controller.Create(new PublishStatusRequest { Pkid = 4 }, CancellationToken.None);

        Assert.IsType<ObjectResult>(result.Result); // ValidationProblem -> ObjectResult(ValidationProblemDetails)
        _repo.Verify(r => r.ExistsAsync(It.IsAny<byte>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // --- Edit -------------------------------------------------------------
    [Fact]
    public async Task Update_Existing_ReturnsNoContent()
    {
        var request = new PublishStatusRequest
        {
            Pkid = 2,
            Description = "已發布 (更新)",
            IsPublished = true
        };
        _repo.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Update_Missing_ReturnsNotFound()
    {
        var request = new PublishStatusRequest { Pkid = 99, Description = "Ghost" };
        _repo.Setup(r => r.UpdateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Update(request, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Update_InvalidModel_ReturnsValidationProblem()
    {
        _controller.ModelState.AddModelError(nameof(PublishStatusRequest.Description), "Required");

        var result = await _controller.Update(new PublishStatusRequest { Pkid = 2 }, CancellationToken.None);

        Assert.IsType<ObjectResult>(result);
        _repo.Verify(r => r.UpdateAsync(It.IsAny<PublishStatusRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // --- Delete -----------------------------------------------------------
    [Fact]
    public async Task Delete_Existing_ReturnsNoContent()
    {
        _repo.Setup(r => r.DeleteAsync((byte)2, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Delete(2, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Delete_Missing_ReturnsNotFound()
    {
        _repo.Setup(r => r.DeleteAsync((byte)99, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Delete(99, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        _repo.VerifyAll();
    }
}
