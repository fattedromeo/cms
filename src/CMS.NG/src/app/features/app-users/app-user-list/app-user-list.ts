import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TableModule, TablePageEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

import { AppUserService } from '@core/services/app-user.service';
import { AppUser, AppUserQuery } from '@core/models/app-user.model';
import { LookupItem } from '@core/models/lookup-item.model';

const FILTERS_KEY = 'app-user-list-filters';
const SORT_KEY = 'app-user-list-sort';
const PAGE_KEY = 'app-user-list-page';

const emptyFilters = (): AppUserQuery => ({
  keyword: null,
  isActive: null,
  roleId: null,
});

@Component({
  selector: 'app-app-user-list',
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    DrawerModule,
    InputTextModule,
    SelectModule,
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './app-user-list.html',
  styleUrl: './app-user-list.scss',
})
export class AppUserList implements OnInit {
  private readonly service = inject(AppUserService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  protected readonly users = signal<AppUser[]>([]);
  protected readonly loading = signal(false);
  protected readonly filterVisible = signal(false);

  // RoleId is a string, so these options bind straight through — no Number() mapping
  // (unlike the numeric-FK features such as Course).
  protected readonly roleOptions = signal<LookupItem[]>([]);

  protected readonly isActiveOptions = [
    { label: '是', value: true },
    { label: '否', value: false },
  ];

  protected filterDraft: AppUserQuery = emptyFilters();
  protected appliedFilters: AppUserQuery = emptyFilters();

  protected sortField = 'userId';
  protected sortOrder = 1;
  protected first = 0;
  protected rows = 20;

  ngOnInit(): void {
    this.restoreState();

    this.service.getRoleOptions().subscribe({
      next: (roles) => this.roleOptions.set(roles),
      error: () =>
        this.messages.add({ severity: 'error', summary: '載入失敗', detail: '無法取得角色選項。' }),
    });

    this.load();
  }

  private restoreState(): void {
    const f = sessionStorage.getItem(FILTERS_KEY);
    if (f) {
      this.appliedFilters = { ...emptyFilters(), ...JSON.parse(f) };
      this.filterDraft = { ...this.appliedFilters };
    }
    const s = sessionStorage.getItem(SORT_KEY);
    if (s) {
      const parsed = JSON.parse(s);
      this.sortField = parsed.sortField ?? 'userId';
      this.sortOrder = parsed.sortOrder ?? 1;
    }
    const p = sessionStorage.getItem(PAGE_KEY);
    if (p) {
      const parsed = JSON.parse(p);
      this.first = parsed.first ?? 0;
      this.rows = parsed.rows ?? 20;
    }
  }

  load(): void {
    this.loading.set(true);
    this.service.query(this.appliedFilters).subscribe({
      next: (data) => {
        this.users.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.messages.add({
          severity: 'error',
          summary: '載入失敗',
          detail: '無法取得使用者資料。',
        });
        this.loading.set(false);
      },
    });
  }

  // --- Filter drawer ------------------------------------------------------
  openFilter(): void {
    this.filterDraft = { ...this.appliedFilters };
    this.filterVisible.set(true);
  }

  applyFilters(): void {
    this.appliedFilters = { ...this.filterDraft };
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(this.appliedFilters));
    this.first = 0;
    this.persistPage();
    this.filterVisible.set(false);
    this.load();
  }

  clearFilters(): void {
    this.filterDraft = emptyFilters();
    this.appliedFilters = emptyFilters();
    sessionStorage.removeItem(FILTERS_KEY);
    this.first = 0;
    this.persistPage();
    this.load();
  }

  // --- Persistence hooks --------------------------------------------------
  onSort(event: { field?: string; order?: number }): void {
    this.sortField = event.field ?? 'userId';
    this.sortOrder = event.order ?? 1;
    sessionStorage.setItem(
      SORT_KEY,
      JSON.stringify({ sortField: this.sortField, sortOrder: this.sortOrder }),
    );
  }

  onPage(event: TablePageEvent): void {
    this.first = event.first;
    this.rows = event.rows;
    this.persistPage();
  }

  private persistPage(): void {
    sessionStorage.setItem(PAGE_KEY, JSON.stringify({ first: this.first, rows: this.rows }));
  }

  // --- Row actions --------------------------------------------------------
  add(): void {
    this.router.navigate(['/app-users/new']);
  }

  view(user: AppUser): void {
    this.router.navigate(['/app-users', user.userId]);
  }

  edit(user: AppUser): void {
    this.router.navigate(['/app-users', user.userId, 'edit']);
  }

  remove(user: AppUser): void {
    this.confirm.confirm({
      header: '刪除確認',
      // The AppUserRole rows are hand-deleted by the repository (the FK does not cascade),
      // so the confirmation says so rather than implying an isolated delete.
      message:
        `確定要刪除使用者 <b>${user.userId}</b>「${user.userName}」？<br>` +
        '此使用者的角色指派將一併被刪除。',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.service.delete(user.userId).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: '已刪除',
              detail: `使用者「${user.userId}」已刪除。`,
            });
            this.load();
          },
          error: () => {
            this.messages.add({
              severity: 'error',
              summary: '刪除失敗',
              detail: '無法刪除該使用者。',
            });
          },
        });
      },
    });
  }
}
