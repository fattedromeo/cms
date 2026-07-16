import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { PartnerDetail } from './partner-detail';
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

describe('PartnerDetail', () => {
  let fixture: ComponentFixture<PartnerDetail>;
  let component: PartnerDetail;
  let service: jasmine.SpyObj<PartnerService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<PartnerService>('PartnerService', ['getById']);
    service.getById.and.returnValue(of(sample));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [PartnerDetail],
      providers: [
        provideNoopAnimations(),
        // The 異動紀錄 badge's RowAuditService rides the real HttpClient; the testing backend
        // satisfies the injection and leaves its GET pending (harmless here).
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PartnerService, useValue: service },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '1' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PartnerDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the partner by numeric id', () => {
    expect(service.getById).toHaveBeenCalledWith(1);
    expect(component['partner']()).toEqual(sample);
  });

  it('renders the partner name in the detail grid', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('微軟認證課程');
  });

  it('edit() navigates to the edit route', () => {
    component['edit']();
    expect(router.navigate).toHaveBeenCalledWith(['/partners', 1, 'edit']);
  });

  it('back() navigates to the list', () => {
    component['back']();
    expect(router.navigate).toHaveBeenCalledWith(['/partners']);
  });
});
