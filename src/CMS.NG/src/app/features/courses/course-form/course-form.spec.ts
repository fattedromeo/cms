import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { CourseForm } from './course-form';
import { CourseService } from '@core/services/course.service';
import { Course } from '@core/models/course.model';
import { toIso } from '@core/utils/date.util';

const sample: Course = {
  pkid: 1,
  title: 'Oracle資料庫之PL／SQL基礎',
  officialTitle: null,
  courseId: 'PLF',
  prodCourseId: 'PLF',
  friendlyUrl: 'oracle-plsql',
  displayOrder: 10,
  partnerPkid: 2,
  courseGroupPkid: 18,
  publishStatusPkid: 3,
  scheduleOn: '2015-11-10',
  scheduleOff: '2021-11-01',
  hour: 21,
  listPrice: 24000,
  learningCredit: 6,
  material: null,
  objective: null,
  target: null,
  prerequisites: null,
  outline: null,
  towardCertOrExam: null,
  note: null,
  otherInfo: null,
  canRepeat: true,
  partner: { pkid: 2, name: 'Oracle' },
  courseGroup: { pkid: 18, description: 'Oracle SQL/DB系列課程' },
  publishStatus: { pkid: 3, description: '已下架' },
  certificationPkids: [5],
  jobCategoryPkids: [22],
};

function setup(id: string | null) {
  const service = jasmine.createSpyObj<CourseService>('CourseService', [
    'getById',
    'create',
    'update',
    'getPartnerOptions',
    'getCourseGroupOptions',
    'getPublishStatusOptions',
    'getCertificationOptions',
    'getJobCategoryOptions',
  ]);
  service.getById.and.returnValue(of(sample));
  service.create.and.returnValue(of(sample));
  service.update.and.returnValue(of(void 0));
  service.getPartnerOptions.and.returnValue(of([{ pkid: '2', label: 'Oracle' }]));
  service.getCourseGroupOptions.and.returnValue(
    of([{ pkid: '18', label: 'Oracle SQL/DB系列課程' }]),
  );
  service.getPublishStatusOptions.and.returnValue(of([{ pkid: '3', label: '已下架' }]));
  service.getCertificationOptions.and.returnValue(of([{ pkid: '5', label: 'Oracle - OCP' }]));
  service.getJobCategoryOptions.and.returnValue(of([{ pkid: '22', label: '資料庫管理' }]));

  const router = jasmine.createSpyObj<Router>('Router', ['navigate']);

  TestBed.configureTestingModule({
    imports: [CourseForm],
    providers: [
      provideNoopAnimations(),
      // The 異動紀錄 badge's RowAuditService rides the real HttpClient; the testing backend
      // satisfies the injection and leaves its GET pending (harmless here).
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: CourseService, useValue: service },
      { provide: Router, useValue: router },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } },
      },
    ],
  });

  const fixture: ComponentFixture<CourseForm> = TestBed.createComponent(CourseForm);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, service, router };
}

/** Fill every required control so the form is valid. */
function fillRequired(component: CourseForm) {
  component['form'].patchValue({
    title: '新課程',
    courseId: 'NEW1',
    prodCourseId: 'NEW1',
    friendlyUrl: 'new-1',
    displayOrder: 5,
    partnerPkid: 2,
    publishStatusPkid: 3,
    scheduleOn: new Date(2026, 2, 1),
    hour: 7,
    listPrice: 1000,
    learningCredit: 1.5,
  });
}

