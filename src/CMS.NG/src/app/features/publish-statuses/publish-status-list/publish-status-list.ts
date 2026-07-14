import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TableModule, TablePageEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

import { PublishStatusService } from '@core/services/publish-status.service';
import { PublishStatus, PublishStatusQuery } from '@core/models/publish-status.model';

const FILTERS_KEY = 'publish-status-list-filters';
const SORT_KEY = 'publish-status-list-sort';
const PAGE_KEY = 'publish-status-list-page';

const emptyFilters = (): PublishStatusQuery => ({
  keyword: null,
  isDraft: null,
  isPublished: null,
  isDiscontinued: null,
});

@Component({
  selector: 'app-publish-status-list',
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    DrawerModule,
    InputTextModule,
    SelectModule,
    TagModule,
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './publish-status-list.html',
  styleUrl: './publish-status-list.scss',
})
export class PublishStatusList implements OnInit {
  private readonly service = inject(PublishStatusService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  protected readonly statuses = signal<PublishStatus[]>([]);
  protected readonly loading = signal(false);
  protected readonly filterVisible = signal(false);

  // Tri-state options for the boolean filters (null = 不限).
  protected readonly boolOptions = [
    { label: '不限', value: null },
    { label: '是', value: true },
    { label: '否', value: false },
  ];

  protected filterDraft: PublishStatusQuery = emptyFilters();
  protected appliedFilters: PublishStatusQuery = emptyFilters();

  protected sortField = 'pkid';
  protected sortOrder = 1;
  protected first = 0;
  protected rows = 20;

  ngOnInit(): void {
    this.restoreState();
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
      this.sortField = parsed.sortField ?? 'pkid';
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
        this.statuses.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.messages.add({ severity: 'error', summary: '載入失敗', detail: '無法取得發布狀態資料。' });
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
    this.sortField = event.field ?? 'pkid';
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
    this.router.navigate(['/publish-statuses/new']);
  }

  view(status: PublishStatus): void {
    this.router.navigate(['/publish-statuses', status.pkid]);
  }

  edit(status: PublishStatus): void {
    this.router.navigate(['/publish-statuses', status.pkid, 'edit']);
  }

  remove(status: PublishStatus): void {
    this.confirm.confirm({
      header: '刪除確認',
      message: `確定要刪除主代碼 <b>${status.pkid}</b>「${status.description}」？`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.service.delete(status.pkid).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: '已刪除',
              detail: `發布狀態「${status.description}」已刪除。`,
            });
            this.load();
          },
          error: () => {
            this.messages.add({ severity: 'error', summary: '刪除失敗', detail: '無法刪除該發布狀態。' });
          },
        });
      },
    });
  }
}
