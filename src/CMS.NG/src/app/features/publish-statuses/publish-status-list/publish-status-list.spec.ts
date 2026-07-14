import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { PublishStatusList } from './publish-status-list';
import { PublishStatusService } from '@core/services/publish-status.service';
import { PublishStatus } from '@core/models/publish-status.model';

const sample: PublishStatus = {
  pkid: 2,
  description: '已發布',
  isDraft: false,
  isPublished: true,
  isDiscontinued: false,
};

describe('PublishStatusList', () => {
  let fixture: ComponentFixture<PublishStatusList>;
  let component: PublishStatusList;
  let service: jasmine.SpyObj<PublishStatusService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    sessionStorage.clear();
    service = jasmine.createSpyObj<PublishStatusService>('PublishStatusService', ['query', 'delete']);
    service.query.and.returnValue(of([sample]));
    service.delete.and.returnValue(of(void 0));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [PublishStatusList],
      providers: [
        provideNoopAnimations(),
        { provide: PublishStatusService, useValue: service },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PublishStatusList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads statuses on init via query', () => {
    expect(service.query).toHaveBeenCalled();
    expect(component['statuses']()).toEqual([sample]);
  });

  it('add() navigates to the new form', () => {
    component['add']();
    expect(router.navigate).toHaveBeenCalledWith(['/publish-statuses/new']);
  });

  it('view() navigates to the detail route by pkid', () => {
    component['view'](sample);
    expect(router.navigate).toHaveBeenCalledWith(['/publish-statuses', 2]);
  });

  it('edit() navigates to the edit route', () => {
    component['edit'](sample);
    expect(router.navigate).toHaveBeenCalledWith(['/publish-statuses', 2, 'edit']);
  });

  it('applyFilters persists filters and re-queries', () => {
    service.query.calls.reset();
    component['filterDraft'] = { keyword: '發布', isDraft: null, isPublished: true, isDiscontinued: null };
    component['applyFilters']();

    expect(JSON.parse(sessionStorage.getItem('publish-status-list-filters')!)).toEqual({
      keyword: '發布',
      isDraft: null,
      isPublished: true,
      isDiscontinued: null,
    });
    expect(service.query).toHaveBeenCalledWith({
      keyword: '發布',
      isDraft: null,
      isPublished: true,
      isDiscontinued: null,
    });
  });

  it('clearFilters resets and removes persisted filters', () => {
    sessionStorage.setItem('publish-status-list-filters', JSON.stringify({ keyword: 'x' }));
    component['clearFilters']();
    expect(sessionStorage.getItem('publish-status-list-filters')).toBeNull();
    expect(component['appliedFilters']).toEqual({
      keyword: null,
      isDraft: null,
      isPublished: null,
      isDiscontinued: null,
    });
  });

  it('onPage persists the page state', () => {
    component['onPage']({ first: 20, rows: 20 });
    expect(JSON.parse(sessionStorage.getItem('publish-status-list-page')!)).toEqual({
      first: 20,
      rows: 20,
    });
  });
});
