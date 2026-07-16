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
import { CheckboxModule } from 'primeng/checkbox';
import { AutoFocusModule } from 'primeng/autofocus';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

import { CourseService } from '@core/services/course.service';
import { Course, CourseQuery, CourseRequest } from '@core/models/course.model';
import { LookupItem } from '@core/models/lookup-item.model';
import { fromIso, toIso } from '@core/utils/date.util';

const FILTERS_KEY = 'course-list-filters';
const SORT_KEY = 'course-list-sort';
const PAGE_KEY = 'course-list-page';

/**
 * Columns the list table may edit in place. 主代碼 (`pkid`), 原廠 (`partner`) and 課程群組
 * (`courseGroup`) are deliberately absent: the first is the immutable identity key, the other two
 * are FK nav objects rendered from a JOIN.
 */
export type EditableField =
  | 'displayOrder'
  | 'courseId'
  | 'prodCourseId'
  | 'title'
  | 'publishStatusPkid'
  | 'scheduleOn'
  | 'scheduleOff'
  | 'hour'
  | 'listPrice'
  | 'learningCredit'
  | 'canRepeat';

/** Whatever the active cell editor is bound to — a Date for the two `date` columns. */
type EditValue = string | number | boolean | Date | null;

interface EditingCell {
  pkid: number;
  field: EditableField;
}

/**
 * Column bounds taken from `database/course.sql`, NOT from the form. The form is looser than the
 * schema, and every one of these overflows fails at the DB, not in the browser:
 *   Hour            smallint       -> 0..32767
 *   ListPrice       decimal(9, 0)  -> scale 0, so SQL Server silently ROUNDS a fraction away
 *   LearningCredit  decimal(9, 1)  -> 1 dp; 387 of 1,080 dev rows are fractional (5.5, 2.5, 22.5),
 *                                     so this must NOT be an integer editor
 *   DisplayOrder    int            -> dev data spans 0..1000
 */
