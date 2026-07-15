using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// Endpoint tests for <see cref="FeaturedPromoItemsController"/>. The repository is mocked so these
/// run without a live SQL Server. Covers list, the one-week ScheduleOn filter, the TrainingCenter
/// filter, view, add, edit, delete and the slot-move endpoint.
/// </summary>
/// <remarks>
/// <para>
/// Not covered here, by construction: the 2627 → 409 (duplicate cell) and 547 → 409 (bad PromoCode)
/// paths. <c>SqlException</c> has no public constructor, so a mocked repo cannot throw one. Both
/// were instead verified against the dev DB and are recorded in
/// <c>spec/custom/FeaturedPromoItem/FeaturedPromoItem.md</c>.
/// </para>
/// <para>
/// Likewise the swap itself is SQL semantics (a sequential two-step update raises 2627 where a
/// single-statement CASE swap succeeds) and lives in the repository — a mocked repo cannot catch a
/// regression there. These tests pin the controller's contract: direction/bounds → status code.
/// </para>
/// </remarks>
public class FeaturedPromoItemsControllerTests
{
    private readonly Mock<IFeaturedPromoItemRepository> _repo = new(MockBehavior.Strict);
    private readonly FeaturedPromoItemsController _controller;

    public FeaturedPromoItemsControllerTests()
    {
        _controller = new FeaturedPromoItemsController(_repo.Object);
    }

    private static FeaturedPromoItem Sample() => new()
    {
        Pkid = 76884,
        ScheduleOn = new DateOnly(2026, 3, 16),
        TrainingCenterPkid = 1,
        Slot = 1,
        PromotionPkid = 1081,
        Topic = "快速上手Power Platform",
        Description = "參加Power Platform認證系列課程",
        Promotion = new FeaturedPromoPromotionRef { Pkid = 1081, PromoCode = "220624_PowerPlatform" }
    };

    private static FeaturedPromoItemRequest SampleRequest() => new()
    {
        Pkid = 76884,
        ScheduleOn = new DateOnly(2026, 3, 16),
        TrainingCenterPkid = 1,
        Slot = 1,
        PromotionPkid = 1081,
        Topic = "快速上手Power Platform",
        Description = "參加Power Platform認證系列課程"
    };

    // --- List -------------------------------------------------------------
    [Fact]
    public async Task GetAll_ReturnsOkWithItems()
    {
        _repo.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<FeaturedPromoItem> { Sample() });

        var result = await _controller.GetAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var returned = Assert.IsAssignableFrom<IEnumerable<FeaturedPromoItem>>(ok.Value);
        Assert.Single(returned);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task GetAll_ItemCarriesResolvedPromoCode()
    {
        _repo.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<FeaturedPromoItem> { Sample() });

        var result = await _controller.GetAll(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var item = Assert.IsAssignableFrom<IEnumerable<FeaturedPromoItem>>(ok.Value).Single();
        // The grid's first column renders this, not Promotion_pkid.
        Assert.Equal("220624_PowerPlatform", item.Promotion!.PromoCode);
        Assert.Equal(1081, item.Promotion.Pkid);
        _repo.VerifyAll();
    }

