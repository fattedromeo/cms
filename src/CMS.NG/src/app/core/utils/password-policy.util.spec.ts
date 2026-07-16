import { FormBuilder, Validators } from '@angular/forms';
import {
  PASSWORD_POLICY_MESSAGE,
  isPasswordPolicySatisfied,
  passwordPolicyValidator,
  passwordsMatchValidator,
} from './password-policy.util';

/**
 * Mirror of `CMS.API.Tests/PasswordPolicyTests.cs`. The cases are deliberately the same on both
 * sides: this file and the C# one are the only thing keeping the two copies of the rule in step, so
 * a divergence should fail here rather than surface as a form that accepts what the API refuses.
 */
describe('password policy', () => {
  describe('isPasswordPolicySatisfied', () => {
    // --- Length ----------------------------------------------------------
    it('rejects anything shorter than 8, even with all four classes', () => {
      expect(isPasswordPolicySatisfied('Ab1!')).toBeFalse();
      expect(isPasswordPolicySatisfied('Ab1!xyz')).toBeFalse(); // 7 — one short
    });

    it('accepts exactly 8', () => {
      expect(isPasswordPolicySatisfied('Abcdefg1')).toBeTrue();
      expect(isPasswordPolicySatisfied('Abcdef1')).toBeFalse();
    });

    // --- Class count ------------------------------------------------------
    it('rejects fewer than 3 classes however long', () => {
      expect(isPasswordPolicySatisfied('abcdefghij')).toBeFalse(); // lower
      expect(isPasswordPolicySatisfied('ABCDEFGHIJ')).toBeFalse(); // upper
      expect(isPasswordPolicySatisfied('1234567890')).toBeFalse(); // digit
      expect(isPasswordPolicySatisfied('!@#$%^&*()')).toBeFalse(); // symbol
      expect(isPasswordPolicySatisfied('abcdefgh12')).toBeFalse(); // 2
      expect(isPasswordPolicySatisfied('abcdefghIJ')).toBeFalse(); // 2
    });

    it('accepts exactly 3 classes, in any combination', () => {
      expect(isPasswordPolicySatisfied('Abcdefg1')).toBeTrue(); // U+L+D
      expect(isPasswordPolicySatisfied('Abcdefg!')).toBeTrue(); // U+L+S
      expect(isPasswordPolicySatisfied('ABCDEF1!')).toBeTrue(); // U+D+S
      expect(isPasswordPolicySatisfied('abcdef1!')).toBeTrue(); // L+D+S
    });

    it('accepts all four', () => {
      expect(isPasswordPolicySatisfied('Str0ng!Pass')).toBeTrue();
    });

    // --- "Symbol" is the complement of the other three ---------------------
    it('treats any non-upper/lower/digit character as a symbol', () => {
      expect(isPasswordPolicySatisfied('Abcdefg ')).toBeTrue(); // a space counts
      expect(isPasswordPolicySatisfied('Abcdefg_')).toBeTrue();
      expect(isPasswordPolicySatisfied('Abcdefg€')).toBeTrue();
    });

    it('counts caseless letters as symbols, like the API', () => {
      expect(isPasswordPolicySatisfied('abc密碼123')).toBeTrue(); // lower + digit + symbol
      expect(isPasswordPolicySatisfied('密碼密碼密碼密碼')).toBeFalse(); // one class
    });

    it('does not trim: spaces are real characters', () => {
      expect(isPasswordPolicySatisfied(' Abcde1 ')).toBeTrue();
    });

    // --- Degenerate -------------------------------------------------------
    it('rejects empty / null / undefined', () => {
      expect(isPasswordPolicySatisfied('')).toBeFalse();
      expect(isPasswordPolicySatisfied(null)).toBeFalse();
      expect(isPasswordPolicySatisfied(undefined)).toBeFalse();
      expect(isPasswordPolicySatisfied('       ')).toBeFalse();
    });
  });

  describe('PASSWORD_POLICY_MESSAGE', () => {
    it('is the specified bilingual wording', () => {
      expect(PASSWORD_POLICY_MESSAGE).toContain('密碼長度至少需 8 碼');
      expect(PASSWORD_POLICY_MESSAGE).toContain('大寫英文／小寫英文／數字／符號');
      expect(PASSWORD_POLICY_MESSAGE).toContain('at least 3 of the 4 classes');
    });
  });

  describe('passwordPolicyValidator', () => {
    const fb = new FormBuilder();

    it('flags a non-compliant password', () => {
      const control = fb.control('abcdefgh', passwordPolicyValidator());
      expect(control.hasError('passwordPolicy')).toBeTrue();
    });

    it('passes a compliant one', () => {
      const control = fb.control('Str0ng!Pass', passwordPolicyValidator());
      expect(control.valid).toBeTrue();
    });

    it('leaves an empty field to `required`, not the policy', () => {
      // Two errors for one mistake would be noise; required owns emptiness.
      const control = fb.control('', [Validators.required, passwordPolicyValidator()]);
      expect(control.hasError('required')).toBeTrue();
      expect(control.hasError('passwordPolicy')).toBeFalse();
    });
  });

  describe('passwordsMatchValidator', () => {
    const build = (newPassword: string, confirm: string) =>
      new FormBuilder().group(
        { newPassword: [newPassword], confirmNewPassword: [confirm] },
        { validators: passwordsMatchValidator('newPassword', 'confirmNewPassword') },
      );

    it('flags a mismatch', () => {
      expect(build('Str0ng!Pass', 'Str0ng!Pasz').hasError('passwordsMismatch')).toBeTrue();
    });

    it('passes when they match', () => {
      expect(build('Str0ng!Pass', 'Str0ng!Pass').valid).toBeTrue();
    });

    it('is case-sensitive', () => {
      expect(build('Str0ng!Pass', 'str0ng!pass').hasError('passwordsMismatch')).toBeTrue();
    });

    it('stays quiet while the confirmation is still empty', () => {
      // Don't shout "mismatch" at a field the user has not typed in yet.
      expect(build('Str0ng!Pass', '').hasError('passwordsMismatch')).toBeFalse();
    });
  });
});
