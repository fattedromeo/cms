using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class PartnerRepository : IPartnerRepository
{
    private readonly IDbConnectionFactory _factory;

    public PartnerRepository(IDbConnectionFactory factory) => _factory = factory;

    // No nchar columns → no RTRIM needed; no FK JOINs (Partner has no FKs).
    private const string SelectColumns =
        "p.pkid, p.Name, p.AppKey, p.NameOnPartnerMenu, p.NameOnCourseDetailPage, p.DisplayOrder, p.ImageFilename";

    public async Task<IEnumerable<Partner>> GetAllAsync(CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var sql = $@"SELECT {SelectColumns} FROM Partner p ORDER BY p.DisplayOrder ASC;";
        return await conn.QueryAsync<Partner>(new CommandDefinition(sql, cancellationToken: ct));
    }

    public async Task<IEnumerable<Partner>> QueryAsync(PartnerQuery query, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        var where = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            where.Add(@"(p.Name LIKE @kw OR p.AppKey LIKE @kw
                        OR p.NameOnPartnerMenu LIKE @kw OR p.NameOnCourseDetailPage LIKE @kw)");
            p.Add("kw", $"%{query.Keyword.Trim()}%");
        }

        var whereSql = where.Count > 0 ? $"WHERE {string.Join(" AND ", where)}" : string.Empty;
        var sql = $@"SELECT {SelectColumns} FROM Partner p {whereSql} ORDER BY p.DisplayOrder ASC;";
        return await conn.QueryAsync<Partner>(new CommandDefinition(sql, p, cancellationToken: ct));
    }

    public async Task<Partner?> GetByIdAsync(short pkid, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        var sql = $@"SELECT {SelectColumns} FROM Partner p WHERE p.pkid = @pkid;";
        return await conn.QuerySingleOrDefaultAsync<Partner>(
            new CommandDefinition(sql, new { pkid }, cancellationToken: ct));
    }

    public async Task<Partner> CreateAsync(PartnerRequest request, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        // pkid is smallint IDENTITY — excluded from the INSERT; return the new key.
        const string insertSql = @"
            INSERT INTO Partner (Name, AppKey, NameOnPartnerMenu, NameOnCourseDetailPage, DisplayOrder, ImageFilename)
            VALUES (@Name, @AppKey, @NameOnPartnerMenu, @NameOnCourseDetailPage, @DisplayOrder, @ImageFilename);
            SELECT CAST(SCOPE_IDENTITY() AS smallint);";
        var pkid = await conn.ExecuteScalarAsync<short>(new CommandDefinition(
            insertSql, request, cancellationToken: ct));

        return new Partner
        {
            Pkid = pkid,
            Name = request.Name,
            AppKey = request.AppKey,
            NameOnPartnerMenu = request.NameOnPartnerMenu,
            NameOnCourseDetailPage = request.NameOnCourseDetailPage,
            DisplayOrder = request.DisplayOrder,
            ImageFilename = request.ImageFilename
        };
    }

    public async Task<bool> UpdateAsync(PartnerRequest request, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        // pkid is the immutable identity key; update the mutable columns by pkid.
        const string updateSql = @"
            UPDATE Partner
               SET Name = @Name,
                   AppKey = @AppKey,
                   NameOnPartnerMenu = @NameOnPartnerMenu,
                   NameOnCourseDetailPage = @NameOnCourseDetailPage,
                   DisplayOrder = @DisplayOrder,
                   ImageFilename = @ImageFilename
             WHERE pkid = @Pkid;";
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            updateSql, request, cancellationToken: ct));
        return affected > 0;
    }

    public async Task<bool> DeleteAsync(short pkid, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);
        // A FK violation (Course/Certification/PartnerCourseGroup still referencing this
        // partner) surfaces as SqlException 547 and is translated to 409 by the controller.
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM Partner WHERE pkid = @pkid;",
            new { pkid }, cancellationToken: ct));
        return affected > 0;
    }
}
