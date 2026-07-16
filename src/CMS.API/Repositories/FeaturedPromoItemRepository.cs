using System.Data;
using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Services;
using Dapper;

namespace CMS.API.Repositories;

public sealed class FeaturedPromoItemRepository : IFeaturedPromoItemRepository
{
    private const string TableName = "FeaturedPromoItem";

    private readonly IDbConnectionFactory _factory;
    private readonly IRowAuditWriter _audit;

    public FeaturedPromoItemRepository(IDbConnectionFactory factory, IRowAuditWriter audit)
    {
        _factory = factory;
        _audit = audit;
    }

    // Promotion2 is INNER JOINed (Promotion_pkid is NOT NULL + FK-enforced) purely to carry
    // PromoCode into the grid. Its nav block starts at `p.pkid AS Pkid` for splitOn.
    // All columns are nvarchar/int/date — no nchar, so no RTRIM is needed anywhere here.
    private const string SelectColumns = @"
        f.pkid,
        f.ScheduleOn,
        f.TrainingCenter_pkid AS TrainingCenterPkid,
        f.Slot,
        f.Promotion_pkid AS PromotionPkid,
        f.Topic,
        f.Description,
        p.pkid AS Pkid,
        p.PromoCode";

    private const string FromJoin = @"
        FROM FeaturedPromoItem f
        INNER JOIN Promotion2 p ON p.pkid = f.Promotion_pkid";

    // The grid reads a day as three fixed slots, so slot order is what matters within a day.
    // FeaturedPromoItem has no DisplayOrder column, so there is no DisplayOrder-vs-key question here.
    private const string OrderBy = "ORDER BY f.ScheduleOn ASC, f.TrainingCenter_pkid ASC, f.Slot ASC";

    /// <summary>
    /// Dapper multi-map: `f.pkid` sits at index 0 and `p.pkid AS Pkid` opens the nav block.
    /// splitOn searches from startIdx + 1, so the entity's own key is not split away.
    /// </summary>
    private static async Task<IEnumerable<FeaturedPromoItem>> QueryWithPromoAsync(
        IDbConnection conn, string sql, object? param, CancellationToken ct, IDbTransaction? tx = null)
        => await conn.QueryAsync<FeaturedPromoItem, FeaturedPromoPromotionRef, FeaturedPromoItem>(
            new CommandDefinition(sql, param, tx, cancellationToken: ct),
            (item, promo) =>
            {
                item.Promotion = promo;
                return item;
            },
            splitOn: "Pkid");

    /// <summary>
    /// Row image on the caller's connection/transaction — the audit before/after compare. Selects
    /// only the real FeaturedPromoItem columns, NOT the Promotion nav: two reads yield distinct nav
    /// instances, which reference-compare as "changed" and would put a phantom "Promotion" in every
    /// update's ActionDesc. A promo change shows as PromotionPkid instead.
    /// </summary>
    private static Task<FeaturedPromoItem?> SnapshotAsync(
        IDbConnection conn, IDbTransaction tx, int pkid, CancellationToken ct) =>
        conn.QuerySingleOrDefaultAsync<FeaturedPromoItem>(new CommandDefinition(@"
            SELECT f.pkid, f.ScheduleOn, f.TrainingCenter_pkid AS TrainingCenterPkid, f.Slot,
                   f.Promotion_pkid AS PromotionPkid, f.Topic, f.Description
            FROM FeaturedPromoItem f WHERE f.pkid = @pkid;",
            new { pkid }, tx, cancellationToken: ct));

    public async Task<IEnumerable<FeaturedPromoItem>> GetAllAsync(CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var sql = $"SELECT {SelectColumns} {FromJoin} {OrderBy};";
        return await QueryWithPromoAsync(conn, sql, null, ct);
    }

    public async Task<IEnumerable<FeaturedPromoItem>> QueryAsync(
        FeaturedPromoItemQuery query, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        var where = new List<string>();
        var p = new DynamicParameters();

        if (query.TrainingCenterPkid is not null)
        {
            where.Add("f.TrainingCenter_pkid = @tc");
            p.Add("tc", query.TrainingCenterPkid.Value);
        }

        // Inclusive on both ends: the grid passes Monday and Sunday and expects both rendered.
        // DateOnly? params round-trip through DateOnlyTypeHandler (one AddTypeHandler covers
        // DateOnly and DateOnly?), which is why these bind at all.
        if (query.ScheduleOnFrom is not null)
        {
            where.Add("f.ScheduleOn >= @from");
            p.Add("from", query.ScheduleOnFrom.Value);
        }

        if (query.ScheduleOnTo is not null)
        {
            where.Add("f.ScheduleOn <= @to");
            p.Add("to", query.ScheduleOnTo.Value);
        }

        if (query.PromotionPkid is not null)
        {
            where.Add("f.Promotion_pkid = @promo");
            p.Add("promo", query.PromotionPkid.Value);
        }

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            where.Add("(f.Topic LIKE @kw OR f.Description LIKE @kw OR p.PromoCode LIKE @kw)");
            p.Add("kw", $"%{query.Keyword.Trim()}%");
        }

