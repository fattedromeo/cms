using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// Endpoint tests for <see cref="CoursesController"/>. The repository is mocked so these run
/// without a live SQL Server. Covers list/filter, view (found + not-found), add (including
/// invalid-model 400), edit, and delete.
/// </summary>
/// <remarks>
/// The 547 -> 409 delete path is not covered here: <c>SqlException</c> has no public constructor,
/// so it cannot be fabricated for a mock to throw. It was verified against the dev DB instead —
/// deleting a course that still has CourseFAQ rows returns 409 with the Chinese message.
/// </remarks>
public class CoursesControllerTests
{
    private readonly Mock<ICourseRepository> _repo = new(MockBehavior.Strict);
    private readonly CoursesController _controller;

    public CoursesControllerTests()
    {
        _controller = new CoursesController(_repo.Object);
    }

    private static Course Sample() => new()
    {
        Pkid = 1,
        Title = "Oracle資料庫之PL／SQL基礎",
        CourseId = "PLF",
        ProdCourseId = "PLF",
        FriendlyUrl = "oracle-plsql",
        DisplayOrder = 10,
        PartnerPkid = 2,
        CourseGroupPkid = 18,
        PublishStatusPkid = 3,
        ScheduleOn = new DateOnly(2015, 11, 10),
        ScheduleOff = new DateOnly(2021, 11, 1),
        Hour = 21,
        ListPrice = 24000m,
        LearningCredit = 6.0m,
        CanRepeat = true,
        Partner = new CoursePartnerRef { Pkid = 2, Name = "Oracle" },
        CourseGroup = new CourseGroupRef { Pkid = 18, Description = "Oracle SQL/DB系列課程" },
        PublishStatus = new CoursePublishStatusRef { Pkid = 3, Description = "已下架" },
        CertificationPkids = [5],
        JobCategoryPkids = [22]
    };

    private static CourseRequest SampleRequest() => new()
    {
        Pkid = 1,
        Title = "Oracle資料庫之PL／SQL基礎",
        CourseId = "PLF",
        ProdCourseId = "PLF",
        FriendlyUrl = "oracle-plsql",
        DisplayOrder = 10,
        PartnerPkid = 2,
        CourseGroupPkid = 18,
        PublishStatusPkid = 3,
        ScheduleOn = new DateOnly(2015, 11, 10),
        ScheduleOff = new DateOnly(2021, 11, 1),
        Hour = 21,
        ListPrice = 24000m,
        LearningCredit = 6.0m,
        CanRepeat = true,
        CertificationPkids = [5],
        JobCategoryPkids = [22]
    };

    // --- List -------------------------------------------------------------
    [Fact]
    public async Task GetAll_ReturnsOkWithCourses()
    {
        var courses = new List<Course> { Sample() };
        _repo.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync(courses);

        var result = await _controller.GetAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var returned = Assert.IsAssignableFrom<IEnumerable<Course>>(ok.Value);
        Assert.Single(returned);
        _repo.VerifyAll();
    }

