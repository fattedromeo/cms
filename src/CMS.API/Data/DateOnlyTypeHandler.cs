using System.Data;
using Dapper;

namespace CMS.API.Data;

/// <summary>
/// Maps SQL Server <c>date</c> columns to <see cref="DateOnly"/> in both directions.
/// </summary>
/// <remarks>
/// Required — not optional. The pinned stack (Dapper 2.1.79 + Microsoft.Data.SqlClient 7.0.2)
/// supports <see cref="DateOnly"/> in neither direction: reads fail with
/// <c>DataException: Error parsing column (ScheduleOn=... - DateTime)</c> and parameters fail with
/// <c>NotSupportedException: The member ... of type System.DateOnly cannot be used as a parameter
/// value</c>. Verified against the dev DB with Course.ScheduleOn/ScheduleOff.
/// <para>
/// <c>SqlMapper.AddTypeHandler</c> registers this for both <c>DateOnly</c> and <c>DateOnly?</c>,
/// which covers the nullable date-range filters on <see cref="Models.CourseQuery"/>.
/// </para>
/// <para>
/// No <c>TimeOnly</c> handler exists yet — no table in use has a <c>time</c> column. Add one here
/// following the same shape when that changes.
/// </para>
/// </remarks>
public sealed class DateOnlyTypeHandler : SqlMapper.TypeHandler<DateOnly>
{
    public override DateOnly Parse(object value) => DateOnly.FromDateTime((DateTime)value);

    public override void SetValue(IDbDataParameter parameter, DateOnly value)
    {
        // DbType.Date keeps this a SQL `date` (no time part) rather than a datetime.
        parameter.DbType = DbType.Date;
        parameter.Value = value.ToDateTime(TimeOnly.MinValue);
    }
}
