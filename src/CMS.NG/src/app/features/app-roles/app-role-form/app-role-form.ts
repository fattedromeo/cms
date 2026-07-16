import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { AppRoleService } from '@core/services/app-role.service';
import { AppRoleRequest } from '@core/models/app-role.model';
import { RowAuditBadge } from '@app/shared/row-audit-badge/row-audit-badge';
import { LookupItem } from '@core/models/lookup-item.model';

@Component({
  selector: 'app-app-role-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    InputNumberModule,
    MultiSelectModule,
    ButtonModule,
    ToastModule,
    RowAuditBadge,
  ],
  providers: [MessageService],
  templateUrl: './app-role-form.html',
  styleUrl: './app-role-form.scss',
})
export class AppRoleForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(AppRoleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  protected readonly isEdit = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly userOptions = signal<LookupItem[]>([]);
  /** The loaded record's pkid, for the 異動紀錄 badge; null in create mode (no history yet). */
  protected readonly recordPkid = signal<number | null>(null);

  private originalPkid = 0;

  protected readonly form = this.fb.group({
    roleId: ['', [Validators.required, Validators.maxLength(200)]],
    roleName: ['', [Validators.required, Validators.maxLength(200)]],
    permissionLevel: [100 as number | null, [Validators.required]],
    description: ['' as string | null, [Validators.maxLength(400)]],
    userIds: [[] as string[]],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.isEdit.set(!!id);

    const role$ = id ? this.service.getById(id) : of(null);
    forkJoin({ users: this.service.getUserOptions(), role: role$ }).subscribe({
      next: ({ users, role }) => {
        this.userOptions.set(users);
        if (role) {
          this.originalPkid = role.pkid;
          this.recordPkid.set(role.pkid);
          this.form.patchValue({
            roleId: role.roleId,
            roleName: role.roleName,
            permissionLevel: role.permissionLevel,
            description: role.description,
            userIds: role.userIds,
          });
          this.form.controls.roleId.disable(); // RoleId is the immutable key.
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
      this.messages.add({ severity: 'warn', summary: '請檢查欄位', detail: '尚有必填欄位未完成。' });
      return;
    }

    const raw = this.form.getRawValue();
    const request: AppRoleRequest = {
      pkid: this.originalPkid,
      roleId: raw.roleId!.trim(),
      roleName: raw.roleName!.trim(),
      permissionLevel: raw.permissionLevel ?? 0,
      description: raw.description?.trim() ? raw.description.trim() : null,
      userIds: raw.userIds ?? [],
    };

    this.saving.set(true);
    const op$: Observable<unknown> = this.isEdit()
      ? this.service.update(request)
      : this.service.create(request);
    op$.subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/app-roles', request.roleId]);
      },
      error: (err: { status?: number }) => {
        this.saving.set(false);
        const detail =
          err?.status === 409 ? `角色代碼「${request.roleId}」已存在。` : '儲存失敗，請稍後再試。';
        this.messages.add({ severity: 'error', summary: '儲存失敗', detail });
      },
    });
  }

  cancel(): void {
    if (this.isEdit()) {
      this.router.navigate(['/app-roles', this.form.getRawValue().roleId]);
    } else {
      this.router.navigate(['/app-roles']);
    }
  }

  protected invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}
