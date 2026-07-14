using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// Endpoint tests for <see cref="PartnersController"/>. The repository is mocked so these
/// run without a live SQL Server. Covers list/filter, view (found + not-found), add
/// (including invalid-model 400), edit, and delete.
/// </summary>
public class PartnersControllerTests
{
    private readonly Mock<IPartnerRepository> _repo = new(MockBehavior.Strict);
    private readonly PartnersController _controller;

    public PartnersControllerTests()
    {
        _controller = new PartnersController(_repo.Object);
    }

    private static Partner Sample() => new()
    {
        Pkid = 1,
        Name = "微軟",
        AppKey = "MS",
        NameOnPartnerMenu = "微軟認證課程",
        NameOnCourseDetailPage = "微軟",
        DisplayOrder = 10,
        ImageFilename = "ms.png"
    };

    private static PartnerRequest SampleRequest() => new()
    {
        Pkid = 1,
        Name = "微軟",
        AppKey = "MS",
        NameOnPartnerMenu = "微軟認證課程",
        NameOnCourseDetailPage = "微軟",
        DisplayOrder = 10,
        ImageFilename = "ms.png"
    };

    // --- List -------------------------------------------------------------
    [Fact]
    public async Task GetAll_ReturnsOkWithPartners()
    {
        var partners = new List<Partner> { Sample() };
        _repo.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync(partners);

        var result = await _controller.GetAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var returned = Assert.IsAssignableFrom<IEnumerable<Partner>>(ok.Value);
        Assert.Single(returned);
        _repo.VerifyAll();
    }

    // --- Filter -----------------------------------------------------------
    [Fact]
    public async Task Query_PassesKeywordToRepository_AndReturnsMatches()
    {
        var query = new PartnerQuery { Keyword = "微軟" };
        var matches = new List<Partner> { Sample() };
        _repo.Setup(r => r.QueryAsync(
                It.Is<PartnerQuery>(q => q.Keyword == "微軟"),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(matches);

        var result = await _controller.Query(query, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var returned = Assert.IsAssignableFrom<IEnumerable<Partner>>(ok.Value);
        Assert.Single(returned);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Query_NullBody_UsesEmptyQuery()
    {
        _repo.Setup(r => r.QueryAsync(It.IsAny<PartnerQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<Partner>());

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
        var partner = Assert.IsType<Partner>(ok.Value);
        Assert.Equal((short)1, partner.Pkid);
        Assert.Equal("微軟", partner.Name);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task GetById_Missing_ReturnsNotFound()
    {
        _repo.Setup(r => r.GetByIdAsync((short)99, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Partner?)null);

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
        Assert.Equal(nameof(PartnersController.GetById), created.ActionName);
        Assert.Equal((short)1, created.RouteValues!["id"]);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Create_InvalidModel_ReturnsValidationProblem()
    {
        _controller.ModelState.AddModelError(nameof(PartnerRequest.Name), "Required");

        var result = await _controller.Create(new PartnerRequest { AppKey = "MS" }, CancellationToken.None);

        Assert.IsType<ObjectResult>(result.Result); // ValidationProblem -> ObjectResult(ValidationProblemDetails)
        _repo.Verify(r => r.CreateAsync(It.IsAny<PartnerRequest>(), It.IsAny<CancellationToken>()), Times.Never);
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
        _controller.ModelState.AddModelError(nameof(PartnerRequest.Name), "Required");

        var result = await _controller.Update(new PartnerRequest { Pkid = 1 }, CancellationToken.None);

        Assert.IsType<ObjectResult>(result);
        _repo.Verify(r => r.UpdateAsync(It.IsAny<PartnerRequest>(), It.IsAny<CancellationToken>()), Times.Never);
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
