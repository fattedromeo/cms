import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { CourseGroupDetail } from './course-group-detail';
import { CourseGroupService } from '@core/services/course-group.service';
import { CourseGroup } from '@core/models/course-group.model';

const sample: CourseGroup = {
  pkid: 1,
  description: '資訊安全',
};

describe('CourseGroupDetail', () => {
  let fixture: ComponentFixture<CourseGroupDetail>;
  let component: CourseGroupDetail;
  let service: jasmine.SpyObj<CourseGroupService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<CourseGroupService>('CourseGroupService', ['getById']);
    service.getById.and.returnValue(of(sample));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [CourseGroupDetail],
      providers: [
        provideNoopAnimations(),
        // The 異動紀錄 badge's RowAuditService rides the real HttpClient; the testing backend
        // satisfies the injection and leaves its GET pending (harmless here).
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CourseGroupService, useValue: service },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '1' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CourseGroupDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the course group by numeric id', () => {
    expect(service.getById).toHaveBeenCalledWith(1);
    expect(component['courseGroup']()).toEqual(sample);
  });

  it('renders the description in the detail grid', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('資訊安全');
  });

  it('edit() navigates to the edit route', () => {
    component['edit']();
    expect(router.navigate).toHaveBeenCalledWith(['/course-groups', 1, 'edit']);
  });

  it('back() navigates to the list', () => {
    component['back']();
    expect(router.navigate).toHaveBeenCalledWith(['/course-groups']);
  });
});
