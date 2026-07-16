namespace CMS.API.Repositories;

/// <summary>
/// Credential lookup for the login endpoint. Deliberately separate from
/// <see cref="IAppUserRepository"/>, whose documented contract is that <c>PasswordHash</c> is never
/// in a SELECT list — this is the single place that reads it.
/// </summary>
public interface IAuthRepository
{
    /// <summary>
    /// Loads the credential for <paramref name="userId"/>, or null if no such row exists.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Matching follows the column's <c>Chinese_Taiwan_Stroke_CI_AS</c> collation, so the lookup is
    /// <b>case-insensitive</b> (and, per SQL's padding rules, insensitive to trailing spaces).
    /// UserId is an email — conventionally case-insensitive — and this matches
    /// <see cref="IAppUserRepository.GetByIdAsync"/>, so login and the CRUD screens agree on
    /// identity. The returned <see cref="UserCredential.UserId"/> is therefore the <b>stored</b>
    /// value, which is what the response must echo.
    /// </para>
    /// <para>
    /// Returns disabled accounts too (with <see cref="UserCredential.IsActive"/> false) rather than
    /// filtering them out in SQL; the caller rejects them. Both cases must produce the same generic
    /// 401 regardless.
    /// </para>
    /// </remarks>
    Task<UserCredential?> FindByUserIdAsync(string userId, CancellationToken ct = default);

    /// <summary>
    /// Sets <c>UserName</c> for <paramref name="userId"/>. Returns false if no such row exists.
    /// </summary>
    /// <remarks>
    /// Self-service rename for the signed-in user, so it is deliberately the narrowest possible
    /// write: <b>UserName is the only column in the SET list</b>. It is not
    /// <see cref="IAppUserRepository.UpdateAsync"/>, which also writes IsActive and replaces the
    /// user's AppUserRole rows — routing a profile save through that would let a user silently wipe
    /// their own roles or re-enable a disabled account.
    /// <para>
    /// <paramref name="userId"/> comes from the caller's JWT, never from a request body.
    /// </para>
    /// </remarks>
    Task<bool> UpdateUserNameAsync(string userId, string userName, CancellationToken ct = default);

    /// <summary>
    /// Sets <c>PasswordHash</c> and <c>PasswordUpdatedTime</c> for <paramref name="userId"/>.
    /// Returns false if no such row exists.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The two columns move together, because the timestamp is not an audit field — it is a
    /// <b>statement about the hash</b>. <c>NULL</c> means "still on the default password, never
    /// chosen" (see <c>spec/auth/AppUser.md</c>), so writing one without the other would make the row
    /// lie about the other.
    /// </para>
    /// <para>
    /// <paramref name="updatedAtUtc"/> therefore has two legitimate values, and the caller must mean
    /// one of them:
    /// <list type="bullet">
    /// <item><b>A UTC timestamp</b> — the user chose this password (變更密碼).</item>
    /// <item><b><c>null</c></b> — the password was reset to the shared default, so the row must read
    /// exactly like a freshly created user's and any "force a change at first sign-in" behaviour
    /// still applies. Passing a timestamp here would claim the user chose the default password and
    /// silently strand them on a publicly known one.</item>
    /// </list>
    /// </para>
    /// <para>
    /// When non-null it must be <b>UTC</b>: the column is a naive SQL <c>datetime</c> and the
    /// frontend renders it by appending <c>'Z'</c>, i.e. it reads the column as UTC. Local time would
    /// display 8 hours in the future. Decided with the user.
    /// </para>
    /// <para>
    /// <paramref name="passwordHash"/> is always derived server-side — no client ever sends or
    /// receives one.
    /// </para>
    /// </remarks>
    Task<bool> UpdatePasswordAsync(
        string userId, string passwordHash, DateTime? updatedAtUtc, CancellationToken ct = default);
}
