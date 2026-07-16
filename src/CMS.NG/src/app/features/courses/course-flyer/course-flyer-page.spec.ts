import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { CourseFlyerPage } from './course-flyer-page';
import { CourseService } from '@core/services/course.service';
import { Course } from '@core/models/course.model';
import { toIso } from '@core/utils/date.util';

const today = toIso(new Date());

const liveCourse: Course = {
  pkid: 1,
  title: 'Oracle資料庫之PL／SQL基礎',
  officialTitle: null,
  // Trailing space on purpose (the pkid-2103 class of row): the QR keeps it verbatim,
  // but document.title trims it.
  courseId: 'PLF ',
  prodCourseId: 'PLF',
  friendlyUrl: 'oracle-plsql',
  displayOrder: 10,
  partnerPkid: 2,
  courseGroupPkid: 18,
  publishStatusPkid: 2,
  scheduleOn: '2015-11-10',
  scheduleOff: '2099-12-31',
  hour: 21,
  listPrice: 24000,
  learningCredit: 6,
  material: null,
  objective: '目標',
  target: null,
  prerequisites: null,
  outline: null,
  towardCertOrExam: null,
  note: null,
  otherInfo: null,
  canRepeat: true,
  partner: { pkid: 2, name: 'Oracle' },
  courseGroup: { pkid: 18, description: 'Oracle SQL/DB系列課程' },
  publishStatus: { pkid: 2, description: '上架中', isPublished: true },
  certificationPkids: [5],
  jobCategoryPkids: [22],
};

const unpublished: Course = {
  ...liveCourse,
  publishStatus: { pkid: 1, description: '草稿', isPublished: false },
};

function setup(opts: { course?: Course; fail?: boolean; print?: boolean } = {}) {
  const { course = liveCourse, fail = false, print = false } = opts;

  const service = jasmine.createSpyObj<CourseService>('CourseService', ['getWithLabels']);
  service.getWithLabels.and.returnValue(
    fail
      ? throwError(() => new Error('404'))
      : of({ course, certificationLabels: ['Oracle - OCP'], jobCategoryLabels: [] }),
  );

  TestBed.configureTestingModule({
    imports: [CourseFlyerPage],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      // RowAuditBadge rides the real HttpClient; the testing backend leaves its GET pending.
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: CourseService, useValue: service },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ id: '1' }),
            queryParamMap: convertToParamMap(print ? { print: '1' } : {}),
          },
        },
      },
    ],
  });

  const router = TestBed.inject(Router);
  const navigate = spyOn(router, 'navigate').and.resolveTo(true);
  const printSpy = spyOn(window, 'print');

  const fixture: ComponentFixture<CourseFlyerPage> = TestBed.createComponent(CourseFlyerPage);
  const component = fixture.componentInstance;
  // Collapse the double-rAF + setTimeout print scheduling to a synchronous call so specs
  // observe the fire deterministically. The real sequencing is a browser-behavior concern
  // covered by the manual print verification.
  spyOn(component as unknown as { queuePrint(fire: () => void): void }, 'queuePrint').and.callFake(
    (fire: () => void) => fire(),
  );
  fixture.detectChanges();
  return { fixture, component, service, navigate, printSpy };
}

/** Protected-member access for state the template drives in production. */
function poke<T>(component: CourseFlyerPage, member: string): T {
  return (component as unknown as Record<string, T>)[member];
}

