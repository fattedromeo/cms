import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { CourseGroupForm } from './course-group-form';
import { CourseGroupService } from '@core/services/course-group.service';
import { CourseGroup } from '@core/models/course-group.model';

const sample: CourseGroup = {
  pkid: 1,
  description: '資訊安全',
};

function setup(id: string | null) {
  const service = jasmine.createSpyObj<CourseGroupService>('CourseGroupService', [
    'getById',
    'create',
    'update',
  ]);
  service.getById.and.returnValue(of(sample));
  service.create.and.returnValue(of(sample));
  service.update.and.returnValue(of(void 0));
  const router = jasmine.createSpyObj<Router>('Router', ['navigate']);

  TestBed.configureTestingModule({
    imports: [CourseGroupForm],
    providers: [
      provideNoopAnimations(),
      { provide: CourseGroupService, useValue: service },
      { provide: Router, useValue: router },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } },
      },
    ],
  });

  const fixture: ComponentFixture<CourseGroupForm> = TestBed.createComponent(CourseGroupForm);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, service, router };
}

describe('CourseGroupForm — add mode', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('is in add mode and invalid until description is filled', () => {
    const { component } = setup(null);
    expect(component['isEdit']()).toBeFalse();
    expect(component['form'].invalid).toBeTrue(); // description required
  });

  it('does not call the service when the form is invalid', () => {
    const { component, service } = setup(null);
    component['save']();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('creates and navigates to the new detail page (pkid from response) on valid save', () => {
    const { component, service, router } = setup(null);
    component['form'].patchValue({ description: '雲端運算' });
    component['save']();

    expect(service.create).toHaveBeenCalled();
    const arg = service.create.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(0); // identity assigned server-side
    expect(arg.description).toBe('雲端運算');
    expect(router.navigate).toHaveBeenCalledWith(['/course-groups', 1]); // 1 = sample response pkid
  });

  it('trims the description before sending', () => {
    const { component, service } = setup(null);
    component['form'].patchValue({ description: '  雲端運算  ' });
    component['save']();

    expect(service.create.calls.mostRecent().args[0].description).toBe('雲端運算');
  });
});

describe('CourseGroupForm — edit mode', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('loads the course group, patches the form and keeps pkid disabled', () => {
    const { component, service } = setup('1');
    expect(component['isEdit']()).toBeTrue();
    expect(service.getById).toHaveBeenCalledWith(1);
    expect(component['form'].getRawValue().description).toBe('資訊安全');
    expect(component['form'].controls.pkid.disabled).toBeTrue();
  });

  it('updates and navigates on save', () => {
    const { component, service, router } = setup('1');
    component['form'].patchValue({ description: '資訊安全 (更新)' });
    component['save']();

    expect(service.update).toHaveBeenCalled();
    const arg = service.update.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(1);
    expect(arg.description).toBe('資訊安全 (更新)');
    expect(router.navigate).toHaveBeenCalledWith(['/course-groups', 1]);
  });
});
