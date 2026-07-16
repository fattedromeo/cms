import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

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

/**
 * What `GET /api/courses/{id}` returns for the same course — note the N-N lists are populated
 * here but empty on `sample`, exactly as the real API behaves. The inline-edit save path re-reads
 * through this, and PUTting the empty list instead would delete the junction rows.
 */
const sampleDetail: Course = {
  ...sample,
  certificationPkids: [7],
  jobCategoryPkids: [1, 4],
};

function setup(queryParams: Record<string, string> = {}) {
  const service = jasmine.createSpyObj<CourseService>('CourseService', [
    'query',
    'delete',
    'getById',
    'update',
    'getPartnerOptions',
    'getCourseGroupOptions',
    'getPublishStatusOptions',
  ]);
  service.query.and.returnValue(of([sample]));
  service.delete.and.returnValue(of(void 0));
  service.getById.and.returnValue(of(sampleDetail));
  service.update.and.returnValue(of(void 0));
  service.getPartnerOptions.and.returnValue(of([{ pkid: '2', label: 'Oracle' }]));
  service.getCourseGroupOptions.and.returnValue(
    of([{ pkid: '18', label: 'Oracle SQL/DB系列課程' }]),
  );
  service.getPublishStatusOptions.and.returnValue(
    of([
      { pkid: '1', label: '上架' },
      { pkid: '3', label: '已下架' },
    ]),
  );

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

// --- Inline editing ---------------------------------------------------------

/** Body cells of the single sample row, in column order. */
function cells(fixture: ComponentFixture<CourseList>): HTMLTableCellElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr:first-child > td'),
  );
}

/** Column index of each list column — the read-only three are called out. */
const COL = {
  pkid: 0, // read-only
  displayOrder: 1,
  courseId: 2,
  prodCourseId: 3,
  title: 4,
  partner: 5, // read-only
  courseGroup: 6, // read-only
  publishStatus: 7,
  scheduleOn: 8,
  scheduleOff: 9,
  hour: 10,
  listPrice: 11,
  learningCredit: 12,
  canRepeat: 13,
} as const;

function dblclick(cell: HTMLElement): void {
  cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
}

/** Drive one edit through the component: open the cell, set a value, blur. */
function editCell(component: CourseList, field: string, value: unknown): void {
  const c = component as unknown as {
    startEdit: (course: Course, f: string) => void;
    commit: (course: Course) => void;
    editValue: unknown;
  };
  c.startEdit(sample, field);
  c.editValue = value;
  c.commit(sample);
}

