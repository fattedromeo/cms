using CMS.API.Data;

namespace CMS.API.Tests;

/// <summary>
/// Tests for <see cref="PasswordPolicy"/> — a pure function, security-relevant, so it gets real
/// coverage. Its Angular mirror (`core/utils/password-policy.util.ts`) has a matching spec; the two
/// must agree, and these cases are deliberately duplicated there.
/// </summary>
public class PasswordPolicyTests
{
    // --- Length ------------------------------------------------------------
    [Theory]
    [InlineData("Ab1!")]      // 4
    [InlineData("Ab1!xy")]    // 6
    [InlineData("Ab1!xyz")]   // 7 — one short, and all four classes present
    public void ShorterThanEight_IsRejected_EvenWithEveryClass(string password)
    {
        Assert.False(PasswordPolicy.IsSatisfiedBy(password));
    }

    [Fact]
    public void ExactlyEight_IsAccepted()
    {
        // Pins the boundary: 8 passes, 7 does not.
        Assert.True(PasswordPolicy.IsSatisfiedBy("Abcdefg1"));
        Assert.False(PasswordPolicy.IsSatisfiedBy("Abcdef1"));
    }

    // --- Class count -------------------------------------------------------
    [Theory]
    [InlineData("abcdefghij")]      // lower only            => 1
    [InlineData("ABCDEFGHIJ")]      // upper only            => 1
    [InlineData("1234567890")]      // digit only            => 1
    [InlineData("!@#$%^&*()")]      // symbol only           => 1
    [InlineData("abcdefgh12")]      // lower + digit         => 2
    [InlineData("ABCDEFGH12")]      // upper + digit         => 2
    [InlineData("abcdefghIJ")]      // lower + upper         => 2
    [InlineData("abcdefgh!@")]      // lower + symbol        => 2
    [InlineData("12345678!@")]      // digit + symbol        => 2
    public void FewerThanThreeClasses_IsRejected_EvenWhenLongEnough(string password)
    {
        Assert.False(PasswordPolicy.IsSatisfiedBy(password));
    }

    [Theory]
    [InlineData("Abcdefg1")]        // upper + lower + digit
    [InlineData("Abcdefg!")]        // upper + lower + symbol
    [InlineData("ABCDEF1!")]        // upper + digit + symbol
    [InlineData("abcdef1!")]        // lower + digit + symbol
    public void ExactlyThreeClasses_IsAccepted(string password)
    {
        Assert.True(PasswordPolicy.IsSatisfiedBy(password));
    }

    [Fact]
    public void AllFourClasses_IsAccepted()
    {
        Assert.True(PasswordPolicy.IsSatisfiedBy("Abcdef1!"));
    }

    // --- What counts as a "symbol" -----------------------------------------
    [Theory]
    [InlineData("Abcdefg ")]   // a space IS a symbol...
    [InlineData("Abcdefg_")]
    [InlineData("Abcdefg-")]
    [InlineData("Abcdefg€")]   // ...as is any non-letter, non-digit
    public void SymbolIsAnythingThatIsNotUpperLowerOrDigit(string password)
    {
        // "Symbol" is defined as the complement of the other three rather than a punctuation
        // whitelist, so an unlisted character can never be silently un-classifiable.
        Assert.True(PasswordPolicy.IsSatisfiedBy(password));
    }

    [Fact]
    public void CaselessLetters_CountAsSymbols()
    {
        // A documented consequence of that definition: CJK has no upper/lower, so it lands in
        // "symbol". Worth pinning so the behaviour is a known decision, not a surprise.
        Assert.True(PasswordPolicy.IsSatisfiedBy("abc密碼123"));  // lower + digit + symbol
        Assert.False(PasswordPolicy.IsSatisfiedBy("密碼密碼密碼密碼")); // symbol only => 1 class
    }

    // --- Passwords are not trimmed -----------------------------------------
    [Fact]
    public void LeadingAndTrailingSpacesAreRealCharacters()
    {
        // 8 chars only if the spaces count; and they supply the symbol class.
        Assert.True(PasswordPolicy.IsSatisfiedBy(" Abcde1 "));
    }

    // --- Degenerate input --------------------------------------------------
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("       ")]  // 7 spaces: too short AND one class
    public void NullOrEmptyOrWhitespace_IsRejected(string? password)
    {
        Assert.False(PasswordPolicy.IsSatisfiedBy(password));
    }

    // --- The message -------------------------------------------------------
    [Fact]
    public void ViolationMessage_IsBilingualAndNamesTheRule()
    {
        // The exact wording is specified by the product, so pin the substance rather than paraphrase.
        Assert.Contains("密碼長度至少需 8 碼", PasswordPolicy.ViolationMessage);
        Assert.Contains("大寫英文／小寫英文／數字／符號", PasswordPolicy.ViolationMessage);
        Assert.Contains("at least 3 of the 4 classes", PasswordPolicy.ViolationMessage);
    }
}
