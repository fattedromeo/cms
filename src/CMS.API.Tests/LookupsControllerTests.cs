using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Moq;

namespace CMS.API.Tests;

/// <summary>
/// Endpoint tests for the lookups <see cref="LookupsController"/> uses to feed the
/// FeaturedPromoItem week grid: <c>training-centers</c> (the tabs) and <c>promotions</c> (the
/// PromoCode type-ahead).
/// </summary>
/// <remarks>
/// <para>
/// The five older lookups (app-users, app-roles, publish-statuses, partners, course-groups,
/// certifications, job-categories) predate this file and are exercised through their feature
/// specs; only the two added for FeaturedPromoItem are pinned here.
/// </para>
/// <para>
/// ⚠️ These cannot catch the hazard that actually matters for a lookup — an unqualified
/// <c>ORDER BY pkid</c> binding to the cast varchar select-list alias and sorting 1, 10, 100, 2.
/// That is SQL semantics inside the repository, and a mocked repo returns whatever order the test
/// hands it. The ordering of both lookups was verified against the dev DB instead.
/// </para>
/// </remarks>
public class LookupsControllerTests
{
    private readonly Mock<ILookupRepository> _repo = new(MockBehavior.Strict);
    private readonly LookupsController _controller;

    public LookupsControllerTests()
    {
        _controller = new LookupsController(_repo.Object);
    }

    // The real dev-DB rows: pkids are NOT contiguous (1, 2, 3, 5, 54) and are ordered by
    // DisplayOrder, which is a genuine global ordering here (5 rows, 5 distinct values).
    private static List<LookupItem> TrainingCenters() =>
    [
        new() { Pkid = "1", Label = "台北" },
        new() { Pkid = "2", Label = "新竹" },
        new() { Pkid = "3", Label = "台中" },
        new() { Pkid = "5", Label = "高雄" },
        new() { Pkid = "54", Label = "線上研討會" }
    ];

    // --- training-centers (the week-grid tabs) ----------------------------
    [Fact]
    public async Task GetTrainingCenters_ReturnsOkWithAllCenters()
    {
        _repo.Setup(r => r.GetTrainingCentersAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(TrainingCenters());

        var result = await _controller.GetTrainingCenters(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var items = Assert.IsAssignableFrom<IEnumerable<LookupItem>>(ok.Value).ToList();
        Assert.Equal(5, items.Count);
        Assert.Equal("台北", items[0].Label);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task GetTrainingCenters_PkidIsAStringAndNeedNotBeContiguous()
    {
        // LookupItem.Pkid is a string, so the tab must Number(...)-map it before comparing with the
        // numeric TrainingCenterPkid on the query DTO — and it must send the pkid, not the tab
        // index: 高雄 is pkid 5 at index 3, and 線上研討會 is pkid 54 at index 4.
        _repo.Setup(r => r.GetTrainingCentersAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(TrainingCenters());

        var result = await _controller.GetTrainingCenters(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var items = Assert.IsAssignableFrom<IEnumerable<LookupItem>>(ok.Value).ToList();
        Assert.Equal("5", items[3].Pkid);
        Assert.Equal("54", items[4].Pkid);
        Assert.All(items, i => Assert.IsType<string>(i.Pkid));
        _repo.VerifyAll();
    }

    [Fact]
    public async Task GetTrainingCenters_PreservesRepositoryOrder()
    {
        // The controller must not re-sort: DisplayOrder ordering is decided in SQL.
        _repo.Setup(r => r.GetTrainingCentersAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(TrainingCenters());

        var result = await _controller.GetTrainingCenters(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var labels = Assert.IsAssignableFrom<IEnumerable<LookupItem>>(ok.Value).Select(i => i.Label);
        Assert.Equal(new[] { "台北", "新竹", "台中", "高雄", "線上研討會" }, labels);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task GetTrainingCenters_Empty_ReturnsOkNotNotFound()
    {
        _repo.Setup(r => r.GetTrainingCentersAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<LookupItem>());

        var result = await _controller.GetTrainingCenters(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Empty(Assert.IsAssignableFrom<IEnumerable<LookupItem>>(ok.Value));
        _repo.VerifyAll();
    }

    // --- promotions (the PromoCode lookup) --------------------------------
    [Fact]
    public async Task GetPromotions_ReturnsOkWithPromoCodeAsLabel()
    {
        var promos = new List<LookupItem>
        {
            new() { Pkid = "1081", Label = "220624_PowerPlatform" },
            new() { Pkid = "2292", Label = "240909_Pythonall" }
        };
        _repo.Setup(r => r.GetPromotionsAsync(It.IsAny<CancellationToken>())).ReturnsAsync(promos);

        var result = await _controller.GetPromotions(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var items = Assert.IsAssignableFrom<IEnumerable<LookupItem>>(ok.Value).ToList();
        Assert.Equal(2, items.Count);
        // Label is the PromoCode the editor types; Pkid is what lands in Promotion_pkid.
        Assert.Equal("220624_PowerPlatform", items[0].Label);
        Assert.Equal("1081", items[0].Pkid);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task GetPromotions_IsNotFilteredByPublishStatus()
    {
        // Deliberate: the spec puts no restriction on the choice, and dev-DB FeaturedPromoItem rows
        // reference promos of every status. The lookup ships all 1,157 rows and the type-ahead
        // filters client-side, so a draft or discontinued promo must survive the round trip.
        var promos = new List<LookupItem>
        {
            new() { Pkid = "1", Label = "draft_promo" },
            new() { Pkid = "2", Label = "published_promo" },
            new() { Pkid = "3", Label = "discontinued_promo" }
        };
        _repo.Setup(r => r.GetPromotionsAsync(It.IsAny<CancellationToken>())).ReturnsAsync(promos);

        var result = await _controller.GetPromotions(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var items = Assert.IsAssignableFrom<IEnumerable<LookupItem>>(ok.Value).ToList();
        Assert.Equal(3, items.Count);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task GetPromotions_PreservesRepositoryOrder()
    {
        // PromoCode ASC is decided in SQL (PromoCode is UNIQUE, so the sort is total).
        var promos = new List<LookupItem>
        {
            new() { Pkid = "3419", Label = "(PMPE+PMPJ19)課程優惠" },
            new() { Pkid = "1081", Label = "220624_PowerPlatform" },
            new() { Pkid = "2292", Label = "240909_Pythonall" }
        };
        _repo.Setup(r => r.GetPromotionsAsync(It.IsAny<CancellationToken>())).ReturnsAsync(promos);

        var result = await _controller.GetPromotions(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var labels = Assert.IsAssignableFrom<IEnumerable<LookupItem>>(ok.Value).Select(i => i.Label);
        Assert.Equal(new[] { "(PMPE+PMPJ19)課程優惠", "220624_PowerPlatform", "240909_Pythonall" }, labels);
        _repo.VerifyAll();
    }

    [Fact]
    public async Task GetPromotions_Empty_ReturnsOkNotNotFound()
    {
        _repo.Setup(r => r.GetPromotionsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<LookupItem>());

        var result = await _controller.GetPromotions(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Empty(Assert.IsAssignableFrom<IEnumerable<LookupItem>>(ok.Value));
        _repo.VerifyAll();
    }
}
