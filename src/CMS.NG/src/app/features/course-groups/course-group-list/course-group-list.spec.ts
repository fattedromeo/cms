import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { CourseGroupList } from './course-group-list';
import { CourseGroupService } from '@core/services/course-group.service';
import { CourseGroup } from '@core/models/course-group.model';

const sample: CourseGroup = {
  pkid: 1,
  description: '資訊安全',
};

describe('CourseGroupList', () => {
  let fixture: ComponentFixture<CourseGroupList>;
  let component: CourseGroupList;
  let service: jasmine.SpyObj<CourseGroupService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    sessionStorage.clear();
    service = jasmine.createSpyObj<CourseGroupService>('CourseGroupService', ['query', 'delete']);
    service.query.and.returnValue(of([sample]));
    service.delete.and.returnValue(of(void 0));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [CourseGroupList],
      providers: [
        provideNoopAnimations(),
        { provide: CourseGroupService, useValue: service },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CourseGroupList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads course groups on init via query', () => {
    expect(service.query).toHaveBeenCalled();
    expect(component['courseGroups']()).toEqual([sample]);
  });

  it('defaults to sorting by pkid ascending', () => {
    expect(component['sortField']).toBe('pkid');
    expect(component['sortOrder']).toBe(1);
  });

  it('add() navigates to the new form', () => {
    component['add']();
    expect(router.navigate).toHaveBeenCalledWith(['/course-groups/new']);
  });

  it('view() navigates to the detail route by pkid', () => {
    component['view'](sample);
    expect(router.navigate).toHaveBeenCalledWith(['/course-groups', 1]);
  });

  it('edit() navigates to the edit route', () => {
    component['edit'](sample);
    expect(router.navigate).toHaveBeenCalledWith(['/course-groups', 1, 'edit']);
  });

  it('applyFilters persists filters and re-queries', () => {
    service.query.calls.reset();
    component['filterDraft'] = { keyword: '資訊' };
    component['applyFilters']();

    expect(JSON.parse(sessionStorage.getItem('course-group-list-filters')!)).toEqual({
      keyword: '資訊',
    });
    expect(service.query).toHaveBeenCalledWith({ keyword: '資訊' });
  });

  it('clearFilters resets and removes persisted filters', () => {
    sessionStorage.setItem('course-group-list-filters', JSON.stringify({ keyword: 'x' }));
    component['clearFilters']();
    expect(sessionStorage.getItem('course-group-list-filters')).toBeNull();
    expect(component['appliedFilters']).toEqual({ keyword: null });
  });

  it('onPage persists the page state', () => {
    component['onPage']({ first: 20, rows: 20 });
    expect(JSON.parse(sessionStorage.getItem('course-group-list-page')!)).toEqual({
      first: 20,
      rows: 20,
    });
  });

  it('delete confirmation warns that courses are cascade-deleted', () => {
    const confirm = component['confirm'] as unknown as { confirm: (o: { message: string }) => void };
    let captured = '';
    spyOn(confirm, 'confirm').and.callFake((o: { message: string }) => (captured = o.message));

    component['remove'](sample);

    expect(captured).toContain('資訊安全');
    expect(captured).toContain('此群組底下的課程將一併被刪除。');
  });
});