        var whereSql = where.Count > 0 ? $"WHERE {string.Join(" AND ", where)}" : string.Empty;
        var sql = $"SELECT {SelectColumns} {FromJoin} {whereSql} {OrderBy};";
        return await QueryWithPromoAsync(conn, sql, p, ct);
    }

    public async Task<FeaturedPromoItem?> GetByIdAsync(int pkid, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var sql = $"SELECT {SelectColumns} {FromJoin} WHERE f.pkid = @pkid;";
        var rows = await QueryWithPromoAsync(conn, sql, new { pkid }, ct);
        return rows.SingleOrDefault();
    }

    public async Task<FeaturedPromoItem> CreateAsync(
        FeaturedPromoItemRequest request, CancellationToken ct = default)
    {
        // Transaction spans the INSERT, the nav re-read and the audit row, so the audit cannot
        // outlive a failed insert (nor vice versa).
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // pkid is int IDENTITY — excluded from the INSERT.
        // A duplicate (ScheduleOn, TrainingCenter_pkid, Slot) raises 2627 and a bad Promotion_pkid
        // raises 547; both surface as SqlException and are mapped in the controller. Either rolls
        // the transaction back on dispose.
        const string insertSql = @"
            INSERT INTO FeaturedPromoItem
                (ScheduleOn, TrainingCenter_pkid, Slot, Promotion_pkid, Topic, Description)
            VALUES
                (@ScheduleOn, @TrainingCenterPkid, @Slot, @PromotionPkid, @Topic, @Description);
            SELECT CAST(SCOPE_IDENTITY() AS int);";

        var pkid = await conn.ExecuteScalarAsync<int>(
            new CommandDefinition(insertSql, request, tx, cancellationToken: ct));

        // Re-read inside the transaction so the caller gets the resolved PromoCode nav object, not
        // a half-built instance (the public GetByIdAsync opens its own connection, which could not
        // see this uncommitted row).
        var sql = $"SELECT {SelectColumns} {FromJoin} WHERE f.pkid = @pkid;";
        var rows = await QueryWithPromoAsync(conn, sql, new { pkid }, ct, tx);
        var created = rows.SingleOrDefault()
            ?? throw new InvalidOperationException($"FeaturedPromoItem {pkid} vanished after insert.");

        await _audit.LogInsertAsync(conn, tx, TableName, created, ct);
        tx.Commit();
        return created;
    }

    public async Task<bool> UpdateAsync(FeaturedPromoItemRequest request, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // The "before" image feeds the audit's changed-column list; a missing row returns false,
        // and the disposed (uncommitted) transaction rolls back with no audit row written.
        var before = await SnapshotAsync(conn, tx, request.Pkid, ct);
        if (before is null) return false;

        // Slot is deliberately NOT in the SET list — it is owned by MoveAsync, which is the only
        // path that understands the unique index. Letting the Edit form post a Slot would give it
        // a second, swap-unaware way to hit 2627.
        const string updateSql = @"
            UPDATE FeaturedPromoItem
               SET ScheduleOn          = @ScheduleOn,
                   TrainingCenter_pkid = @TrainingCenterPkid,
                   Promotion_pkid      = @PromotionPkid,
                   Topic               = @Topic,
                   Description         = @Description
             WHERE pkid = @Pkid;";

        var affected = await conn.ExecuteAsync(
            new CommandDefinition(updateSql, request, tx, cancellationToken: ct));
        if (affected == 0) return false;

        var after = await SnapshotAsync(conn, tx, request.Pkid, ct);
        await _audit.LogUpdateAsync(conn, tx, TableName, before, after!, ct);
        tx.Commit();
        return true;
    }

    public async Task<bool> DeleteAsync(int pkid, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // Load first — after the DELETE the row's Topic (the audit ActionDesc) is gone.
        var row = await SnapshotAsync(conn, tx, pkid, ct);
        if (row is null) return false;

        // Nothing FK-references FeaturedPromoItem (verified via sys.foreign_keys against the dev
        // DB), so this raises no 547 and cascades nothing. It is a plain, safe single-row delete.
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM FeaturedPromoItem WHERE pkid = @pkid;",
            new { pkid }, tx, cancellationToken: ct));
        if (affected == 0) return false;

        await _audit.LogDeleteAsync(conn, tx, TableName, row, ct);
        tx.Commit();
        return true;
    }

    /// <summary>Coordinates of one grid cell — what MoveAsync needs to find a slot's neighbour.</summary>
    private sealed record SlotRow(int Pkid, DateOnly ScheduleOn, short TrainingCenterPkid, byte Slot);

    public async Task<FeaturedPromoItemMoveResult> MoveAsync(
        int pkid, string direction, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // UPDLOCK/HOLDLOCK so a concurrent move on the same day cannot interleave between the
        // read and the write and resurrect the 2627 this method exists to avoid.
        const string readSql = @"
            SELECT pkid, ScheduleOn, TrainingCenter_pkid AS TrainingCenterPkid, Slot
            FROM FeaturedPromoItem WITH (UPDLOCK, HOLDLOCK)
            WHERE pkid = @pkid;";

        var row = await conn.QuerySingleOrDefaultAsync<SlotRow>(
            new CommandDefinition(readSql, new { pkid }, tx, cancellationToken: ct));

        if (row is null)
        {
            tx.Rollback();
            return FeaturedPromoItemMoveResult.NotFound;
        }

        // "+" moves the item down the list, i.e. to a HIGHER slot number.
        var target = direction == "down" ? row.Slot + 1 : row.Slot - 1;
        if (target < FeaturedPromoItemSlots.Min || target > FeaturedPromoItemSlots.Max)
        {
            tx.Rollback();
            return FeaturedPromoItemMoveResult.OutOfRange;
        }

        var targetSlot = (byte)target;

        // Slots are not dense: 15 (day, center) combos in the dev DB have fewer than 3 rows, and
        // at least one has a hole at Slot 2 (2026-07-30 / center 3 holds Slots 1 and 3). So the
        // target slot may legitimately be empty — moving into it is a plain UPDATE, not a swap.
        const string neighbourSql = @"
            SELECT pkid
            FROM FeaturedPromoItem WITH (UPDLOCK, HOLDLOCK)
            WHERE ScheduleOn = @ScheduleOn
              AND TrainingCenter_pkid = @TrainingCenterPkid
              AND Slot = @targetSlot;";

        var neighbourPkid = await conn.QuerySingleOrDefaultAsync<int?>(new CommandDefinition(
            neighbourSql,
            new { row.ScheduleOn, row.TrainingCenterPkid, targetSlot },
            tx, cancellationToken: ct));

        // A move is an Update of Slot — it gets the same before/after audit as UpdateAsync, one
        // RowAudit row per row the move touches (two on a swap).
        var movedBefore = await SnapshotAsync(conn, tx, pkid, ct);
        var neighbourBefore = neighbourPkid is null
            ? null
            : await SnapshotAsync(conn, tx, neighbourPkid.Value, ct);

        if (neighbourPkid is null)
        {
            await conn.ExecuteAsync(new CommandDefinition(
                "UPDATE FeaturedPromoItem SET Slot = @targetSlot WHERE pkid = @pkid;",
                new { targetSlot, pkid }, tx, cancellationToken: ct));
        }
        else
        {
            // ONE statement, not two. IX_FeaturedPromoItem_UniqueDateLocSlot is checked at
            // statement completion, so a single UPDATE may swap a unique pair; issuing the two
            // updates sequentially instead fails with SqlException 2627 the moment the first one
            // lands on the neighbour's slot. Both behaviours verified against the dev DB.
            const string swapSql = @"
                UPDATE FeaturedPromoItem
                   SET Slot = CASE pkid WHEN @pkid THEN @targetSlot ELSE @currentSlot END
                 WHERE pkid IN (@pkid, @neighbourPkid);";

            await conn.ExecuteAsync(new CommandDefinition(
                swapSql,
                new { pkid, targetSlot, currentSlot = row.Slot, neighbourPkid = neighbourPkid.Value },
                tx, cancellationToken: ct));
        }

        var movedAfter = await SnapshotAsync(conn, tx, pkid, ct);
        await _audit.LogUpdateAsync(conn, tx, TableName, movedBefore!, movedAfter!, ct);

        if (neighbourBefore is not null)
        {
            var neighbourAfter = await SnapshotAsync(conn, tx, neighbourPkid!.Value, ct);
            await _audit.LogUpdateAsync(conn, tx, TableName, neighbourBefore, neighbourAfter!, ct);
        }

        tx.Commit();
        return FeaturedPromoItemMoveResult.Moved;
    }
}
