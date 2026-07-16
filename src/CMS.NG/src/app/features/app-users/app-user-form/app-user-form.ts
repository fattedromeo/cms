import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

import { AppUserService } from '@core/services/app-user.service';
import { AppUserRequest } from '@core/models/app-user.model';
import { RowAuditBadge } from '@app/shared/row-audit-badge/row-audit-badge';
import { LookupItem } from '@core/models/lookup-item.model';
import { ADMIN_ROLE } from '@core/models/auth.model';
import { AuthService } from '@core/services/auth.service';

/**
 * Add/edit form for AppUser.
 *
 * There is **no password field in either mode**, by design: on create the API derives the hash from
 * the configured default password, and update never touches it. In edit mode an Admin can reset the
 * password back to that default — which still sends no password, only the UserId (see
 * `spec/auth/Profile.md` for the endpoint, `spec/auth/AppUser.md` for the NULL semantics).
 */
@Component({
  selector: 'app-app-user-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    InputNumberModule,
    MultiSelectModule,
    CheckboxModule,
    ButtonModule,
    ToastModule,
    ConfirmDialogModule,
    RowAuditBadge,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './app-user-form.html',
  styleUrl: './app-user-form.scss',
})
export class AppUserForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(AppUserService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly auth = inject(AuthService);

  protected readonly isEdit = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly resetting = signal(false);
  protected readonly roleOptions = signal<LookupItem[]>([]);
  protected readonly passwordUpdatedTime = signal<string | null>(null);
  /** The loaded record's pkid, for the 異動紀錄 badge; null in create mode (no history yet). */
  protected readonly recordPkid = signal<number | null>(null);

  /**
   * Whether to offer 重設密碼為預設值.
   *
   * Admin-only and edit-only: there is no account to reset on the 新增 form, and create already sets
   * the default password anyway.
   *
   * ⚠️ This is **presentation**. The API enforces the role (`[Authorize(Roles = "Admin")]` → 403);
   * so does the route (`/app-users` is behind `adminGuard`). Hiding the button is the third layer,
   * not the boundary — see spec/auth/Authorization.md.
   */
  protected readonly canResetPassword = computed(() => this.isEdit() && this.auth.hasRole(ADMIN_ROLE));

  private originalPkid = 0;

  protected readonly form = this.fb.group({
    userId: ['', [Validators.required, Validators.maxLength(200)]],
    userName: ['', [Validators.required, Validators.maxLength(200)]],
    // DB default is 1 (DF_AppUser_IsActive).
    isActive: [true],
    roleIds: [[] as string[]],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.isEdit.set(!!id);

    const user$ = id ? this.service.getById(id) : of(null);
    forkJoin({ roles: this.service.getRoleOptions(), user: user$ }).subscribe({
      next: ({ roles, user }) => {
        this.roleOptions.set(roles);
        if (user) {
          this.originalPkid = user.pkid;
          this.recordPkid.set(user.pkid);
          this.passwordUpdatedTime.set(user.passwordUpdatedTime);
          this.form.patchValue({
            userId: user.userId,
            userName: user.userName,
            isActive: user.isActive,
            roleIds: user.roleIds,
          });
          this.form.controls.userId.disable(); // UserId is the immutable clustered PK.
        }
        this.loading.set(false);
      },
      error: () => {
        this.messages.add({ severity: 'error', summary: '載入失敗', detail: '無法取得資料。' });
        this.loading.set(false);
      },
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messages.add({
        severity: 'warn',
        summary: '請檢查欄位',
        detail: '尚有必填欄位未完成。',
      });
      return;
    }

    // getRawValue() — the disabled userId control is excluded from .value.
    // No passwordHash is sent: the request DTO has no such field and the API would ignore it.
    const raw = this.form.getRawValue();
    const request: AppUserRequest = {
      pkid: this.originalPkid,
      userId: raw.userId!.trim(),
      userName: raw.userName!.trim(),
      isActive: raw.isActive ?? true,
      roleIds: raw.roleIds ?? [],
    };

    this.saving.set(true);
    const op$: Observable<unknown> = this.isEdit()
      ? this.service.update(request)
      : this.service.create(request);
    op$.subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/app-users', request.userId]);
      },
      error: (err: { status?: number }) => {
        this.saving.set(false);
        const detail =
          err?.status === 409
            ? `使用者代碼「${request.userId}」已存在。`
            : '儲存失敗，請稍後再試。';
        this.messages.add({ severity: 'error', summary: '儲存失敗', detail });
      },
    });
  }

  /**
   * 重設密碼為預設值 — resets the edited user's password back to the system default.
   *
   * Confirms first: it is destructive and silent from the user's side — the account holder is not
   * notified and their current password stops working immediately.
   */
  protected resetPassword(): void {
    const userId = this.form.getRawValue().userId!;

    this.confirm.confirm({
      header: '重設密碼確認',
      message:
        `確定要將使用者 <b>${userId}</b> 的密碼重設為系統預設密碼？<br>` +
        '該使用者目前的密碼將立即失效，且不會收到通知。',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: '重設密碼',
      rejectLabel: '取消',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.resetting.set(true);
        // Sends only the UserId. The default password lives in SysConfig and is hashed server-side;
        // no password or hash crosses the wire in either direction.
        this.service.resetPasswordToDefault(userId).subscribe({
          next: () => {
            this.resetting.set(false);
            // The reset writes PasswordUpdatedTime = NULL ("still on the default password"), so the
            // 密碼更新時間 shown on this form is now stale — mirror it rather than leave a value the
            // DB no longer holds.
            this.passwordUpdatedTime.set(null);
            this.messages.add({
              severity: 'success',
              summary: '已重設',
              detail: '密碼已重設為系統預設密碼。',
            });
          },
          error: (err: { status?: number }) => {
            this.resetting.set(false);
            const detail =
              err?.status === 403
                ? '權限不足：僅限系統管理員（Admin）重設密碼。'
                : err?.status === 404
                  ? `找不到使用者「${userId}」。`
                  : '重設失敗，請稍後再試。';
            this.messages.add({ severity: 'error', summary: '重設失敗', detail });
          },
        });
      },
    });
  }

  cancel(): void {
    if (this.isEdit()) {
      this.router.navigate(['/app-users', this.form.getRawValue().userId]);
    } else {
      this.router.navigate(['/app-users']);
    }
  }

  protected invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}
