import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { TabsModule } from 'primeng/tabs';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { CourseService } from '@core/services/course.service';
import { CourseRequest } from '@core/models/course.model';
import { LookupItem } from '@core/models/lookup-item.model';
import { addYears, fromIso, toIso } from '@core/utils/date.util';

/**
 * Which controls live on which tab. Drives both the per-tab error badge and the
 * jump-to-first-invalid-tab behaviour on save — without this, a required field on an inactive
 * tab fails validation with nothing visible on screen.
 */
const TAB_CONTROLS: Record<string, string[]> = {
  basic: ['title', 'officialTitle', 'courseId', 'prodCourseId', 'friendlyUrl', 'displayOrder'],
  publish: [
    'partnerPkid',
    'courseGroupPkid',
    'publishStatusPkid',
    'scheduleOn',
    'scheduleOff',
    'hour',
    'listPrice',
    'learningCredit',
    'canRepeat',
  ],
  content: [
    'material',
    'objective',
    'target',
    'prerequisites',
    'outline',
    'towardCertOrExam',
    'note',
    'otherInfo',
  ],
  relations: ['certificationPkids', 'jobCategoryPkids'],
};

const TAB_ORDER = ['basic', 'publish', 'content', 'relations'];

@Component({
  selector: 'app-course-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TabsModule,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    SelectModule,
    MultiSelectModule,
    DatePickerModule,
    CheckboxModule,
    ButtonModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './course-form.html',
  styleUrl: './course-form.scss',
})
export class CourseForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CourseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  protected readonly isEdit = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly activeTab = signal<string>('basic');

  protected readonly partnerOptions = signal<LookupItem[]>([]);
  protected readonly courseGroupOptions = signal<LookupItem[]>([]);
  protected readonly publishStatusOptions = signal<LookupItem[]>([]);
  protected readonly certificationOptions = signal<LookupItem[]>([]);
  protected readonly jobCategoryOptions = signal<LookupItem[]>([]);

  protected readonly form = this.fb.group({
    // pkid is the int IDENTITY key — display-only, disabled in both modes.
    pkid: [{ value: null as number | null, disabled: true }],
    title: ['', [Validators.required, Validators.maxLength(200)]],
    officialTitle: [null as string | null, [Validators.maxLength(300)]],
    courseId: ['', [Validators.required, Validators.maxLength(50)]],
    prodCourseId: ['', [Validators.required, Validators.maxLength(50)]],
    friendlyUrl: ['', [Validators.required, Validators.maxLength(100)]],
    displayOrder: [0 as number | null, [Validators.required]],
    partnerPkid: [null as number | null, [Validators.required]],
    // Nullable FK — no required validator.
    courseGroupPkid: [null as number | null],
    publishStatusPkid: [null as number | null, [Validators.required]],
    scheduleOn: [null as Date | null, [Validators.required]],
    scheduleOff: [null as Date | null, [Validators.required]],
    hour: [0 as number | null, [Validators.required]],
    listPrice: [0 as number | null, [Validators.required]],
    learningCredit: [0 as number | null, [Validators.required]],
    canRepeat: [false],
    material: [null as string | null, [Validators.maxLength(500)]],
    objective: [null as string | null, [Validators.maxLength(4000)]],
    target: [null as string | null, [Validators.maxLength(500)]],
    prerequisites: [null as string | null, [Validators.maxLength(4000)]],
    // Outline / TowardCertOrExam are nvarchar(max) -> no maxLength.
    outline: [null as string | null],
    towardCertOrExam: [null as string | null],
    note: [null as string | null, [Validators.maxLength(4000)]],
    otherInfo: [null as string | null, [Validators.maxLength(4000)]],
    certificationPkids: [[] as number[]],
    jobCategoryPkids: [[] as number[]],
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.isEdit.set(!!idParam);

    const course$ = idParam ? this.service.getById(Number(idParam)) : of(null);

    forkJoin({
      partners: this.service.getPartnerOptions(),
      courseGroups: this.service.getCourseGroupOptions(),
      publishStatuses: this.service.getPublishStatusOptions(),
      certifications: this.service.getCertificationOptions(),
      jobCategories: this.service.getJobCategoryOptions(),
      course: course$,
    }).subscribe({
      next: ({
        partners,
        courseGroups,
        publishStatuses,
        certifications,
        jobCategories,
        course,
      }) => {
        this.partnerOptions.set(partners);
        this.courseGroupOptions.set(courseGroups);
        this.publishStatusOptions.set(publishStatuses);
        this.certificationOptions.set(certifications);
        this.jobCategoryOptions.set(jobCategories);

        if (course) {
          this.form.patchValue({
            pkid: course.pkid,
            title: course.title,
            officialTitle: course.officialTitle,
            courseId: course.courseId,
            prodCourseId: course.prodCourseId,
            friendlyUrl: course.friendlyUrl,
            displayOrder: course.displayOrder,
            partnerPkid: course.partnerPkid,
            courseGroupPkid: course.courseGroupPkid,
            publishStatusPkid: course.publishStatusPkid,
            // scheduleOn is patched BEFORE scheduleOff so the +10y subscription fires first and
            // the loaded scheduleOff below overwrites it — the stored value must win in edit mode.
            scheduleOn: fromIso(course.scheduleOn),
            scheduleOff: fromIso(course.scheduleOff),
            hour: course.hour,
            listPrice: course.listPrice,
            learningCredit: course.learningCredit,
            canRepeat: course.canRepeat,
            material: course.material,
            objective: course.objective,
            target: course.target,
            prerequisites: course.prerequisites,
            outline: course.outline,
            towardCertOrExam: course.towardCertOrExam,
            note: course.note,
            otherInfo: course.otherInfo,
            certificationPkids: course.certificationPkids,
            jobCategoryPkids: course.jobCategoryPkids,
          });
        }

        // Registered after the initial patch so loading a course never triggers the auto-default.
        this.form.controls.scheduleOn.valueChanges.subscribe((value) => {
          if (!(value instanceof Date)) return;
          // emitEvent: false — scheduleOff has no subscription, but this keeps the write from
          // re-entering the form's valueChanges chain.
          this.form.controls.scheduleOff.setValue(addYears(value, 10), { emitEvent: false });
        });

        this.loading.set(false);
      },
      error: () => {
        this.messages.add({ severity: 'error', summary: '載入失敗', detail: '無法取得資料。' });
        this.loading.set(false);
      },
    });
  }

  // --- Option adapters: LookupItem.pkid is a string, the form holds numbers ---
  protected get partnerSelectOptions() {
    return this.partnerOptions().map((o) => ({ pkid: Number(o.pkid), label: o.label }));
  }

  protected get courseGroupSelectOptions() {
    return this.courseGroupOptions().map((o) => ({ pkid: Number(o.pkid), label: o.label }));
  }

  protected get publishStatusSelectOptions() {
    return this.publishStatusOptions().map((o) => ({ pkid: Number(o.pkid), label: o.label }));
  }

  protected get certificationSelectOptions() {
    return this.certificationOptions().map((o) => ({ pkid: Number(o.pkid), label: o.label }));
  }

  protected get jobCategorySelectOptions() {
    return this.jobCategoryOptions().map((o) => ({ pkid: Number(o.pkid), label: o.label }));
  }

  /**
   * True when any control on the tab is invalid and touched — drives the tab error badge.
   * Without it, tabs would hide failed validation entirely.
   */
  protected tabInvalid(tab: string): boolean {
    return (TAB_CONTROLS[tab] ?? []).some((name) => {
      const c = this.form.get(name);
      return !!c && c.invalid && (c.touched || c.dirty);
    });
  }

  /** The first tab (in display order) holding an invalid control, or null. */
  private firstInvalidTab(): string | null {
    for (const tab of TAB_ORDER) {
      const hasInvalid = (TAB_CONTROLS[tab] ?? []).some((name) => !!this.form.get(name)?.invalid);
      if (hasInvalid) return tab;
    }
    return null;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // Bring the offending tab on screen before the toast fires — otherwise the user sees a
      // "required field" warning with no visible error.
      const tab = this.firstInvalidTab();
      if (tab) this.activeTab.set(tab);
      this.messages.add({
        severity: 'warn',
        summary: '請檢查欄位',
        detail: '尚有必填欄位未完成。',
      });
      return;
    }

    // getRawValue() — the disabled pkid control is excluded from .value.
    const raw = this.form.getRawValue();
    const request: CourseRequest = {
      pkid: raw.pkid ?? 0,
      title: raw.title!.trim(),
      officialTitle: raw.officialTitle?.trim() ? raw.officialTitle.trim() : null,
      courseId: raw.courseId!.trim(),
      prodCourseId: raw.prodCourseId!.trim(),
      friendlyUrl: raw.friendlyUrl!.trim(),
      displayOrder: raw.displayOrder ?? 0,
      partnerPkid: raw.partnerPkid!,
      courseGroupPkid: raw.courseGroupPkid ?? null,
      publishStatusPkid: raw.publishStatusPkid!,
      // toIso uses local date parts — toISOString() would shift UTC+8 back a day.
      scheduleOn: toIso(raw.scheduleOn!),
      scheduleOff: toIso(raw.scheduleOff!),
      hour: raw.hour ?? 0,
      listPrice: raw.listPrice ?? 0,
      learningCredit: raw.learningCredit ?? 0,
      material: raw.material?.trim() ? raw.material.trim() : null,
      objective: raw.objective?.trim() ? raw.objective.trim() : null,
      target: raw.target?.trim() ? raw.target.trim() : null,
      prerequisites: raw.prerequisites?.trim() ? raw.prerequisites.trim() : null,
      outline: raw.outline?.trim() ? raw.outline.trim() : null,
      towardCertOrExam: raw.towardCertOrExam?.trim() ? raw.towardCertOrExam.trim() : null,
      note: raw.note?.trim() ? raw.note.trim() : null,
      otherInfo: raw.otherInfo?.trim() ? raw.otherInfo.trim() : null,
      canRepeat: raw.canRepeat ?? false,
      certificationPkids: raw.certificationPkids ?? [],
      jobCategoryPkids: raw.jobCategoryPkids ?? [],
    };

    this.saving.set(true);
    const op$: Observable<unknown> = this.isEdit()
      ? this.service.update(request)
      : this.service.create(request);
    op$.subscribe({
      next: (result) => {
        this.saving.set(false);
        // On create the new pkid comes back in the response; on edit reuse the form pkid.
        const pkid = this.isEdit() ? request.pkid : (result as { pkid: number }).pkid;
        this.router.navigate(['/courses', pkid]);
      },
      error: (err: { status?: number }) => {
        this.saving.set(false);
        const detail =
          err?.status === 409
            ? '儲存失敗：關聯資料衝突，請確認原廠／課程群組／上架狀態是否有效。'
            : '儲存失敗，請稍後再試。';
        this.messages.add({ severity: 'error', summary: '儲存失敗', detail });
      },
    });
  }

  cancel(): void {
    if (this.isEdit()) {
      this.router.navigate(['/courses', this.form.getRawValue().pkid]);
    } else {
      this.router.navigate(['/courses']);
    }
  }

  protected invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}
