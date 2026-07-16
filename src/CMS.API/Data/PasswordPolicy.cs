namespace CMS.API.Data;

/// <summary>
/// Complexity rule for a user-chosen password: at least <see cref="MinimumLength"/> characters, and
/// at least <see cref="RequiredClasses"/> of the four character classes.
/// </summary>
/// <remarks>
/// <para>
/// ⚠️ <b>Mirrored in the frontend</b> (<c>core/utils/password-policy.util.ts</c>) so the form can
/// reject a bad password without a round-trip. The two must stay in step — but the copy here is the
/// one that decides: the client's is convenience, this one is the rule. Changing either alone means
/// the UI and the API disagree about what is acceptable.
/// </para>
/// <para>
/// This is about the password the user <i>chooses</i>. It says nothing about how it is stored —
/// storage is unsalted SHA-256, which <see cref="PasswordHasher"/> explains is weak and inherited.
/// Complexity does not compensate for that.
/// </para>
/// </remarks>
public static class PasswordPolicy
{
    public const int MinimumLength = 8;

    /// <summary>How many of the four classes must appear.</summary>
    public const int RequiredClasses = 3;

    /// <summary>
    /// The rejection message, shown verbatim in the UI. Bilingual, and the exact wording is
    /// specified — do not paraphrase.
    /// </summary>
    public const string ViolationMessage =
        "密碼長度至少需 8 碼，且內容須至少包含四種字元的其中三種：\n" +
        "大寫英文／小寫英文／數字／符號\n" +
        "Password must be at least 8 characters and contain at least 3 of the 4 classes: " +
        "uppercase / lowercase / digit / symbol.";

    /// <summary>
    /// True when <paramref name="password"/> satisfies the policy.
    /// </summary>
    /// <remarks>
    /// The four classes are uppercase / lowercase / digit / <b>symbol</b>, where "symbol" is defined
    /// as <i>anything that is none of the other three</i> rather than a fixed list of punctuation.
    /// That keeps the four classes mutually exclusive and exhaustive, so every character counts for
    /// exactly one, and it avoids a whitelist that would silently reject an unlisted character.
    /// Consequence worth knowing: a character with no case (CJK, for instance) counts as a symbol.
    /// The password is <b>never trimmed</b> — leading/trailing spaces are part of it.
    /// </remarks>
    public static bool IsSatisfiedBy(string? password)
    {
        if (password is null || password.Length < MinimumLength) return false;

        bool upper = false, lower = false, digit = false, symbol = false;
        foreach (var c in password)
        {
            if (char.IsUpper(c)) upper = true;
            else if (char.IsLower(c)) lower = true;
            else if (char.IsDigit(c)) digit = true;
            else symbol = true;
        }

        var classes = (upper ? 1 : 0) + (lower ? 1 : 0) + (digit ? 1 : 0) + (symbol ? 1 : 0);
        return classes >= RequiredClasses;
    }
}
