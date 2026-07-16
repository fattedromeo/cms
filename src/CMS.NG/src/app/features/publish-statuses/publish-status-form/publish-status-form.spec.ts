import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { PublishStatusForm } from './publish-status-form';
import { PublishStatusService } from '@core/services/publish-status.service';
import { PublishStatus } from '@core/models/publish-status.model';

const sample: PublishStatus = {
  pkid: 2,
  description: '已發布',
  isDraft: false,
  isPublished: true,
  isDiscontinued: false,
};

function setup(id: string | null) {
  const service = jasmine.createSpyObj<PublishStatusService>('PublishStatusService', [
    'getById',
    'create',
    'update',
  ]);
  service.getById.and.returnValue(of(sample));
  service.create.and.returnValue(of(sample));
  service.update.and.returnValue(of(void 0));
  const router = jasmine.createSpyObj<Router>('Router', ['navigate']);

  TestBed.configureTestingModule({
    imports: [PublishStatusForm],
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
        useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } },
      },
    ],
  });

  const fixture: ComponentFixture<PublishStatusForm> = TestBed.createComponent(PublishStatusForm);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, service, router };
}

describe('PublishStatusForm — add mode', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('is in add mode with pkid enabled and required', () => {
    const { component } = setup(null);
    expect(component['isEdit']()).toBeFalse();
    expect(component['form'].controls.pkid.enabled).toBeTrue();
    expect(component['form'].invalid).toBeTrue(); // pkid + description required
  });

  it('does not call the service when the form is invalid', () => {
    const { component, service } = setup(null);
    component['save']();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('creates and navigates to the detail page on valid save', () => {
    const { component, service, router } = setup(null);
    component['form'].patchValue({ pkid: 5, description: '新狀態', isDraft: true });
    component['save']();

    expect(service.create).toHaveBeenCalled();
    const arg = service.create.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(5);
    expect(arg.description).toBe('新狀態');
    expect(arg.isDraft).toBeTrue();
    expect(router.navigate).toHaveBeenCalledWith(['/publish-statuses', 5]);
  });

  it('surfaces a 409 conflict without navigating', () => {
    const { component, service, router } = setup(null);
    service.create.and.returnValue(throwError(() => ({ status: 409 })));
    component['form'].patchValue({ pkid: 2, description: '已發布' });
    component['save']();

    expect(service.create).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

describe('PublishStatusForm — edit mode', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('loads the status, patches the form and disables pkid', () => {
    const { component, service } = setup('2');
    expect(component['isEdit']()).toBeTrue();
    expect(service.getById).toHaveBeenCalledWith(2);
    expect(component['form'].getRawValue().description).toBe('已發布');
    expect(component['form'].controls.pkid.disabled).toBeTrue();
  });

  it('updates and navigates on save', () => {
    const { component, service, router } = setup('2');
    component['form'].patchValue({ description: '已發布 (更新)' });
    component['save']();

    expect(service.update).toHaveBeenCalled();
    const arg = service.update.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(2);
    expect(arg.description).toBe('已發布 (更新)');
    expect(router.navigate).toHaveBeenCalledWith(['/publish-statuses', 2]);
  });
});