    // --- Filter: the one-week ScheduleOn window ---------------------------
    [Fact]
    public async Task Query_PassesOneWeekScheduleOnBounds_ToRepository()
    {
        // The grid computes Monday..Sunday and posts both ends; the API applies them verbatim.
        var monday = new DateOnly(2026, 3, 16);
        var sunday = new DateOnly(2026, 3, 22);
        var query = new FeaturedPromoItemQuery { ScheduleOnFrom = monday, ScheduleOnTo = sunday };

        _repo.Setup(r => r.QueryAsync(
                It.Is<FeaturedPromoItemQuery>(q =>
                    q.ScheduleOnFrom == monday && q.ScheduleOnTo == sunday),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<FeaturedPromoItem> { Sample() });

        var result = await _controller.Query(query, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Single(Assert.IsAssignableFrom<IEnumerable<FeaturedPromoItem>>(ok.Value));
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Query_WeekBoundsSpanExactlySevenInclusiveDays()
    {
        // Guards the inclusive-on-both-ends contract: Sunday must be Monday + 6, not + 7.
        FeaturedPromoItemQuery? captured = null;
        _repo.Setup(r => r.QueryAsync(It.IsAny<FeaturedPromoItemQuery>(), It.IsAny<CancellationToken>()))
            .Callback<FeaturedPromoItemQuery, CancellationToken>((q, _) => captured = q)
            .ReturnsAsync(new List<FeaturedPromoItem>());

        await _controller.Query(
            new FeaturedPromoItemQuery
            {
                ScheduleOnFrom = new DateOnly(2026, 3, 16),
                ScheduleOnTo = new DateOnly(2026, 3, 22)
            },
            CancellationToken.None);

        Assert.NotNull(captured);
        Assert.Equal(DayOfWeek.Monday, captured!.ScheduleOnFrom!.Value.DayOfWeek);
        Assert.Equal(DayOfWeek.Sunday, captured.ScheduleOnTo!.Value.DayOfWeek);
        Assert.Equal(6, captured.ScheduleOnTo.Value.DayNumber - captured.ScheduleOnFrom.Value.DayNumber);
        _repo.VerifyAll();
    }

    // --- Filter: the TrainingCenter tab -----------------------------------
    [Fact]
    public async Task Query_PassesTrainingCenterFilter_ToRepository()
    {
        // 台北 = pkid 1. Tab pkids are NOT contiguous in the dev DB (1, 2, 3, 5, 54), so the tab
        // must send the pkid rather than its index.
        var query = new FeaturedPromoItemQuery { TrainingCenterPkid = 1 };
        _repo.Setup(r => r.QueryAsync(
                It.Is<FeaturedPromoItemQuery>(q => q.TrainingCenterPkid == (short)1),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<FeaturedPromoItem> { Sample() });

        var result = await _controller.Query(query, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Single(Assert.IsAssignableFrom<IEnumerable<FeaturedPromoItem>>(ok.Value));
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Query_HandlesNonContiguousTrainingCenterPkid()
    {
        // 線上研討會 = pkid 54 and has zero rows in the dev DB — the tab must still return 200
        // with an empty week rather than 404.
        var query = new FeaturedPromoItemQuery { TrainingCenterPkid = 54 };
        _repo.Setup(r => r.QueryAsync(
                It.Is<FeaturedPromoItemQuery>(q => q.TrainingCenterPkid == (short)54),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<FeaturedPromoItem>());

        var result = await _controller.Query(query, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Empty(Assert.IsAssignableFrom<IEnumerable<FeaturedPromoItem>>(ok.Value));
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Query_CombinesTabAndWeekFilters()
    {
        var query = new FeaturedPromoItemQuery
        {
            TrainingCenterPkid = 3,
            ScheduleOnFrom = new DateOnly(2026, 7, 27),
            ScheduleOnTo = new DateOnly(2026, 8, 2)
        };
        _repo.Setup(r => r.QueryAsync(
                It.Is<FeaturedPromoItemQuery>(q =>
                    q.TrainingCenterPkid == (short)3 &&
                    q.ScheduleOnFrom == new DateOnly(2026, 7, 27) &&
                    q.ScheduleOnTo == new DateOnly(2026, 8, 2)),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<FeaturedPromoItem>());

        var result = await _controller.Query(query, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Query_NullBody_UsesEmptyQuery()
    {
        _repo.Setup(r => r.QueryAsync(It.IsAny<FeaturedPromoItemQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<FeaturedPromoItem>());

        var result = await _controller.Query(null!, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        _repo.VerifyAll();
    }

    // --- View -------------------------------------------------------------
    [Fact]
    public async Task GetById_Existing_ReturnsOk()
    {
        _repo.Setup(r => r.GetByIdAsync(76884, It.IsAny<CancellationToken>())).ReturnsAsync(Sample());

        var result = await _controller.GetById(76884, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var item = Assert.IsType<FeaturedPromoItem>(ok.Value);
        Assert.Equal(new DateOnly(2026, 3, 16), item.ScheduleOn);
        Assert.Equal((byte)1, item.Slot);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task GetById_Missing_ReturnsNotFound()
    {
        _repo.Setup(r => r.GetByIdAsync(99, It.IsAny<CancellationToken>()))
            .ReturnsAsync((FeaturedPromoItem?)null);

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
        Assert.Equal(nameof(FeaturedPromoItemsController.GetById), created.ActionName);
        Assert.Equal(76884, created.RouteValues!["id"]);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Create_InvalidModel_ReturnsValidationProblem()
    {
        _controller.ModelState.AddModelError(nameof(FeaturedPromoItemRequest.Topic), "Required");

        var result = await _controller.Create(new FeaturedPromoItemRequest(), CancellationToken.None);

        Assert.IsType<ObjectResult>(result.Result);
        _repo.Verify(r => r.CreateAsync(It.IsAny<FeaturedPromoItemRequest>(), It.IsAny<CancellationToken>()),
            Times.Never);
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
        _controller.ModelState.AddModelError(nameof(FeaturedPromoItemRequest.Description), "Required");

        var result = await _controller.Update(new FeaturedPromoItemRequest { Pkid = 1 }, CancellationToken.None);

        Assert.IsType<ObjectResult>(result);
        _repo.Verify(r => r.UpdateAsync(It.IsAny<FeaturedPromoItemRequest>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    // --- Delete -----------------------------------------------------------
    [Fact]
    public async Task Delete_Existing_ReturnsNoContent()
    {
        // Nothing FK-references FeaturedPromoItem, so there is no 547 path to guard here.
        _repo.Setup(r => r.DeleteAsync(76884, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await _controller.Delete(76884, CancellationToken.None);

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

    // --- Move (the 「+」/「--」 slot buttons) -------------------------------
    [Theory]
    [InlineData("down")] // 「+」 Slot 1 -> 2
    [InlineData("up")]   // 「--」 Slot 2 -> 1
    public async Task Move_Valid_ReturnsNoContent(string direction)
    {
        _repo.Setup(r => r.MoveAsync(76884, direction, It.IsAny<CancellationToken>()))
            .ReturnsAsync(FeaturedPromoItemMoveResult.Moved);

        var result = await _controller.Move(
            new FeaturedPromoItemMoveRequest { Pkid = 76884, Direction = direction },
            CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Move_PassesDirectionThroughVerbatim()
    {
        // "down" must not be silently inverted somewhere: 「+」 means a HIGHER slot number.
        string? seen = null;
        _repo.Setup(r => r.MoveAsync(It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Callback<int, string, CancellationToken>((_, d, _) => seen = d)
            .ReturnsAsync(FeaturedPromoItemMoveResult.Moved);

        await _controller.Move(
            new FeaturedPromoItemMoveRequest { Pkid = 76884, Direction = "down" },
            CancellationToken.None);

        Assert.Equal("down", seen);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Move_AtSlotBoundary_ReturnsBadRequest()
    {
        // Slot 1 moving up (or Slot 3 moving down) has nowhere to go.
        _repo.Setup(r => r.MoveAsync(76884, "up", It.IsAny<CancellationToken>()))
            .ReturnsAsync(FeaturedPromoItemMoveResult.OutOfRange);

        var result = await _controller.Move(
            new FeaturedPromoItemMoveRequest { Pkid = 76884, Direction = "up" },
            CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Move_Missing_ReturnsNotFound()
    {
        _repo.Setup(r => r.MoveAsync(99, "down", It.IsAny<CancellationToken>()))
            .ReturnsAsync(FeaturedPromoItemMoveResult.NotFound);

        var result = await _controller.Move(
            new FeaturedPromoItemMoveRequest { Pkid = 99, Direction = "down" },
            CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task Move_InvalidModel_ReturnsValidationProblem_AndDoesNotTouchRepository()
    {
        _controller.ModelState.AddModelError(
            nameof(FeaturedPromoItemMoveRequest.Direction), "Direction must be 'up' or 'down'.");

        var result = await _controller.Move(
            new FeaturedPromoItemMoveRequest { Pkid = 76884, Direction = "sideways" },
            CancellationToken.None);

        Assert.IsType<ObjectResult>(result);
        _repo.Verify(r => r.MoveAsync(It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }
}
