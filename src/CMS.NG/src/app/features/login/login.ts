import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { AutoFocusModule } from 'primeng/autofocus';

import { AuthService } from '@core/services/auth.service';

/**
 * 登入 Login — the app's only public page (see `app.routes.ts`).
 *
 * The shell (sidebar/header) is hidden while signed out, so this renders on its own.
 */
@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    InputTextModule,
    PasswordModule,
    ButtonModule,
    MessageModule,
    AutoFocusModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly submitting = signal(false);
  protected readonly error = signal('');

  protected readonly form = this.fb.nonNullable.group({
    userId: ['', Validators.required],
    password: ['', Validators.required],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set('');

    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => {
        this.submitting.set(false);
        // Back to wherever the guard bounced them from, else the app's home.
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(returnUrl || '/courses');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        // The API answers every failed login with the same generic 401 on purpose (unknown user,
        // disabled account and wrong password are indistinguishable — see spec/auth/Login.md), so
        // there is nothing more specific to show, and inventing detail here would undo that.
        this.error.set(
          err instanceof HttpErrorResponse && err.status === 401
            ? '使用者代碼或密碼錯誤。'
            : '無法登入，請稍後再試。',
        );
      },
    });
  }
}
