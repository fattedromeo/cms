namespace CMS.API.Repositories;

/// <summary>
/// The AppUser columns the login check needs, including <see cref="PasswordHash"/>.
/// </summary>
/// <remarks>
/// <para>
/// 🔐 <b>This is not a DTO and must never be returned from a controller or serialized to a client.</b>
/// It is the one type in the codebase that carries <c>AppUser.PasswordHash</c>, which is why it
/// lives in <c>Repositories/</c> rather than <c>Models/</c>: everything in <c>Models/</c> is
/// reachable by a client, and the standing rule (see <c>spec/reference/backend.md</c>) is that the
/// hash gets no DTO property at all. <see cref="Models.LoginResponse"/> is the shape that goes out,
/// and it has no password property to bind.
/// </para>
/// <para>
/// It is public only so <c>CMS.API.Tests</c> can construct one to mock
/// <see cref="IAuthRepository"/>. <see cref="IsActive"/> is carried rather than filtered away in
/// SQL so the "inactive user cannot log in" rule is enforced in the controller, where a mocked-repo
/// test can actually reach it.
/// </para>
/// </remarks>
/// <param name="UserId">The stored (canonical) UserId — not whatever casing the client supplied.</param>
/// <param name="UserName">Display name, becomes the token's <c>name</c> claim.</param>
/// <param name="PasswordHash">SHA-256 hex digest as stored. Compare, never emit.</param>
/// <param name="IsActive">False means the account is disabled: login must fail.</param>
/// <param name="RoleIds">RoleIds from AppUserRole; each becomes a <c>role</c> claim.</param>
public sealed record UserCredential(
    string UserId,
    string UserName,
    string PasswordHash,
    bool IsActive,
    IReadOnlyList<string> RoleIds);
