using System.Security.Cryptography;
using System.Text;

namespace CMS.API.Data;

/// <summary>
/// Hashes a password for storage in <c>AppUser.PasswordHash</c>:
/// SHA-256 over UTF-8, rendered as 64 lowercase hex characters.
/// </summary>
/// <remarks>
/// <para>
/// ⚠️ <b>Unsalted SHA-256 is weak for password storage</b> and is used here only to interoperate
/// with the existing login system — it is not a from-scratch choice. It has no salt and is designed
/// to be fast, which is the opposite of what password storage needs: it is cheap to brute-force, and
/// identical passwords hash identically (so every account seeded from the shared default password
/// gets the same hash, and cracking one cracks all of them). A salted, slow KDF — PBKDF2, bcrypt or
/// Argon2 — is the correct tool. If the login app ever moves, replace this method and rehash.
/// </para>
/// <para>
/// The format is inferred, not confirmed: <c>PasswordHash</c> is <c>nvarchar(800)</c> and the one
/// existing row is 64 lowercase hex chars, which matches a SHA-256 hex digest. That row's hash is
/// NOT SHA256 of the configured default password, but it also has <c>PasswordUpdatedTime</c> set —
/// i.e. that user changed their password away from the default — so it neither confirms nor refutes
/// the encoding. Verify against the login app before relying on this in production; if it disagrees,
/// this method is the only thing that changes.
/// </para>
/// </remarks>
public static class PasswordHasher
{
    public static string Hash(string password)
    {
        ArgumentNullException.ThrowIfNull(password);
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(password));
        return Convert.ToHexString(digest).ToLowerInvariant();
    }
}
