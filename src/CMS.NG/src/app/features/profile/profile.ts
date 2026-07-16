import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageModule } from 'primeng/message';
import { AutoFocusModule } from 'primeng/autofocus';
import { MessageService } from 'primeng/api';

import { AuthService } from '@core/services/auth.service';
import {
  PASSWORD_POLICY_MESSAGE,
  passwordPolicyValidator,
  passwordsMatchValidator,
} from '@core/utils/password-policy.util';

/**
 * 個人資料 My Profile — the signed-in user's own account.
 *
 * Everything shown comes from what the client already holds: UserId and UserName from the stored
 * profile, roles from the token's claims. **No GET endpoint** — a fetch would only re-derive data
 * the session already has, and give the roles a second source that could disagree with the token
 * the API actually enforces.
 *
 * Only UserName is editable. UserId and roles are read-only *here and at the API*: the endpoint
 * takes the account from the JWT, and `UpdateProfileRequest` has no property for either.
 */
@Component({
  selector: 'app-profile',
  imports: [
    ReactiveFormsModule,
    InputTextModule,
    PasswordModule,
    ButtonModule,
    TagModule,
    ToastModule,
    MessageModule,
    AutoFocusModule,
  ],
  providers: [MessageService],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  protected readonly saving = signal(false);
  protected readonly changingPassword = signal(false);

  /** Server-side rejection (e.g. wrong current password) — shown above the password form. */
  protected readonly passwordError = signal('');

  /** Exposed so the template can render the specified wording verbatim. */
  protected readonly policyMessage = PASSWORD_POLICY_MESSAGE;

  /** Read-only display values. `userName` re-renders after a save (the service updates the signal). */
  protected readonly userId = signal(this.auth.profile()?.userId ?? '');
  protected readonly roles = this.auth.roles;

  protected readonly form = this.fb.nonNullable.group({
    userName: [this.auth.profile()?.userName ?? '', [Validators.required, Validators.maxLength(200)]],
  });

  protected save(): void {
    // Trim locally so a whitespace-only name is caught before the round-trip; the API trims and
    // re-validates regardless — this is convenience, not the rule.
    const userName = this.form.controls.userName.value.trim();
    this.form.controls.userName.setValue(userName);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.auth.updateProfile({ userName }).subscribe({
      next: (profile) => {
        this.saving.set(false);
        // Adopt the stored value: the API is the authority on what was actually saved.
        this.form.controls.userName.setValue(profile.userName);
        this.messages.add({ severity: 'success', summary: '已儲存', detail: '使用者名稱已更新。' });
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.messages.add({
          severity: 'error',
          summary: '儲存失敗',
          detail:
            err instanceof HttpErrorResponse && err.status === 400
              ? '請輸入使用者名稱。'
              : '無法更新，請稍後再試。',
        });
      },
    });
  }

  protected reset(): void {
    this.form.controls.userName.setValue(this.auth.profile()?.userName ?? '');
  }

  // --- 變更密碼 Change password -------------------------------------------

  /**
   * Passwords are NOT trimmed anywhere — unlike userName, whitespace is part of a password.
   * The group-level validator handles new/confirm matching; the API re-checks everything.
   */
  protected readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, passwordPolicyValidator()]],
      confirmNewPassword: ['', Validators.required],
    },
    { validators: passwordsMatchValidator('newPassword', 'confirmNewPassword') },
  );

  protected changePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.changingPassword.set(true);
    this.passwordError.set('');

    this.auth.changePassword(this.passwordForm.getRawValue()).subscribe({
      next: () => {
        this.changingPassword.set(false);
        // Decided with the user: sign out and make them re-enter the new password. Honest limit —
        // this only clears THIS browser's copy; the old token cannot be revoked and stays valid for
        // its remaining lifetime (see spec/auth/Authorization.md).
        this.auth.logout();
        void this.router.navigate(['/login'], {
          queryParams: { reason: 'password-changed' },
        });
      },
      error: (err: unknown) => {
        this.changingPassword.set(false);
        // The API answers every rejection with 400 + a message (never 401 — that would sign the
        // user out over a typo), so show what it said rather than guessing.
        this.passwordError.set(
          (err instanceof HttpErrorResponse && err.status === 400
            ? (err.error?.message as string | undefined)
            : undefined) ?? '無法變更密碼，請稍後再試。',
        );
      },
    });
  }
}
