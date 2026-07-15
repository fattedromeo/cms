using CMS.API.Data;

namespace CMS.API.Tests;

/// <summary>
/// Tests for <see cref="PasswordHasher"/>. A pure function with no DB, and security-relevant, so it
/// gets real coverage — the known-vector test pins the encoding (UTF-8), the algorithm (SHA-256)
/// and the casing (lowercase hex), which is exactly what must match the existing login system.
/// </summary>
public class PasswordHasherTests
{
    [Fact]
    public void Hash_MatchesKnownSha256Vector()
    {
        // The canonical SHA-256("abc") digest. If this fails, the encoding/algorithm drifted.
        Assert.Equal(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            PasswordHasher.Hash("abc"));
    }

    [Fact]
    public void Hash_MatchesKnownSha256Vector_ForEmptyString()
    {
        Assert.Equal(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            PasswordHasher.Hash(string.Empty));
    }

    [Fact]
    public void Hash_ProducesSixtyFourLowercaseHexChars()
    {
        var hash = PasswordHasher.Hash("CMS4fun#");

        // AppUser.PasswordHash is nvarchar(800) and existing rows are 64 chars.
        Assert.Equal(64, hash.Length);
        Assert.Matches("^[0-9a-f]{64}$", hash);
    }

    [Fact]
    public void Hash_IsDeterministic()
    {
        Assert.Equal(PasswordHasher.Hash("CMS4fun#"), PasswordHasher.Hash("CMS4fun#"));
    }

    [Fact]
    public void Hash_DiffersForDifferentInputs()
    {
        Assert.NotEqual(PasswordHasher.Hash("CMS4fun#"), PasswordHasher.Hash("cms4fun#"));
    }

    [Fact]
    public void Hash_UsesUtf8_NotUtf16_ForNonAsciiInput()
    {
        // Pins UTF-8. The two encodings give different digests for non-ASCII input, and which one
        // the login system expects is exactly what must not drift.
        var utf8Hex = Convert.ToHexString(
            System.Security.Cryptography.SHA256.HashData(
                System.Text.Encoding.UTF8.GetBytes("密碼"))).ToLowerInvariant();
        var utf16Hex = Convert.ToHexString(
            System.Security.Cryptography.SHA256.HashData(
                System.Text.Encoding.Unicode.GetBytes("密碼"))).ToLowerInvariant();

        Assert.NotEqual(utf8Hex, utf16Hex); // guards the test itself from being vacuous
        Assert.Equal(utf8Hex, PasswordHasher.Hash("密碼"));
    }

    [Fact]
    public void Hash_NullInput_Throws()
    {
        Assert.Throws<ArgumentNullException>(() => PasswordHasher.Hash(null!));
    }
}