describe('CourseList inline editing', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });

  describe('edit trigger', () => {
    it('a double click enters edit mode and renders an editor', () => {
      const { fixture, component } = setup();
      dblclick(cells(fixture)[COL.title]);
      fixture.detectChanges();

      expect(component['editing']()).toEqual({ pkid: 1, field: 'title' });
      expect(cells(fixture)[COL.title].querySelector('input')).not.toBeNull();
    });

    it('a single click does NOT enter edit mode', () => {
      const { fixture, component } = setup();
      const cell = cells(fixture)[COL.title];
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();

      expect(component['editing']()).toBeNull();
      expect(cell.querySelector('input')).toBeNull();
    });

    it('escape closes the editor without saving', () => {
      const { component, service } = setup();
      component['startEdit'](sample, 'title');
      component['cancelEdit']();

      expect(component['editing']()).toBeNull();
      expect(service.update).not.toHaveBeenCalled();
    });
  });

  describe('read-only columns', () => {
    // 主代碼 is the immutable key; 原廠 / 課程群組 are FK nav objects resolved by the API's JOIN.
    const readOnly = [
      ['主代碼 (pkid)', COL.pkid],
      ['原廠 (partner.name)', COL.partner],
      ['課程群組 (courseGroup.description)', COL.courseGroup],
    ] as const;

    for (const [label, index] of readOnly) {
      it(`${label} does not enter edit mode on double click`, () => {
        const { fixture, component } = setup();
        dblclick(cells(fixture)[index]);
        fixture.detectChanges();

        expect(component['editing']()).toBeNull();
        expect(cells(fixture)[index].querySelector('input')).toBeNull();
      });

      it(`${label} is not marked editable`, () => {
        const { fixture } = setup();
        expect(cells(fixture)[index].classList).not.toContain('cell-editable');
      });
    }

    it('every other column IS marked editable', () => {
      const { fixture } = setup();
      const editable = [
        COL.displayOrder,
        COL.courseId,
        COL.prodCourseId,
        COL.title,
        COL.publishStatus,
        COL.scheduleOn,
        COL.scheduleOff,
        COL.hour,
        COL.listPrice,
        COL.learningCredit,
        COL.canRepeat,
      ];
      for (const index of editable) {
        expect(cells(fixture)[index].classList).toContain('cell-editable');
      }
    });
  });

  describe('persisting on blur', () => {
    it('blurring an edited cell calls the update endpoint with the new value', () => {
      const { fixture, service } = setup();
      dblclick(cells(fixture)[COL.hour]);
      fixture.detectChanges();

      const input = cells(fixture)[COL.hour].querySelector('input')!;
      input.value = '30';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      input.dispatchEvent(new Event('blur'));
      fixture.detectChanges();

      expect(service.update).toHaveBeenCalled();
      expect(service.update.calls.mostRecent().args[0].hour).toBe(30);
    });

    /**
     * The one that matters. `POST /api/courses/query` returns empty N-N lists, but
     * `PUT /api/courses` replaces the junction rows from the request — so PUTting the list row
     * would silently delete the course's 認證 / 職務類別 links and still return 204.
     */
    it('re-reads the course so the PUT preserves the N-N links', () => {
      const { component, service } = setup();
      expect(sample.jobCategoryPkids).toEqual([]); // what the list row carries

      editCell(component, 'hour', 30);

      expect(service.getById).toHaveBeenCalledWith(1);
      const sent = service.update.calls.mostRecent().args[0];
      expect(sent.certificationPkids).toEqual([7]);
      expect(sent.jobCategoryPkids).toEqual([1, 4]);
      expect(sent.hour).toBe(30);
    });

    it('sends every other column through from the re-read, unmodified', () => {
      const { component, service } = setup();
      editCell(component, 'hour', 30);

      const sent = service.update.calls.mostRecent().args[0];
      expect(sent.pkid).toBe(1);
      expect(sent.title).toBe(sampleDetail.title);
      expect(sent.listPrice).toBe(sampleDetail.listPrice);
      expect(sent.canRepeat).toBe(sampleDetail.canRepeat);
    });

    it('does not call the endpoint when the value is unchanged', () => {
      const { component, service } = setup();
      editCell(component, 'hour', sample.hour);

      expect(service.update).not.toHaveBeenCalled();
      expect(component['editing']()).toBeNull();
    });

    it('reflects a saved value in the row', () => {
      const { component } = setup();
      editCell(component, 'hour', 30);
      expect(component['courses']()[0].hour).toBe(30);
    });

    it('relabels the 上架狀態 nav object, which is what the cell renders', () => {
      const { component } = setup();
      editCell(component, 'publishStatusPkid', 1);

      expect(component['courses']()[0].publishStatus).toEqual({ pkid: 1, description: '上架' });
    });

    it('serializes an edited date with local parts, not UTC', () => {
      const { component, service } = setup();
      editCell(component, 'scheduleOn', new Date(2020, 2, 1));

      // toISOString() would send 2020-02-29 in UTC+8.
      expect(service.update.calls.mostRecent().args[0].scheduleOn).toBe('2020-03-01');
    });
  });

  describe('validation', () => {
    /** Asserts the edit was blocked: error shown, cell still open, nothing sent. */
    function expectBlocked(
      component: CourseList,
      service: jasmine.SpyObj<CourseService>,
      contains: string,
    ) {
      expect(component['editError']()).toContain(contains);
      expect(component['editing']()).not.toBeNull();
      expect(service.update).not.toHaveBeenCalled();
    }

    it('blocks clearing a required text field', () => {
      const { component, service } = setup();
      editCell(component, 'title', '   ');
      expectBlocked(component, service, '必填');
    });

    it('blocks clearing a required numeric field', () => {
      const { component, service } = setup();
      editCell(component, 'hour', null);
      expectBlocked(component, service, '必填');
    });

    it('blocks clearing a required date field', () => {
      const { component, service } = setup();
      editCell(component, 'scheduleOn', null);
      expectBlocked(component, service, '必填');
    });

    for (const field of ['hour', 'listPrice', 'learningCredit'] as const) {
      it(`blocks a negative ${field}`, () => {
        const { component, service } = setup();
        editCell(component, field, -1);
        expectBlocked(component, service, '不可為負數');
      });
    }

    it('blocks a non-numeric value', () => {
      const { component, service } = setup();
      editCell(component, 'hour', 'abc');
      expectBlocked(component, service, '有效數字');
    });

    it('blocks an invalid date', () => {
      const { component, service } = setup();
      editCell(component, 'scheduleOn', new Date('not a date'));
      expectBlocked(component, service, '有效日期');
    });

    it('blocks 上架日期 later than 下架日期', () => {
      const { component, service } = setup();
      // sample.scheduleOff is 2021-11-01.
      editCell(component, 'scheduleOn', new Date(2022, 0, 1));
      expectBlocked(component, service, '上架日期不可晚於下架日期');
    });

    it('blocks 下架日期 earlier than 上架日期', () => {
      const { component, service } = setup();
      // sample.scheduleOn is 2015-11-10.
      editCell(component, 'scheduleOff', new Date(2015, 0, 1));
      expectBlocked(component, service, '下架日期不可早於上架日期');
    });

    it('allows 上架日期 equal to 下架日期', () => {
      const { component, service } = setup();
      // The rule is <=, not <: four dev rows legitimately have ScheduleOn = ScheduleOff.
      editCell(component, 'scheduleOn', new Date(2021, 10, 1)); // == sample.scheduleOff
      expect(component['editError']()).toBeNull();
      expect(service.update).toHaveBeenCalled();
    });

    it('blocks a fractional 定價 — decimal(9, 0) would silently round it', () => {
      const { component, service } = setup();
      editCell(component, 'listPrice', 24000.5);
      expectBlocked(component, service, '整數');
    });

    it('allows a fractional 點數 — decimal(9, 1), and 387 dev rows use it', () => {
      const { component, service } = setup();
      editCell(component, 'learningCredit', 5.5);
      expect(component['editError']()).toBeNull();
      expect(service.update).toHaveBeenCalled();
    });

    it('blocks 點數 with a 2nd decimal place, which decimal(9, 1) would round away', () => {
      const { component, service } = setup();
      editCell(component, 'learningCredit', 5.55);
      expectBlocked(component, service, '小數');
    });

    it('blocks 時數 over the smallint ceiling', () => {
      const { component, service } = setup();
      editCell(component, 'hour', 32768);
      expectBlocked(component, service, '32767');
    });

    it('clears the error once a corrected value is committed', () => {
      const { component, service } = setup();
      editCell(component, 'hour', -1);
      expect(component['editError']()).not.toBeNull();

      component['editValue'] = 30;
      component['commit'](sample);

      expect(component['editError']()).toBeNull();
      expect(service.update).toHaveBeenCalled();
    });
  });

  describe('save failure', () => {
    it('reverts the cell and surfaces the error when the PUT fails', () => {
      const { component, service } = setup();
      service.update.and.returnValue(throwError(() => ({ status: 500 })));

      editCell(component, 'hour', 99);

      expect(component['editing']()).toBeNull(); // editor closed
      expect(component['courses']()[0].hour).toBe(sample.hour); // old value still on the row
    });

    it('reverts the cell when the re-read fails', () => {
      const { component, service } = setup();
      service.getById.and.returnValue(throwError(() => ({ status: 404 })));

      editCell(component, 'hour', 99);

      expect(service.update).not.toHaveBeenCalled();
      expect(component['editing']()).toBeNull();
      expect(component['courses']()[0].hour).toBe(sample.hour);
    });
  });
});
