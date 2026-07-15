import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { TableModule, TablePageEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

import { CourseService } from '@core/services/course.service';
import { Course, CourseQuery } from '@core/models/course.model';
import { LookupItem } from '@core/models/lookup-item.model';
import { fromIso, toIso } from '@core/utils/date.util';

const FILTERS_KEY = 'course-list-filters';
const SORT_KEY = 'course-list-sort';
const PAGE_KEY = 'course-list-page';

/** Drawer-local filter shape: dates are Date objects for p-datepicker, not ISO strings. */
interface FilterDraft {
  keyword: string | null;
  partnerPkid: number | null;
  courseGroupPkid: number | null;
  publishStatusPkid: number | null;
  scheduleOnFrom: Date | null;
  scheduleOnTo: Date | null;
  scheduleOffFrom: Date | null;
  scheduleOffTo: Date | null;
  canRepeat: boolean | null;
}

const emptyFilters = (): FilterDraft => ({
  keyword: null,
  partnerPkid: null,
  courseGroupPkid: null,
  publishStatusPkid: null,
  scheduleOnFrom: null,
  scheduleOnTo: null,
  scheduleOffFrom: null,
  scheduleOffTo: null,
  canRepeat: null,
});

@Component({
  selector: 'app-course-list',
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    DrawerModule,
    InputTextModule,
    SelectModule,
    DatePickerModule,
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './course-list.html',
  styleUrl: './course-list.scss',
})
export class CourseList implements OnInit {
  private readonly service = inject(CourseService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  protected readonly courses = signal<Course[]>([]);
  protected readonly loading = signal(false);
  protected readonly filterVisible = signal(false);

  // Lookups populate the filter drawer only — the list itself renders the nav objects
  // resolved by the API's JOIN, so no lookup is needed to show labels.
  protected readonly partnerOptions = signal<LookupItem[]>([]);
  protected readonly courseGroupOptions = signal<LookupItem[]>([]);
  protected readonly publishStatusOptions = signal<LookupItem[]>([]);

  protected readonly canRepeatOptions = [
    { label: '是', value: true },
    { label: '否', value: false },
  ];

  protected filterDraft: FilterDraft = emptyFilters();
  protected appliedFilters: FilterDraft = emptyFilters();

  protected sortField = 'courseId';
  protected sortOrder = 1;
  protected first = 0;
  protected rows = 20;

  ngOnInit(): void {
    this.restoreState();
    this.applyIncomingParams();

    // LookupItem.pkid is a string; the query DTO wants numbers -> map once here.
    forkJoin({
      partners: this.service.getPartnerOptions(),
      courseGroups: this.service.getCourseGroupOptions(),
      publishStatuses: this.service.getPublishStatusOptions(),
    }).subscribe({
      next: ({ partners, courseGroups, publishStatuses }) => {
        this.partnerOptions.set(partners);
        this.courseGroupOptions.set(courseGroups);
        this.publishStatusOptions.set(publishStatuses);
      },
      error: () => {
        this.messages.add({
          severity: 'error',
          summary: '載入失敗',
          detail: '無法取得篩選選項。',
        });
      },
    });

    this.load();
  }

  /** Numeric option lists for p-select (LookupItem.pkid is a string). */
  protected get partnerSelectOptions() {
    return this.partnerOptions().map((o) => ({ pkid: Number(o.pkid), label: o.label }));
  }

  protected get courseGroupSelectOptions() {
    return this.courseGroupOptions().map((o) => ({ pkid: Number(o.pkid), label: o.label }));
  }

  protected get publishStatusSelectOptions() {
    return this.publishStatusOptions().map((o) => ({ pkid: Number(o.pkid), label: o.label }));
  }

  private restoreState(): void {
    const f = sessionStorage.getItem(FILTERS_KEY);
    if (f) {
      const saved = JSON.parse(f) as Record<string, unknown>;
      // Dates round-trip through sessionStorage as yyyy-MM-dd strings.
      this.appliedFilters = {
        ...emptyFilters(),
        ...saved,
        scheduleOnFrom: fromIso(saved['scheduleOnFrom'] as string | null),
        scheduleOnTo: fromIso(saved['scheduleOnTo'] as string | null),
        scheduleOffFrom: fromIso(saved['scheduleOffFrom'] as string | null),
        scheduleOffTo: fromIso(saved['scheduleOffTo'] as string | null),
      } as FilterDraft;
      this.filterDraft = { ...this.appliedFilters };
    }
    const s = sessionStorage.getItem(SORT_KEY);
    if (s) {
      const parsed = JSON.parse(s);
      this.sortField = parsed.sortField ?? 'courseId';
      this.sortOrder = parsed.sortOrder ?? 1;
    }
    const p = sessionStorage.getItem(PAGE_KEY);
    if (p) {
      const parsed = JSON.parse(p);
      this.first = parsed.first ?? 0;
      this.rows = parsed.rows ?? 20;
    }
  }

  /**
   * Cross-entity navigation (e.g. CourseGroup -> 查看課程) passes a FK as a query param.
   * When present it overrides whatever was saved in sessionStorage.
   */
  private applyIncomingParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const courseGroupPkid = params.get('courseGroupPkid');
    const partnerPkid = params.get('partnerPkid');
    if (!courseGroupPkid && !partnerPkid) return;

    this.appliedFilters = emptyFilters();
    if (courseGroupPkid) this.appliedFilters.courseGroupPkid = Number(courseGroupPkid);
    if (partnerPkid) this.appliedFilters.partnerPkid = Number(partnerPkid);
    this.filterDraft = { ...this.appliedFilters };
    this.first = 0;
    this.persistFilters();
    this.persistPage();
  }

  /** Drawer draft (Dates) -> API query DTO (ISO strings). */
  private toQuery(f: FilterDraft): CourseQuery {
    return {
      keyword: f.keyword,
      partnerPkid: f.partnerPkid,
      courseGroupPkid: f.courseGroupPkid,
      publishStatusPkid: f.publishStatusPkid,
      scheduleOnFrom: f.scheduleOnFrom ? toIso(f.scheduleOnFrom) : null,
      scheduleOnTo: f.scheduleOnTo ? toIso(f.scheduleOnTo) : null,
      scheduleOffFrom: f.scheduleOffFrom ? toIso(f.scheduleOffFrom) : null,
      scheduleOffTo: f.scheduleOffTo ? toIso(f.scheduleOffTo) : null,
      canRepeat: f.canRepeat,
    };
  }

  load(): void {
    this.loading.set(true);
    this.service.query(this.toQuery(this.appliedFilters)).subscribe({
      next: (data) => {
        this.courses.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.messages.add({ severity: 'error', summary: '載入失敗', detail: '無法取得課程資料。' });
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
    this.persistFilters();
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

  private persistFilters(): void {
    // Serialize Dates as yyyy-MM-dd (local) so they survive a reload without a UTC shift.
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(this.toQuery(this.appliedFilters)));
  }

  // --- Persistence hooks --------------------------------------------------
  onSort(event: { field?: string; order?: number }): void {
    this.sortField = event.field ?? 'courseId';
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
    this.router.navigate(['/courses/new']);
  }

  view(course: Course): void {
    this.router.navigate(['/courses', course.pkid]);
  }

  edit(course: Course): void {
    this.router.navigate(['/courses', course.pkid, 'edit']);
  }

  remove(course: Course): void {
    this.confirm.confirm({
      header: '刪除確認',
      // CourseInCertification / CourseJobCategories are ON DELETE CASCADE, so those links go
      // silently — the confirmation says so rather than implying an isolated delete.
      message:
        `確定要刪除主代碼 <b>${course.pkid}</b>「${course.courseId} ${course.title}」？<br>` +
        '此課程的認證與職務類別關聯將一併被刪除。',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.service.delete(course.pkid).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: '已刪除',
              detail: `課程「${course.courseId}」已刪除。`,
            });
            this.load();
          },
          error: (err: { status?: number }) => {
            const detail =
              err?.status === 409
                ? '此課程仍被課程問答、相關連結或熱門課程使用，無法刪除。'
                : '無法刪除該課程。';
            this.messages.add({ severity: 'error', summary: '刪除失敗', detail });
          },
        });
      },
    });
  }
}