    // --- Filter -----------------------------------------------------------
    [Fact]
    public async Task Query_PassesKeywordToRepository_AndReturnsMatches()
    {
        var query = new CourseQuery { Keyword = "Oracle" };
        _repo.Setup(r => r.QueryAsync(
                It.Is<CourseQuery>(q => q.Keyword == "Oracle"),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<Course> { Sample() });

        var result = await _controller.Query(query, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Single(Assert.IsAssignableFrom<IEnumerable<Course>>(ok.Value));
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Query_PassesFkFilters_ToRepository()
    {
        var query = new CourseQuery { PartnerPkid = 2, CourseGroupPkid = 18, PublishStatusPkid = 3 };
        _repo.Setup(r => r.QueryAsync(
                It.Is<CourseQuery>(q =>
                    q.PartnerPkid == (short)2 &&
                    q.CourseGroupPkid == (short)18 &&
                    q.PublishStatusPkid == (byte)3),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<Course> { Sample() });

        var result = await _controller.Query(query, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Query_PassesDateRangeAndBoolFilters_ToRepository()
    {
        var query = new CourseQuery
        {
            ScheduleOnFrom = new DateOnly(2020, 1, 1),
            ScheduleOnTo = new DateOnly(2020, 12, 31),
            ScheduleOffFrom = new DateOnly(2021, 1, 1),
            ScheduleOffTo = new DateOnly(2021, 12, 31),
            CanRepeat = true
        };
        _repo.Setup(r => r.QueryAsync(
                It.Is<CourseQuery>(q =>
                    q.ScheduleOnFrom == new DateOnly(2020, 1, 1) &&
                    q.ScheduleOnTo == new DateOnly(2020, 12, 31) &&
                    q.ScheduleOffFrom == new DateOnly(2021, 1, 1) &&
                    q.ScheduleOffTo == new DateOnly(2021, 12, 31) &&
                    q.CanRepeat == true),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<Course>());

        var result = await _controller.Query(query, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Query_NullBody_UsesEmptyQuery()
    {
        _repo.Setup(r => r.QueryAsync(It.IsAny<CourseQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<Course>());

        var result = await _controller.Query(null!, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        _repo.VerifyAll();
    }

    // --- View -------------------------------------------------------------
    [Fact]
    public async Task GetById_Existing_ReturnsOkWithNavObjectsAndNnLists()
    {
        _repo.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(Sample());

        var result = await _controller.GetById(1, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var course = Assert.IsType<Course>(ok.Value);
        Assert.Equal(1, course.Pkid);
        Assert.Equal("PLF", course.CourseId);
        Assert.Equal("Oracle", course.Partner!.Name);
        Assert.Equal("Oracle SQL/DB系列課程", course.CourseGroup!.Description);
        Assert.Equal("已下架", course.PublishStatus!.Description);
        Assert.Equal([5], course.CertificationPkids);
        Assert.Equal([(short)22], course.JobCategoryPkids);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task GetById_Missing_ReturnsNotFound()
    {
        _repo.Setup(r => r.GetByIdAsync(99, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Course?)null);

        var result = await _controller.GetById(99, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result.Result);
        _repo.VerifyAll();
    }

    // --- Add --------------------------------------------------------------
    [Fact]
    public async Task Create_Valid_ReturnsCreatedAtActionWithLocation()
    {
        var request = SampleRequest();
        _repo.Setup(r => r.CreateAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(Sample());

        var result = await _controller.Create(request, CancellationToken.None);

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(nameof(CoursesController.GetById), created.ActionName);
        Assert.Equal(1, created.RouteValues!["id"]);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Create_InvalidModel_ReturnsValidationProblem()
    {
        _controller.ModelState.AddModelError(nameof(CourseRequest.Title), "Required");

        var result = await _controller.Create(new CourseRequest(), CancellationToken.None);

        Assert.IsType<ObjectResult>(result.Result); // ValidationProblem -> ObjectResult(ValidationProblemDetails)
        _repo.Verify(r => r.CreateAsync(It.IsAny<CourseRequest>(), It.IsAny<CancellationToken>()), Times.Never);
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
        _controller.ModelState.AddModelError(nameof(CourseRequest.Title), "Required");

        var result = await _controller.Update(new CourseRequest { Pkid = 1 }, CancellationToken.None);

        Assert.IsType<ObjectResult>(result);
        _repo.Verify(r => r.UpdateAsync(It.IsAny<CourseRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // --- Delete -----------------------------------------------------------
    [Fact]
    public async Task Delete_Existing_ReturnsNoContent()
    {
        _repo.Setup(r => r.DeleteAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Delete(1, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Delete_Missing_ReturnsNotFound()
    {
        _repo.Setup(r => r.DeleteAsync(99, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var result = await _controller.Delete(99, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        _repo.VerifyAll();
    }
}
