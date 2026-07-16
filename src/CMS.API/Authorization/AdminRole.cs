namespace CMS.API.Controllers;

/// <summary>
/// The role that gates 系統管理 Admin.
/// </summary>
/// <remarks>
/// <para>
/// A shared constant because the exact string has to agree in several places at once —
/// <c>[Authorize(Roles = ...)]</c> on the admin controllers, the tests, and the Angular sidebar /
/// route guard. It is a <b>RoleId value from <c>dbo.AppRole</c></b>, not a name this app invents:
/// the dev DB holds `Admin`, `developer` and `User`, and `miles@uuu.com.tw` has all three.
/// </para>
/// <para>
/// ⚠️ Matching is <b>case-sensitive</b>. Claims-based role checks compare ordinally, unlike the
/// database's <c>Chinese_Taiwan_Stroke_CI_AS</c> collation — so a RoleId stored as `admin` would
/// <i>not</i> satisfy <c>[Authorize(Roles = "Admin")]</c> even though SQL considers the two equal.
/// If a differently-cased Admin row is ever added, this is where it breaks.
/// </para>
/// <para>
/// Lives in the <c>Controllers</c> namespace so the attribute reads without an extra using.
/// </para>
/// </remarks>
public static class AdminRole
{
    public const string Name = "Admin";
}
