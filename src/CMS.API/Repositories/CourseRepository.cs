using System.Data;
using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class CourseRepository : ICourseRepository
{
    private readonly IDbConnectionFactory _factory;

    public CourseRepository(IDbConnectionFactory factory) => _factory = factory;

    // Course has no nchar columns -> no RTRIM here (the certifications *lookup* does need it).
    //
    // Each nav block starts with a column aliased exactly `Pkid` so splitOn "Pkid,Pkid,Pkid" lands
    // on the right boundaries: Dapper searches for each split from startIdx + 1, so `c.pkid AS Pkid`
    // at index 0 is skipped rather than splitting the Course block away.
    private const string SelectColumns = @"
        c.pkid AS Pkid, c.Title, c.OfficialTitle, c.CourseId, c.ProdCourseId, c.FriendlyUrl,
        c.DisplayOrder,
        c.Partner_pkid AS PartnerPkid, c.CourseGroup_pkid AS CourseGroupPkid,
        c.PublishStatus_pkid AS PublishStatusPkid,
        c.ScheduleOn, c.ScheduleOff, c.Hour, c.ListPrice, c.LearningCredit,
        c.Material, c.Objective, c.Target, c.Prerequisites, c.Outline,
        c.TowardCertOrExam, c.Note, c.OtherInfo, c.CanRepeat,
        p.pkid AS Pkid, p.Name,
        g.pkid AS Pkid, g.Description,
        s.pkid AS Pkid, s.Description";

    // CourseGroup is LEFT JOINed: CourseGroup_pkid is nullable. Dapper yields a null nav object
    // (not a zero-filled instance) when the join misses, so the map lambda needs no null-coalescing.
    private const string FromJoins = @"
        FROM Course c
        INNER JOIN Partner p       ON p.pkid = c.Partner_pkid
        LEFT  JOIN CourseGroup g   ON g.pkid = c.CourseGroup_pkid
        INNER JOIN PublishStatus s ON s.pkid = c.PublishStatus_pkid";

    private const string SplitOn = "Pkid,Pkid,Pkid";

    private static readonly Func<Course, CoursePartnerRef, CourseGroupRef, CoursePublishStatusRef, Course> MapNav =
        (course, partner, group, status) =>
        {
            course.Partner = partner;
            course.CourseGroup = group;
            course.PublishStatus = status;
            return course;
        };

    // Default sort is CourseId ASC, not DisplayOrder ASC: DisplayOrder is not a global ordering
    // (1,080 rows share only 65 distinct values, ambiguous even within one partner), whereas
    // CourseId is unique across every row. See spec/course/Course.md.
    private const string OrderBy = "ORDER BY c.CourseId ASC";

    public async Task<IEnumerable<Course>> GetAllAsync(CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var sql = $@"SELECT {SelectColumns} {FromJoins} {OrderBy};";
        return await conn.QueryAsync<Course, CoursePartnerRef, CourseGroupRef, CoursePublishStatusRef, Course>(
            new CommandDefinition(sql, cancellationToken: ct), MapNav, SplitOn);
    }

    public async Task<IEnumerable<Course>> QueryAsync(CourseQuery query, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        var where = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            where.Add(@"(c.Title LIKE @kw OR c.OfficialTitle LIKE @kw OR c.CourseId LIKE @kw
                        OR c.ProdCourseId LIKE @kw OR c.FriendlyUrl LIKE @kw)");
            p.Add("kw", $"%{query.Keyword.Trim()}%");
        }

        if (query.PartnerPkid.HasValue)
        {
            where.Add("c.Partner_pkid = @PartnerPkid");
            p.Add("PartnerPkid", query.PartnerPkid.Value);
        }

        if (query.CourseGroupPkid.HasValue)
        {
            where.Add("c.CourseGroup_pkid = @CourseGroupPkid");
            p.Add("CourseGroupPkid", query.CourseGroupPkid.Value);
        }

        if (query.PublishStatusPkid.HasValue)
        {
            where.Add("c.PublishStatus_pkid = @PublishStatusPkid");
            p.Add("PublishStatusPkid", query.PublishStatusPkid.Value);
        }

        // Date bounds are inclusive on both ends.
        if (query.ScheduleOnFrom.HasValue)
        {
            where.Add("c.ScheduleOn >= @ScheduleOnFrom");
            p.Add("ScheduleOnFrom", query.ScheduleOnFrom.Value);
        }

        if (query.ScheduleOnTo.HasValue)
        {
            where.Add("c.ScheduleOn <= @ScheduleOnTo");
            p.Add("ScheduleOnTo", query.ScheduleOnTo.Value);
        }

        if (query.ScheduleOffFrom.HasValue)
        {
            where.Add("c.ScheduleOff >= @ScheduleOffFrom");
            p.Add("ScheduleOffFrom", query.ScheduleOffFrom.Value);
        }

        if (query.ScheduleOffTo.HasValue)
        {
            where.Add("c.ScheduleOff <= @ScheduleOffTo");
            p.Add("ScheduleOffTo", query.ScheduleOffTo.Value);
        }

        if (query.CanRepeat.HasValue)
        {
            where.Add("c.CanRepeat = @CanRepeat");
            p.Add("CanRepeat", query.CanRepeat.Value);
        }

        var whereSql = where.Count > 0 ? $"WHERE {string.Join(" AND ", where)}" : string.Empty;
        var sql = $@"SELECT {SelectColumns} {FromJoins} {whereSql} {OrderBy};";
        return await conn.QueryAsync<Course, CoursePartnerRef, CourseGroupRef, CoursePublishStatusRef, Course>(
            new CommandDefinition(sql, p, cancellationToken: ct), MapNav, SplitOn);
    }

    public async Task<Course?> GetByIdAsync(int pkid, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        return await GetByIdAsync(conn, null, pkid, ct);
    }

    /// <summary>Shared by the public read and by Create/Update, which re-read inside their transaction.</summary>
    private static async Task<Course?> GetByIdAsync(
        IDbConnection conn, IDbTransaction? tx, int pkid, CancellationToken ct)
    {
        var sql = $@"SELECT {SelectColumns} {FromJoins} WHERE c.pkid = @pkid;";
        var rows = await conn.QueryAsync<Course, CoursePartnerRef, CourseGroupRef, CoursePublishStatusRef, Course>(
            new CommandDefinition(sql, new { pkid }, tx, cancellationToken: ct), MapNav, SplitOn);

        var course = rows.SingleOrDefault();
        if (course is null) return null;

        // N-N lists: separate queries on the same connection.
        var certificationPkids = await conn.QueryAsync<int>(new CommandDefinition(
            "SELECT Certification_pkid FROM CourseInCertification WHERE Course_pkid = @pkid ORDER BY Certification_pkid;",
            new { pkid }, tx, cancellationToken: ct));
        course.CertificationPkids = certificationPkids.ToList();

        var jobCategoryPkids = await conn.QueryAsync<short>(new CommandDefinition(
            "SELECT JobCategory_pkid FROM CourseJobCategories WHERE Course_pkid = @pkid ORDER BY JobCategory_pkid;",
            new { pkid }, tx, cancellationToken: ct));
        course.JobCategoryPkids = jobCategoryPkids.ToList();

        return course;
    }

    public async Task<Course> CreateAsync(CourseRequest request, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // pkid is int IDENTITY -> excluded from the column list. No computed columns to exclude.
        const string insertSql = @"
            INSERT INTO Course (Title, OfficialTitle, CourseId, ProdCourseId, FriendlyUrl, DisplayOrder,
                Partner_pkid, CourseGroup_pkid, PublishStatus_pkid, ScheduleOn, ScheduleOff, Hour,
                ListPrice, LearningCredit, Material, Objective, Target, Prerequisites, Outline,
                TowardCertOrExam, Note, OtherInfo, CanRepeat)
            VALUES (@Title, @OfficialTitle, @CourseId, @ProdCourseId, @FriendlyUrl, @DisplayOrder,
                @PartnerPkid, @CourseGroupPkid, @PublishStatusPkid, @ScheduleOn, @ScheduleOff, @Hour,
                @ListPrice, @LearningCredit, @Material, @Objective, @Target, @Prerequisites, @Outline,
                @TowardCertOrExam, @Note, @OtherInfo, @CanRepeat);
            SELECT CAST(SCOPE_IDENTITY() AS int);";
        var pkid = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            insertSql, request, tx, cancellationToken: ct));

        await ReplaceCertificationsAsync(conn, tx, pkid, request.CertificationPkids, ct);
        await ReplaceJobCategoriesAsync(conn, tx, pkid, request.JobCategoryPkids, ct);

        // Re-read inside the transaction so the response carries the resolved nav objects.
        var created = await GetByIdAsync(conn, tx, pkid, ct);
        tx.Commit();
        return created!;
    }

    public async Task<bool> UpdateAsync(CourseRequest request, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        using var tx = conn.BeginTransaction();

        // pkid is the immutable identity key; every other column is mutable.
        const string updateSql = @"
            UPDATE Course
               SET Title = @Title,
                   OfficialTitle = @OfficialTitle,
                   CourseId = @CourseId,
                   ProdCourseId = @ProdCourseId,
                   FriendlyUrl = @FriendlyUrl,
                   DisplayOrder = @DisplayOrder,
                   Partner_pkid = @PartnerPkid,
                   CourseGroup_pkid = @CourseGroupPkid,
                   PublishStatus_pkid = @PublishStatusPkid,
                   ScheduleOn = @ScheduleOn,
                   ScheduleOff = @ScheduleOff,
                   Hour = @Hour,
                   ListPrice = @ListPrice,
                   LearningCredit = @LearningCredit,
                   Material = @Material,
                   Objective = @Objective,
                   Target = @Target,
                   Prerequisites = @Prerequisites,
                   Outline = @Outline,
                   TowardCertOrExam = @TowardCertOrExam,
                   Note = @Note,
                   OtherInfo = @OtherInfo,
                   CanRepeat = @CanRepeat
             WHERE pkid = @Pkid;";
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            updateSql, request, tx, cancellationToken: ct));

        if (affected == 0)
        {
            tx.Rollback();
            return false;
        }

        await ReplaceCertificationsAsync(conn, tx, request.Pkid, request.CertificationPkids, ct);
        await ReplaceJobCategoriesAsync(conn, tx, request.Pkid, request.JobCategoryPkids, ct);

        tx.Commit();
        return true;
    }

    public async Task<bool> DeleteAsync(int pkid, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        // No explicit junction cleanup needed (unlike AppRoleRepository.DeleteAsync): both
        // FK_CourseInCertification_Course and FK_CourseJobCategories_Course are ON DELETE CASCADE,
        // so those rows go silently. CourseFAQ / CourseRelatedLink / HotCourse do NOT cascade and
        // still raise SqlException 547 -> 409 in the controller.
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM Course WHERE pkid = @pkid;",
            new { pkid }, cancellationToken: ct));
        return affected > 0;
    }

    /// <summary>N-N sync: delete-then-reinsert the CourseInCertification rows for a course.</summary>
    private static async Task ReplaceCertificationsAsync(
        IDbConnection conn, IDbTransaction tx, int pkid, List<int> certificationPkids, CancellationToken ct)
    {
        await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM CourseInCertification WHERE Course_pkid = @pkid;",
            new { pkid }, tx, cancellationToken: ct));

        var distinct = certificationPkids.Distinct().ToList();
        if (distinct.Count == 0) return;

        await conn.ExecuteAsync(new CommandDefinition(
            "INSERT INTO CourseInCertification (Course_pkid, Certification_pkid) VALUES (@pkid, @CertificationPkid);",
            distinct.Select(id => new { pkid, CertificationPkid = id }), tx, cancellationToken: ct));
    }

    /// <summary>N-N sync: delete-then-reinsert the CourseJobCategories rows for a course.</summary>
    private static async Task ReplaceJobCategoriesAsync(
        IDbConnection conn, IDbTransaction tx, int pkid, List<short> jobCategoryPkids, CancellationToken ct)
    {
        await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM CourseJobCategories WHERE Course_pkid = @pkid;",
            new { pkid }, tx, cancellationToken: ct));

        var distinct = jobCategoryPkids.Distinct().ToList();
        if (distinct.Count == 0) return;

        await conn.ExecuteAsync(new CommandDefinition(
            "INSERT INTO CourseJobCategories (Course_pkid, JobCategory_pkid) VALUES (@pkid, @JobCategoryPkid);",
            distinct.Select(id => new { pkid, JobCategoryPkid = id }), tx, cancellationToken: ct));
    }
}
