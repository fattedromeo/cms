using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class CourseGroupRepository : ICourseGroupRepository
{
    private readonly IDbConnectionFactory _factory;

    public CourseGroupRepository(IDbConnectionFactory factory) => _factory = factory;

    // Description is nvarchar (not nchar) → no RTRIM needed; CourseGroup has no FKs → no JOINs.
    private const string SelectColumns = "g.pkid, g.Description";

    public async Task<IEnumerable<CourseGroup>> GetAllAsync(CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var sql = $@"SELECT {SelectColumns} FROM CourseGroup g ORDER BY g.pkid ASC;";
        return await conn.QueryAsync<CourseGroup>(new CommandDefinition(sql, cancellationToken: ct));
    }

    public async Task<IEnumerable<CourseGroup>> QueryAsync(CourseGroupQuery query, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        var where = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            where.Add("g.Description LIKE @kw");
            p.Add("kw", $"%{query.Keyword.Trim()}%");
        }

        var whereSql = where.Count > 0 ? $"WHERE {string.Join(" AND ", where)}" : string.Empty;
        var sql = $@"SELECT {SelectColumns} FROM CourseGroup g {whereSql} ORDER BY g.pkid ASC;";
        return await conn.QueryAsync<CourseGroup>(new CommandDefinition(sql, p, cancellationToken: ct));
    }

    public async Task<CourseGroup?> GetByIdAsync(short pkid, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var sql = $@"SELECT {SelectColumns} FROM CourseGroup g WHERE g.pkid = @pkid;";
        return await conn.QuerySingleOrDefaultAsync<CourseGroup>(
            new CommandDefinition(sql, new { pkid }, cancellationToken: ct));
    }

    public async Task<CourseGroup> CreateAsync(CourseGroupRequest request, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        // pkid is smallint IDENTITY — excluded from the INSERT; return the new key.
        const string insertSql = @"
            INSERT INTO CourseGroup (Description)
            VALUES (@Description);
            SELECT CAST(SCOPE_IDENTITY() AS smallint);";
        var pkid = await conn.ExecuteScalarAsync<short>(new CommandDefinition(
            insertSql, request, cancellationToken: ct));

        return new CourseGroup
        {
            Pkid = pkid,
            Description = request.Description
        };
    }

    public async Task<bool> UpdateAsync(CourseGroupRequest request, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        // pkid is the immutable identity key; only Description is mutable.
        const string updateSql = @"
            UPDATE CourseGroup
               SET Description = @Description
             WHERE pkid = @Pkid;";
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            updateSql, request, cancellationToken: ct));
        return affected > 0;
    }

    public async Task<bool> DeleteAsync(short pkid, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        // FK_Course_CourseGroup is ON DELETE CASCADE: any Course rows in this group are deleted
        // along with it (no 547 raised). FK_PartnerCourseGroup_CourseGroup does NOT cascade, so a
        // group still used by a PartnerCourseGroup row raises SqlException 547 → 409 in the controller.
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM CourseGroup WHERE pkid = @pkid;",
            new { pkid }, cancellationToken: ct));
        return affected > 0;
    }
}
