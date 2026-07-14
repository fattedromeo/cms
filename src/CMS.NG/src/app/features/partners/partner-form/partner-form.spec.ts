import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { PartnerForm } from './partner-form';
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

function setup(id: string | null) {
  const service = jasmine.createSpyObj<PartnerService>('PartnerService', [
    'getById',
    'create',
    'update',
  ]);
  service.getById.and.returnValue(of(sample));
  service.create.and.returnValue(of(sample));
  service.update.and.returnValue(of(void 0));
  const router = jasmine.createSpyObj<Router>('Router', ['navigate']);

  TestBed.configureTestingModule({
    imports: [PartnerForm],
    providers: [
      provideNoopAnimations(),
      { provide: PartnerService, useValue: service },
      { provide: Router, useValue: router },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } },
      },
    ],
  });

  const fixture: ComponentFixture<PartnerForm> = TestBed.createComponent(PartnerForm);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, service, router };
}

describe('PartnerForm — add mode', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('is in add mode and invalid until required fields are filled', () => {
    const { component } = setup(null);
    expect(component['isEdit']()).toBeFalse();
    expect(component['form'].invalid).toBeTrue(); // name/appKey/... required
  });

  it('does not call the service when the form is invalid', () => {
    const { component, service } = setup(null);
    component['save']();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('creates and navigates to the new detail page (pkid from response) on valid save', () => {
    const { component, service, router } = setup(null);
    component['form'].patchValue({
      name: '新廠商',
      appKey: 'NEW',
      nameOnPartnerMenu: '新廠商選單',
      nameOnCourseDetailPage: '新廠商',
      displayOrder: 5,
    });
    component['save']();

    expect(service.create).toHaveBeenCalled();
    const arg = service.create.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(0); // identity assigned server-side
    expect(arg.name).toBe('新廠商');
    expect(arg.imageFilename).toBeNull(); // blank optional -> null
    expect(router.navigate).toHaveBeenCalledWith(['/partners', 1]); // 1 = sample response pkid
  });
});

describe('PartnerForm — edit mode', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('loads the partner, patches the form and keeps pkid disabled', () => {
    const { component, service } = setup('1');
    expect(component['isEdit']()).toBeTrue();
    expect(service.getById).toHaveBeenCalledWith(1);
    expect(component['form'].getRawValue().name).toBe('微軟');
    expect(component['form'].controls.pkid.disabled).toBeTrue();
  });

  it('updates and navigates on save', () => {
    const { component, service, router } = setup('1');
    component['form'].patchValue({ name: '微軟 (更新)' });
    component['save']();

    expect(service.update).toHaveBeenCalled();
    const arg = service.update.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(1);
    expect(arg.name).toBe('微軟 (更新)');
    expect(router.navigate).toHaveBeenCalledWith(['/partners', 1]);
  });
});
