using CMS.API.Models;

namespace CMS.API.Repositories;

/// <summary>
/// Read side of the RowAudit table: the history of one record, for the 異動紀錄 History badge.
/// (The write side is <see cref="Services.IRowAuditWriter"/> — kept separate because writers run
/// inside the repositories' own transactions while this is a plain standalone read.)
/// </summary>
public interface IRowAuditRepository
{
    /// <summary>
    /// Audit rows for one record — TableName + its pkid (RowAudit.PrimaryKeyValues holds the pkid
    /// as a string) — newest first.
    /// </summary>
    Task<IEnumerable<RowAuditEntry>> GetForRecordAsync(
        string tableName, string pkid, CancellationToken ct = default);
}