const HOUR_MAX = 32767;
const LIST_PRICE_MAX = 999999999;
const LEARNING_CREDIT_MAX = 99999999.9;
const TITLE_MAX = 200;
const COURSE_ID_MAX = 50;
const PROD_COURSE_ID_MAX = 50;

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
    CheckboxModule,
    AutoFocusModule,
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

  // --- Inline edit state --------------------------------------------------
  /** The one cell currently in edit mode, or null. Only ever one at a time. */
  protected readonly editing = signal<EditingCell | null>(null);
  /** Validation message for the active cell; keeps the editor open while set. */
  protected readonly editError = signal<string | null>(null);
  /** True while the re-read + PUT for a cell is in flight. */
  protected readonly savingCell = signal(false);
  /** Bound to the active editor via ngModel. */
  protected editValue: EditValue = null;

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

  // --- Inline editing -----------------------------------------------------
  //
  // Hand-rolled rather than PrimeNG's `pEditableColumn`: that directive hard-wires
  // `click -> onClick()` as a host listener (primeng/table, v20) and has no double-click mode, so
  // it cannot satisfy "single click must not enter edit mode". The editors below are still the
  // PrimeNG inputs; only the open/close trigger is ours.

  protected isEditing(course: Course, field: EditableField): boolean {
    const cell = this.editing();
    return !!cell && cell.pkid === course.pkid && cell.field === field;
  }

  /** Double-click handler. Single click never reaches this. */
  protected startEdit(course: Course, field: EditableField): void {
    if (this.savingCell()) return;
    this.editing.set({ pkid: course.pkid, field });
    this.editError.set(null);
    this.editValue = this.seedValue(course, field);
  }

  /** Escape, or a save failure: close the editor and leave the row's own value on screen. */
  protected cancelEdit(): void {
    this.editing.set(null);
    this.editError.set(null);
  }

  /** The two `date` columns arrive as `yyyy-MM-dd`; p-datepicker wants a Date. */
  private seedValue(course: Course, field: EditableField): EditValue {
    if (field === 'scheduleOn') return fromIso(course.scheduleOn);
    if (field === 'scheduleOff') return fromIso(course.scheduleOff);
    return course[field] as EditValue;
  }

  /**
   * Blur handler — the single entry point for persisting a cell.
   *
   * Also reachable from the overlay editors' own change/select events: the p-select panel and the
   * p-datepicker overlay can take focus off the trigger, so blur alone is not a reliable "done"
   * signal for them. The `editing()` guard plus the unchanged short-circuit make a second call a
   * no-op rather than a second PUT.
   */
  protected commit(course: Course): void {
    const cell = this.editing();
    if (!cell || cell.pkid !== course.pkid || this.savingCell()) return;

    const value = this.normalize(cell.field, this.editValue);
    const error = this.validate(cell.field, value, course);
    if (error) {
      // Stay in edit mode so the value is still there to correct.
      this.editError.set(error);
      return;
    }

    if (this.isUnchanged(course, cell.field, value)) {
      this.cancelEdit();
      return;
    }

    this.saveCell(course, cell.field, value);
  }

  private normalize(field: EditableField, value: EditValue): EditValue {
    if (field === 'title' || field === 'courseId' || field === 'prodCourseId') {
      return typeof value === 'string' ? value.trim() : value;
    }
    return value;
  }

  private isUnchanged(course: Course, field: EditableField, value: EditValue): boolean {
    if (field === 'scheduleOn' || field === 'scheduleOff') {
      return value instanceof Date && toIso(value) === course[field];
    }
    return value === course[field];
  }

  /**
   * Returns a message when the value must not be written, or null when it is good.
   *
   * The numeric ceilings are the SQL Server column limits, not UI preference — see the constants.
   * Note the date rule is `<=`, not `<`: four dev rows legitimately have ScheduleOn = ScheduleOff.
   */
  private validate(field: EditableField, value: EditValue, course: Course): string | null {
    switch (field) {
      case 'title':
        return this.validateText(value, '課程名稱', TITLE_MAX);
      case 'courseId':
        return this.validateText(value, '簡介代碼', COURSE_ID_MAX);
      case 'prodCourseId':
        return this.validateText(value, '科目代碼', PROD_COURSE_ID_MAX);

      case 'displayOrder':
        return this.validateNumber(value, '顯示順序', { max: 2147483647, integer: true });
      case 'hour':
        return this.validateNumber(value, '時數', { max: HOUR_MAX, integer: true });
      // ListPrice is decimal(9, 0): a fraction would be silently rounded by SQL Server, so reject
      // it here rather than let the user watch 100.6 come back as 101.
      case 'listPrice':
        return this.validateNumber(value, '定價', { max: LIST_PRICE_MAX, integer: true });
      // LearningCredit is decimal(9, 1) — fractions are normal, but a 2nd dp would be rounded away.
      case 'learningCredit':
        return this.validateNumber(value, '點數', { max: LEARNING_CREDIT_MAX, decimals: 1 });

      case 'publishStatusPkid':
        return value === null || value === undefined ? '上架狀態為必填。' : null;

      case 'scheduleOn': {
        const invalid = this.validateDate(value, '上架日期');
        if (invalid) return invalid;
        const off = fromIso(course.scheduleOff);
        return off && (value as Date) > off ? '上架日期不可晚於下架日期。' : null;
      }
      case 'scheduleOff': {
        const invalid = this.validateDate(value, '下架日期');
        if (invalid) return invalid;
        const on = fromIso(course.scheduleOn);
        return on && (value as Date) < on ? '下架日期不可早於上架日期。' : null;
      }

      // bit NOT NULL, and the checkbox can only produce a boolean.
      case 'canRepeat':
        return null;
    }
  }

  private validateText(value: EditValue, label: string, maxLength: number): string | null {
    const text = typeof value === 'string' ? value : '';
    if (!text) return `${label}為必填，不可清空。`;
    if (text.length > maxLength) return `${label}不可超過 ${maxLength} 個字元。`;
    return null;
  }

  private validateNumber(
    value: EditValue,
    label: string,
    opts: { max: number; integer?: boolean; decimals?: number },
  ): string | null {
    // A cleared or non-numeric <input type="number"> yields null/'' through ngModel.
    if (value === null || value === undefined || value === '') return `${label}為必填，不可清空。`;
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return `${label}必須為有效數字。`;
    if (n < 0) return `${label}不可為負數。`;
    if (opts.integer && !Number.isInteger(n)) return `${label}必須為整數。`;
    if (opts.decimals !== undefined) {
      const dp = (String(n).split('.')[1] ?? '').length;
      if (dp > opts.decimals) return `${label}最多只能有 ${opts.decimals} 位小數。`;
    }
    if (n > opts.max) return `${label}不可大於 ${opts.max}。`;
    return null;
  }

  private validateDate(value: EditValue, label: string): string | null {
    if (!value) return `${label}為必填，不可清空。`;
    // p-datepicker hands back an Invalid Date for unparseable typed text.
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return `${label}必須為有效日期。`;
    }
    return null;
  }

  /**
   * Persist one cell.
   *
   * ⚠️ The list row is NOT a safe body for the PUT. `POST /api/courses/query` leaves
   * `certificationPkids` / `jobCategoryPkids` empty (only `GetByIdAsync` fills them), while
   * `PUT /api/courses` runs ReplaceCertificationsAsync / ReplaceJobCategoriesAsync, which DELETE
   * every junction row for the course and re-insert from the request. PUTting a list row would
   * therefore silently wipe that course's 認證 and 職務類別 links and still return 204 — verified
   * against the dev API, where course 1980 returns jobCategoryPkids [] from /query but [1] from
   * /courses/1980.
   *
   * So: re-read the full course, apply the one edited field to THAT, and send it back. Using the
   * fresh row as the base also avoids writing stale values from a list loaded minutes ago.
   */
  private saveCell(course: Course, field: EditableField, value: EditValue): void {
    this.savingCell.set(true);

    this.service.getById(course.pkid).subscribe({
      next: (fresh) => {
        this.service.update(this.toRequest(fresh, field, value)).subscribe({
          next: () => {
            this.applyToRow(course.pkid, field, value);
            this.savingCell.set(false);
            this.cancelEdit();
            this.messages.add({
              severity: 'success',
              summary: '已更新',
              detail: `課程「${course.courseId}」已儲存。`,
            });
          },
          error: (err: { status?: number }) => this.failCell(err),
        });
      },
      error: (err: { status?: number }) => this.failCell(err),
    });
  }

  /** The row still holds the old value (applyToRow runs only on success), so closing reverts it. */
  private failCell(err: { status?: number }): void {
    this.savingCell.set(false);
    this.cancelEdit();
    const detail =
      err?.status === 409
        ? '關聯資料衝突，已還原原值。'
        : err?.status === 404
          ? '找不到該課程，已還原原值。'
          : '儲存失敗，已還原原值。';
    this.messages.add({ severity: 'error', summary: '儲存失敗', detail });
  }

  /** Full re-read + the one edited field. Every other column is carried through untouched. */
  private toRequest(fresh: Course, field: EditableField, value: EditValue): CourseRequest {
    const request: CourseRequest = {
      pkid: fresh.pkid,
      title: fresh.title,
      officialTitle: fresh.officialTitle,
      courseId: fresh.courseId,
      prodCourseId: fresh.prodCourseId,
      friendlyUrl: fresh.friendlyUrl,
      displayOrder: fresh.displayOrder,
      partnerPkid: fresh.partnerPkid,
      courseGroupPkid: fresh.courseGroupPkid,
      publishStatusPkid: fresh.publishStatusPkid,
      scheduleOn: fresh.scheduleOn,
      scheduleOff: fresh.scheduleOff,
      hour: fresh.hour,
      listPrice: fresh.listPrice,
      learningCredit: fresh.learningCredit,
      material: fresh.material,
      objective: fresh.objective,
      target: fresh.target,
      prerequisites: fresh.prerequisites,
      outline: fresh.outline,
      towardCertOrExam: fresh.towardCertOrExam,
      note: fresh.note,
      otherInfo: fresh.otherInfo,
      canRepeat: fresh.canRepeat,
      // The whole reason for the re-read — an empty list here deletes the junction rows.
      certificationPkids: fresh.certificationPkids,
      jobCategoryPkids: fresh.jobCategoryPkids,
    };

    if (field === 'scheduleOn' || field === 'scheduleOff') {
      // toIso() uses local parts; toISOString() would shift the day back in UTC+8.
      request[field] = toIso(value as Date);
    } else {
      Object.assign(request, { [field]: value });
    }
    return request;
  }

  /** Reflect a saved value in the table without a full reload. */
  private applyToRow(pkid: number, field: EditableField, value: EditValue): void {
    this.courses.update((rows) =>
      rows.map((row) => {
        if (row.pkid !== pkid) return row;
        const updated: Course = { ...row };
        if (field === 'scheduleOn' || field === 'scheduleOff') {
          updated[field] = toIso(value as Date);
        } else {
          Object.assign(updated, { [field]: value });
        }
        // 上架狀態 renders publishStatus.description, not the FK — relabel it from the lookup or
        // the cell would keep showing the old status until the next reload.
        if (field === 'publishStatusPkid') {
          const option = this.publishStatusOptions().find((o) => Number(o.pkid) === value);
          updated.publishStatus = option
            ? { pkid: Number(option.pkid), description: option.label }
            : row.publishStatus;
        }
        return updated;
      }),
    );
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
