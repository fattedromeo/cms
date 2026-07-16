import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { PublishStatusDetail } from './publish-status-detail';
import { PublishStatusService } from '@core/services/publish-status.service';
import { PublishStatus } from '@core/models/publish-status.model';

const sample: PublishStatus = {
  pkid: 2,
  description: '已發布',
  isDraft: false,
  isPublished: true,
  isDiscontinued: false,
};

describe('PublishStatusDetail', () => {
  let fixture: ComponentFixture<PublishStatusDetail>;
  let component: PublishStatusDetail;
  let service: jasmine.SpyObj<PublishStatusService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<PublishStatusService>('PublishStatusService', ['getById']);
    service.getById.and.returnValue(of(sample));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [PublishStatusDetail],
      providers: [
        provideNoopAnimations(),
        // The 異動紀錄 badge's RowAuditService rides the real HttpClient; the testing backend
        // satisfies the injection and leaves its GET pending (harmless here).
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PublishStatusService, useValue: service },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '2' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PublishStatusDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the status by numeric id', () => {
    expect(service.getById).toHaveBeenCalledWith(2);
    expect(component['status']()).toEqual(sample);
  });

  it('renders the description in the detail grid', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('已發布');
  });

  it('edit() navigates to the edit route', () => {
    component['edit']();
    expect(router.navigate).toHaveBeenCalledWith(['/publish-statuses', 2, 'edit']);
  });

  it('back() navigates to the list', () => {
    component['back']();
    expect(router.navigate).toHaveBeenCalledWith(['/publish-statuses']);
  });
});
