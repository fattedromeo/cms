import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { PartnerList } from './partner-list';
import { PartnerService } from '@core/services/partner.service';
import { Partner } from '@core/models/partner.model';

const sample: Partner = {
  pkid: 1,
  name: '微軟',
  appKey: 'MS',
  nameOnPartnerMenu: '微軟認證課程',
  nameOnCourseDetailPage: '微軟',
  displayOrder: 10,
  imageFilename: 'ms.png',
};

describe('PartnerList', () => {
  let fixture: ComponentFixture<PartnerList>;
  let component: PartnerList;
  let service: jasmine.SpyObj<PartnerService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    sessionStorage.clear();
    service = jasmine.createSpyObj<PartnerService>('PartnerService', ['query', 'delete']);
    service.query.and.returnValue(of([sample]));
    service.delete.and.returnValue(of(void 0));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [PartnerList],
      providers: [
        provideNoopAnimations(),
        { provide: PartnerService, useValue: service },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PartnerList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads partners on init via query', () => {
    expect(service.query).toHaveBeenCalled();
    expect(component['partners']()).toEqual([sample]);
  });

  it('add() navigates to the new form', () => {
    component['add']();
    expect(router.navigate).toHaveBeenCalledWith(['/partners/new']);
  });

  it('view() navigates to the detail route by pkid', () => {
    component['view'](sample);
    expect(router.navigate).toHaveBeenCalledWith(['/partners', 1]);
  });

  it('edit() navigates to the edit route', () => {
    component['edit'](sample);
    expect(router.navigate).toHaveBeenCalledWith(['/partners', 1, 'edit']);
  });

  it('applyFilters persists filters and re-queries', () => {
    service.query.calls.reset();
    component['filterDraft'] = { keyword: '微軟' };
    component['applyFilters']();

    expect(JSON.parse(sessionStorage.getItem('partner-list-filters')!)).toEqual({ keyword: '微軟' });
    expect(service.query).toHaveBeenCalledWith({ keyword: '微軟' });
  });

  it('clearFilters resets and removes persisted filters', () => {
    sessionStorage.setItem('partner-list-filters', JSON.stringify({ keyword: 'x' }));
    component['clearFilters']();
    expect(sessionStorage.getItem('partner-list-filters')).toBeNull();
    expect(component['appliedFilters']).toEqual({ keyword: null });
  });

  it('onPage persists the page state', () => {
    component['onPage']({ first: 20, rows: 20 });
    expect(JSON.parse(sessionStorage.getItem('partner-list-page')!)).toEqual({
      first: 20,
      rows: 20,
    });
  });
});
