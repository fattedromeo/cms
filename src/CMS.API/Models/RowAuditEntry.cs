namespace CMS.API.Models;

/// <summary>
/// One RowAudit row as shown in a record's 異動紀錄 history (a projection of dbo.RowAudit —
/// TableName/PrimaryKeyValues are the filter, not part of the payload).
/// </summary>
/// <remarks>
/// <c>DateTime</c> holds the value <see cref="Services.RowAuditWriter"/> wrote with
/// <c>DateTime.Now</c> — server-<b>local</b> time, unlike <c>PasswordUpdatedTime</c> (UTC). The
/// frontend must therefore NOT apply the usual <c>+ 'Z'</c> datetime trick to this field, or every
/// timestamp shifts by the UTC offset.
/// </remarks>
public class RowAuditEntry
{
    public DateTime DateTime { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string ActionType { get; set; } = string.Empty;
    public string? ActionDesc { get; set; }
}
