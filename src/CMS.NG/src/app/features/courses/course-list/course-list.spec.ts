import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { CourseList } from './course-list';
import { CourseService } from '@core/services/course.service';
import { Course } from '@core/models/course.model';

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
  certificationPkids: [],
  jobCategoryPkids: [],
};

function setup(queryParams: Record<string, string> = {}) {
  const service = jasmine.createSpyObj<CourseService>('CourseService', [
    'query',
    'delete',
    'getPartnerOptions',
    'getCourseGroupOptions',
    'getPublishStatusOptions',
  ]);
  service.query.and.returnValue(of([sample]));
  service.delete.and.returnValue(of(void 0));
  service.getPartnerOptions.and.returnValue(of([{ pkid: '2', label: 'Oracle' }]));
  service.getCourseGroupOptions.and.returnValue(
    of([{ pkid: '18', label: 'Oracle SQL/DB系列課程' }]),
  );
  service.getPublishStatusOptions.and.returnValue(of([{ pkid: '3', label: '已下架' }]));

  const router = jasmine.createSpyObj<Router>('Router', ['navigate']);

  TestBed.configureTestingModule({
    imports: [CourseList],
    providers: [
      provideNoopAnimations(),
      { provide: CourseService, useValue: service },
      { provide: Router, useValue: router },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
      },
    ],
  });

  const fixture: ComponentFixture<CourseList> = TestBed.createComponent(CourseList);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, service, router };
}

describe('CourseList', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });

  it('loads courses on init via query', () => {
    const { component, service } = setup();
    expect(service.query).toHaveBeenCalled();
    expect(component['courses']()).toEqual([sample]);
  });

  it('defaults to sorting by courseId ascending', () => {
    const { component } = setup();
    // DisplayOrder is not a global ordering in this table — CourseId is the unique key.
    expect(component['sortField']).toBe('courseId');
    expect(component['sortOrder']).toBe(1);
  });

  it('loads the three filter lookups on init', () => {
    const { service, component } = setup();
    expect(service.getPartnerOptions).toHaveBeenCalled();
    expect(service.getCourseGroupOptions).toHaveBeenCalled();
    expect(service.getPublishStatusOptions).toHaveBeenCalled();
    // LookupItem.pkid is a string; the select options must be numeric for the query DTO.
    expect(component['partnerSelectOptions']).toEqual([{ pkid: 2, label: 'Oracle' }]);
  });

  it('renders the resolved nav-object labels, not raw FK ids', () => {
    const { fixture } = setup();
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('Oracle');
    expect(text).toContain('Oracle SQL/DB系列課程');
    expect(text).toContain('已下架');
  });

  it('add() navigates to the new form', () => {
    const { component, router } = setup();
    component['add']();
    expect(router.navigate).toHaveBeenCalledWith(['/courses/new']);
  });

  it('view() navigates to the detail route by pkid', () => {
    const { component, router } = setup();
    component['view'](sample);
    expect(router.navigate).toHaveBeenCalledWith(['/courses', 1]);
  });

  it('edit() navigates to the edit route', () => {
    const { component, router } = setup();
    component['edit'](sample);
    expect(router.navigate).toHaveBeenCalledWith(['/courses', 1, 'edit']);
  });

  it('applyFilters persists filters as ISO strings and re-queries', () => {
    const { component, service } = setup();
    service.query.calls.reset();
    component['filterDraft'] = {
      ...component['filterDraft'],
      keyword: 'Oracle',
      partnerPkid: 2,
      scheduleOnFrom: new Date(2020, 0, 1),
    };
    component['applyFilters']();

    const persisted = JSON.parse(sessionStorage.getItem('course-list-filters')!);
    expect(persisted.keyword).toBe('Oracle');
    expect(persisted.partnerPkid).toBe(2);
    // Local components — not toISOString(), which would shift to 2019-12-31 in UTC+8.
    expect(persisted.scheduleOnFrom).toBe('2020-01-01');
    expect(service.query).toHaveBeenCalled();
  });

  it('clearFilters resets and removes persisted filters', () => {
    const { component } = setup();
    sessionStorage.setItem('course-list-filters', JSON.stringify({ keyword: 'x' }));
    component['clearFilters']();
    expect(sessionStorage.getItem('course-list-filters')).toBeNull();
    expect(component['appliedFilters'].keyword).toBeNull();
  });

  it('onPage persists the page state', () => {
    const { component } = setup();
    component['onPage']({ first: 20, rows: 20 });
    expect(JSON.parse(sessionStorage.getItem('course-list-page')!)).toEqual({
      first: 20,
      rows: 20,
    });
  });

  it('an incoming courseGroupPkid query param overrides saved filters', () => {
    sessionStorage.setItem('course-list-filters', JSON.stringify({ keyword: 'stale' }));
    const { component } = setup({ courseGroupPkid: '18' });

    expect(component['appliedFilters'].courseGroupPkid).toBe(18);
    expect(component['appliedFilters'].keyword).toBeNull(); // saved filter discarded
  });

  it('an incoming partnerPkid query param overrides saved filters', () => {
    const { component } = setup({ partnerPkid: '2' });
    expect(component['appliedFilters'].partnerPkid).toBe(2);
  });

  it('delete confirmation warns that the N-N links are cascade-deleted', () => {
    const { component } = setup();
    const confirm = component['confirm'] as unknown as {
      confirm: (o: { message: string }) => void;
    };
    let captured = '';
    spyOn(confirm, 'confirm').and.callFake((o: { message: string }) => (captured = o.message));

    component['remove'](sample);

    expect(captured).toContain('PLF');
    expect(captured).toContain('此課程的認證與職務類別關聯將一併被刪除。');
  });
});