describe('CourseForm — add mode', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('is in add mode and invalid until the required fields are filled', () => {
    const { component } = setup(null);
    expect(component['isEdit']()).toBeFalse();
    expect(component['form'].invalid).toBeTrue();
  });

  it('loads all five lookups in parallel', () => {
    const { service } = setup(null);
    expect(service.getPartnerOptions).toHaveBeenCalled();
    expect(service.getCourseGroupOptions).toHaveBeenCalled();
    expect(service.getPublishStatusOptions).toHaveBeenCalled();
    expect(service.getCertificationOptions).toHaveBeenCalled();
    expect(service.getJobCategoryOptions).toHaveBeenCalled();
  });

  it('does not call the service when the form is invalid', () => {
    const { component, service } = setup(null);
    component['save']();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('creates with pkid 0 and navigates to the response pkid', () => {
    const { component, service, router } = setup(null);
    fillRequired(component);
    component['save']();

    expect(service.create).toHaveBeenCalled();
    const arg = service.create.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(0); // identity assigned server-side
    expect(arg.courseId).toBe('NEW1');
    expect(router.navigate).toHaveBeenCalledWith(['/courses', 1]);
  });

  it('serializes dates with local components, not UTC', () => {
    const { component, service } = setup(null);
    fillRequired(component);
    component['save']();

    // 2026-03-01 local midnight would serialize as 2026-02-28 via toISOString() in UTC+8.
    expect(service.create.calls.mostRecent().args[0].scheduleOn).toBe('2026-03-01');
  });

  it('sends null (not empty string) for blank optional fields', () => {
    const { component, service } = setup(null);
    fillRequired(component);
    component['form'].patchValue({ officialTitle: '   ', note: '' });
    component['save']();

    const arg = service.create.calls.mostRecent().args[0];
    expect(arg.officialTitle).toBeNull();
    expect(arg.note).toBeNull();
  });

  it('leaves the nullable courseGroupPkid null when not chosen', () => {
    const { component, service } = setup(null);
    fillRequired(component);
    component['save']();
    expect(service.create.calls.mostRecent().args[0].courseGroupPkid).toBeNull();
  });

  // --- ScheduleOff auto-default ------------------------------------------
  it('auto-defaults scheduleOff to scheduleOn + 10 years', () => {
    const { component } = setup(null);
    component['form'].controls.scheduleOn.setValue(new Date(2026, 2, 1));
    expect(toIso(component['form'].controls.scheduleOff.value!)).toBe('2036-03-01');
  });

  // --- Tab mitigations ----------------------------------------------------
  it('starts on the 基本資料 tab', () => {
    const { component } = setup(null);
    expect(component['activeTab']()).toBe('basic');
  });

  it('renders all four tab headers', () => {
    const { fixture } = setup(null);
    const tabs = (fixture.nativeElement as HTMLElement).querySelectorAll('p-tab');
    expect(tabs.length).toBe(4);
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('基本資料');
    expect(text).toContain('上架與價格');
    expect(text).toContain('課程內容');
    expect(text).toContain('關聯');
  });

  it('renders a tab error badge only after an invalid save', () => {
    const { fixture, component } = setup(null);
    const badges = () =>
      (fixture.nativeElement as HTMLElement).querySelectorAll('.tab-error').length;
    expect(badges()).toBe(0);

    component['save']();
    fixture.detectChanges();

    // 基本資料 and 上架與價格 both hold required fields.
    expect(badges()).toBe(2);
  });

  it('an invalid save switches to the first tab holding an invalid control', () => {
    const { component } = setup(null);
    component['activeTab'].set('content'); // user wandered off to a tab with no required fields
    component['save']();
    // title/courseId/... are all on 'basic' — the error must be brought on screen.
    expect(component['activeTab']()).toBe('basic');
  });

  it('an invalid save on a later tab focuses 上架與價格 when only that tab is invalid', () => {
    const { component } = setup(null);
    fillRequired(component);
    component['form'].controls.partnerPkid.setValue(null); // only 'publish' is now invalid
    component['activeTab'].set('content');
    component['save']();
    expect(component['activeTab']()).toBe('publish');
  });

  it('tabInvalid only flags a tab once its invalid controls are touched', () => {
    const { component } = setup(null);
    // Untouched: the form is invalid, but no badge should show yet.
    expect(component['tabInvalid']('basic')).toBeFalse();

    component['save'](); // invalid -> markAllAsTouched()

    expect(component['tabInvalid']('basic')).toBeTrue();
    expect(component['tabInvalid']('content')).toBeFalse(); // no required fields here
    expect(component['tabInvalid']('relations')).toBeFalse();
  });
});

describe('CourseForm — edit mode', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('loads the course, patches the form and keeps pkid disabled', () => {
    const { component, service } = setup('1');
    expect(component['isEdit']()).toBeTrue();
    expect(service.getById).toHaveBeenCalledWith(1);
    expect(component['form'].getRawValue().courseId).toBe('PLF');
    expect(component['form'].controls.pkid.disabled).toBeTrue();
  });

  /**
   * The subtle one: the +10y subscription must not clobber a loaded scheduleOff.
   * 2015-11-10 + 10y would be 2025-11-10; the stored 2021-11-01 has to win.
   */
  it('the loaded scheduleOff survives the auto-default subscription', () => {
    const { component } = setup('1');
    expect(toIso(component['form'].controls.scheduleOff.value!)).toBe('2021-11-01');
  });

  it('patches the N-N selections', () => {
    const { component } = setup('1');
    expect(component['form'].getRawValue().certificationPkids).toEqual([5]);
    expect(component['form'].getRawValue().jobCategoryPkids).toEqual([22]);
  });

  it('updates and navigates on save', () => {
    const { component, service, router } = setup('1');
    component['form'].patchValue({ title: 'Oracle (更新)' });
    component['save']();

    expect(service.update).toHaveBeenCalled();
    const arg = service.update.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(1);
    expect(arg.title).toBe('Oracle (更新)');
    expect(router.navigate).toHaveBeenCalledWith(['/courses', 1]);
  });
});

/**
 * The form is long enough (four tabs, nvarchar(max) textareas) that 儲存 has to stay reachable
 * without scrolling back up. Add and edit are the same component, but the toolbar's siblings differ
 * between them (the 主代碼 field, the 載入中… branch), so assert on both rather than assume.
 */
describe('CourseForm — sticky action toolbar', () => {
  beforeEach(() => TestBed.resetTestingModule());

  const toolbarOf = (fixture: ComponentFixture<CourseForm>) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.page-header--sticky');

  for (const [mode, id] of [
    ['add', null],
    ['edit', '1'],
  ] as const) {
    it(`pins the action toolbar to the top of the scroll area in ${mode} mode`, () => {
      const toolbar = toolbarOf(setup(id).fixture);
      expect(toolbar).withContext('action toolbar is rendered').not.toBeNull();

      const style = getComputedStyle(toolbar!);
      expect(style.position).toBe('sticky');
      expect(style.top).toBe('0px');
      // Must out-stack the form body card, which follows it in DOM order and would otherwise
      // paint over it.
      expect(Number(style.zIndex)).toBeGreaterThan(0);
    });

    it(`keeps 儲存 and 取消 inside the toolbar in ${mode} mode`, () => {
      const buttons = Array.from(toolbarOf(setup(id).fixture)!.querySelectorAll('button')).map(
        (b) => b.textContent!.trim(),
      );
      expect(buttons).toContain('儲存');
      expect(buttons).toContain('取消');
    });
  }
});
