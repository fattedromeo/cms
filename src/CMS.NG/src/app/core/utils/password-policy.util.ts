import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Client-side mirror of the API's `PasswordPolicy` (`CMS.API/Data/PasswordPolicy.cs`).
 *
 * ⚠️ **The API's copy is the rule; this one is convenience.** It exists so the form can reject a bad
 * password without a round-trip. The two must stay in step — change one and you must change the
 * other, or the UI and the API disagree about what is acceptable. The API re-checks regardless, so
 * the failure mode of drift is a confusing UX, not a security hole.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_REQUIRED_CLASSES = 3;

/** The specified rejection message, shown verbatim. Must match the API's `ViolationMessage`. */
export const PASSWORD_POLICY_MESSAGE =
  '密碼長度至少需 8 碼，且內容須至少包含四種字元的其中三種：\n' +
  '大寫英文／小寫英文／數字／符號\n' +
  'Password must be at least 8 characters and contain at least 3 of the 4 classes: ' +
  'uppercase / lowercase / digit / symbol.';

/**
 * True when `password` satisfies the policy.
 *
 * "Symbol" is *anything that is not upper, lower or digit* — the complement of the other three
 * rather than a punctuation whitelist, matching the API. So a space counts, and a caseless letter
 * (CJK) counts as a symbol. Passwords are never trimmed: whitespace is part of them.
 */
export function isPasswordPolicySatisfied(password: string | null | undefined): boolean {
  if (!password || password.length < PASSWORD_MIN_LENGTH) return false;

  let upper = false;
  let lower = false;
  let digit = false;
  let symbol = false;

  for (const c of password) {
    if (isUpper(c)) upper = true;
    else if (isLower(c)) lower = true;
    else if (c >= '0' && c <= '9') digit = true;
    else symbol = true;
  }

  return [upper, lower, digit, symbol].filter(Boolean).length >= PASSWORD_REQUIRED_CLASSES;
}

/**
 * Case tests that mirror .NET's `char.IsUpper` / `char.IsLower` rather than `/[A-Z]/`: a character
 * is upper-case when it differs from its lower-cased self. That keeps accented letters (É) classed
 * as letters on both sides, and leaves caseless scripts falling through to "symbol" exactly as the
 * C# does.
 */
function isUpper(c: string): boolean {
  return c !== c.toLowerCase() && c === c.toUpperCase();
}

function isLower(c: string): boolean {
  return c !== c.toUpperCase() && c === c.toLowerCase();
}

/** Reactive-forms validator for the new-password field. */
export function passwordPolicyValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null =>
    // An empty field is `required`'s business, not the policy's — reporting both at once would show
    // the user two errors for one mistake.
    !control.value || isPasswordPolicySatisfied(control.value) ? null : { passwordPolicy: true };
}

/**
 * Group-level validator: the new password and its confirmation must match.
 *
 * Lives on the group because it compares two controls. The error is also surfaced on the confirm
 * control so it can be shown next to the field the user would fix.
 */
export function passwordsMatchValidator(
  newPasswordKey: string,
  confirmKey: string,
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const newPassword = group.get(newPasswordKey)?.value;
    const confirm = group.get(confirmKey)?.value;

    // Don't shout "mismatch" at a half-typed confirmation that is still empty.
    if (!confirm) return null;
    // Ordinal comparison: two passwords differing only in case are different passwords.
    return newPassword === confirm ? null : { passwordsMismatch: true };
  };
}
