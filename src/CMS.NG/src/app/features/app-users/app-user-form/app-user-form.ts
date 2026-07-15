import { Component, OnInit, inject, signal } from '@angular/core';
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
import { MessageService } from 'primeng/api';

import { AppUserService } from '@core/services/app-user.service';
import { AppUserRequest } from '@core/models/app-user.model';
import { LookupItem } from '@core/models/lookup-item.model';

/**
 * Add/edit form for AppUser.
 *
 * There is **no password field in either mode**, by design: on create the API derives the hash from
 * the configured default password, and update never touches it. Changing a password needs a
 * dedicated reset endpoint (not built — see spec/auth/AppUser.md).
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
  ],
  providers: [MessageService],
  templateUrl: './app-user-form.html',
  styleUrl: './app-user-form.scss',
})
export class AppUserForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(AppUserService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  protected readonly isEdit = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly roleOptions = signal<LookupItem[]>([]);
  protected readonly passwordUpdatedTime = signal<string | null>(null);

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