describe('CourseFlyerPage', () => {
  afterEach(() => {
    // Never leak the print class between specs — each spec asserts its own lifecycle.
    document.body.classList.remove('flyer-print');
  });

  it('renders the sheet for a loaded course', () => {
    const { fixture } = setup();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-course-flyer-sheet')).not.toBeNull();
  });

  it('shows 查無此課程 on a load error', () => {
    const { fixture } = setup({ fail: true });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('查無此課程');
  });

  describe('document.title + body-class lifecycle', () => {
    it('sets the title to the trimmed CourseId + Title and restores it on destroy', () => {
      const original = document.title;
      const { fixture } = setup();
      expect(document.title).toBe('PLF Oracle資料庫之PL／SQL基礎');
      fixture.destroy();
      expect(document.title).toBe(original);
    });

    it('stamps body.flyer-print on init and removes it on destroy', () => {
      const { fixture } = setup();
      expect(document.body.classList.contains('flyer-print')).toBeTrue();
      fixture.destroy();
      expect(document.body.classList.contains('flyer-print')).toBeFalse();
    });

    it('cleans up on the notFound path too — destroy without a course ever loading', () => {
      const original = document.title;
      const { fixture } = setup({ fail: true });
      fixture.destroy();
      expect(document.body.classList.contains('flyer-print')).toBeFalse();
      expect(document.title).toBe(original);
    });
  });

  describe('publish gate', () => {
    it('shows no banner for a live course', () => {
      const { fixture } = setup();
      expect((fixture.nativeElement as HTMLElement).querySelector('.flyer-banner')).toBeNull();
    });

    it('shows the warning banner for an unpublished course', () => {
      const { fixture } = setup({ course: unpublished });
      const banner = (fixture.nativeElement as HTMLElement).querySelector('.flyer-banner');
      expect(banner!.textContent).toContain('非公開上架');
    });

    it('treats ScheduleOn = today as live (inclusive lower boundary)', () => {
      const { component } = setup({ course: { ...liveCourse, scheduleOn: today } });
      expect(poke<() => boolean>(component, 'isLive')()).toBeTrue();
    });

    it('treats ScheduleOff = today as live (inclusive upper boundary)', () => {
      const { component } = setup({ course: { ...liveCourse, scheduleOff: today } });
      expect(poke<() => boolean>(component, 'isLive')()).toBeTrue();
    });

    it('gates a published course whose schedule window has passed', () => {
      const { component, fixture } = setup({
        course: { ...liveCourse, scheduleOff: '2000-01-01' },
      });
      expect(poke<() => boolean>(component, 'isLive')()).toBeFalse();
      expect((fixture.nativeElement as HTMLElement).querySelector('.flyer-banner')).not.toBeNull();
    });

    it('is fail-safe: a status without the isPublished flag never counts as live', () => {
      const { component } = setup({
        course: { ...liveCourse, publishStatus: { pkid: 2, description: '上架中' } },
      });
      expect(poke<() => boolean>(component, 'isLive')()).toBeFalse();
    });
  });

  describe('?print=1 orchestration', () => {
    it('fires window.print once after the QR paints, then strips the param', () => {
      const { component, navigate, printSpy } = setup({ print: true });

      expect(printSpy).not.toHaveBeenCalled(); // held until the QR image decodes
      (component as unknown as { onQrImageLoaded(): void }).onQrImageLoaded();

      expect(printSpy).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(
        [],
        jasmine.objectContaining({
          queryParams: { print: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        }),
      );

      // A second load event (e.g. the img re-renders) must not re-print.
      (component as unknown as { onQrImageLoaded(): void }).onQrImageLoaded();
      expect(printSpy).toHaveBeenCalledTimes(1);
    });

    it('holds auto-print for a non-live course until the banner is confirmed', () => {
      const { component, fixture, printSpy } = setup({ course: unpublished, print: true });

      (component as unknown as { onQrImageLoaded(): void }).onQrImageLoaded();
      expect(printSpy).not.toHaveBeenCalled(); // held — banner owns the decision

      (component as unknown as { confirmPrint(): void }).confirmPrint();
      fixture.detectChanges();
      expect(printSpy).toHaveBeenCalledTimes(1);
    });

    it('is preview-only without the param — no auto print ever fires', () => {
      const { component, printSpy } = setup();
      (component as unknown as { onQrImageLoaded(): void }).onQrImageLoaded();
      expect(printSpy).not.toHaveBeenCalled();
    });

    it('turns a QR failure into a decision instead of a silent stall', () => {
      const { component, fixture, navigate, printSpy } = setup({ print: true });
      poke<{ set(v: boolean): void }>(component, 'qrError').set(true);
      poke<{ set(v: string): void }>(component, 'qrDataUrl').set('');
      fixture.detectChanges();

      const banner = (fixture.nativeElement as HTMLElement).querySelector('.flyer-banner--error');
      expect(banner!.textContent).toContain('QR Code 產生失敗');

      (component as unknown as { cancelPendingPrint(): void }).cancelPendingPrint();
      expect(printSpy).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(
        [],
        jasmine.objectContaining({ queryParams: { print: null }, replaceUrl: true }),
      );
    });
  });

  describe('preview controls', () => {
    it('返回課程 navigates back to the detail page', () => {
      const { component, navigate } = setup();
      (component as unknown as { back(): void }).back();
      expect(navigate).toHaveBeenCalledWith(['/courses', 1]);
    });

    it('disables 列印 for a non-live course until confirmed', () => {
      const { component, fixture } = setup({ course: unpublished });
      poke<{ set(v: string): void }>(component, 'qrDataUrl').set('data:image/png;base64,x');
      fixture.detectChanges();

      expect(poke<() => boolean>(component, 'canPrint')()).toBeFalse();
      (component as unknown as { confirmPrint(): void }).confirmPrint();
      expect(poke<() => boolean>(component, 'canPrint')()).toBeTrue();
    });

    it('shows and dismisses the print-dialog hint', () => {
      const { fixture } = setup();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.flyer-hint')!.textContent).toContain('頁首和頁尾');

      (el.querySelector('.flyer-hint__close') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el.querySelector('.flyer-hint')).toBeNull();
    });

    it('hosts the RowAudit badge in the preview chrome, never inside the sheet', () => {
      const { fixture } = setup();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.flyer-toolbar app-row-audit-badge')).not.toBeNull();
      expect(el.querySelector('app-course-flyer-sheet app-row-audit-badge')).toBeNull();
    });
  });
});
