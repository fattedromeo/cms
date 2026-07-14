import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TableModule, TablePageEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

import { CourseGroupService } from '@core/services/course-group.service';
import { CourseGroup, CourseGroupQuery } from '@core/models/course-group.model';

const FILTERS_KEY = 'course-group-list-filters';
const SORT_KEY = 'course-group-list-sort';
const PAGE_KEY = 'course-group-list-page';

const emptyFilters = (): CourseGroupQuery => ({
  keyword: null,
});

@Component({
  selector: 'app-course-group-list',
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    DrawerModule,
    InputTextModule,
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './course-group-list.html',
  styleUrl: './course-group-list.scss',
})
export class CourseGroupList implements OnInit {
  private readonly service = inject(CourseGroupService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  protected readonly courseGroups = signal<CourseGroup[]>([]);
  protected readonly loading = signal(false);
  protected readonly filterVisible = signal(false);

  protected filterDraft: CourseGroupQuery = emptyFilters();
  protected appliedFilters: CourseGroupQuery = emptyFilters();

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
        this.courseGroups.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.messages.add({ severity: 'error', summary: '載入失敗', detail: '無法取得課程群組資料。' });
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
    this.router.navigate(['/course-groups/new']);
  }

  view(group: CourseGroup): void {
    this.router.navigate(['/course-groups', group.pkid]);
  }

  edit(group: CourseGroup): void {
    this.router.navigate(['/course-groups', group.pkid, 'edit']);
  }

  remove(group: CourseGroup): void {
    this.confirm.confirm({
      header: '刪除確認',
      // FK_Course_CourseGroup is ON DELETE CASCADE — courses in this group are deleted with it,
      // so the confirmation has to say so rather than implying the delete is isolated.
      message:
        `確定要刪除主代碼 <b>${group.pkid}</b>「${group.description}」？<br>` +
        '此群組底下的課程將一併被刪除。',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.service.delete(group.pkid).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: '已刪除',
              detail: `課程群組「${group.description}」已刪除。`,
            });
            this.load();
          },
          error: (err: { status?: number }) => {
            const detail =
              err?.status === 409
                ? '此課程群組仍被廠商課程群組使用，無法刪除。'
                : '無法刪除該課程群組。';
            this.messages.add({ severity: 'error', summary: '刪除失敗', detail });
          },
        });
      },
    });
  }
}
