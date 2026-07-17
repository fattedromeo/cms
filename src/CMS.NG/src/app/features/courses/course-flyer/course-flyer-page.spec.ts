import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject, of, throwError } from 'rxjs';

import { CourseFlyerPage } from './course-flyer-page';
import { CourseService, CourseWithLabels } from '@core/services/course.service';
import { Course } from '@core/models/course.model';
import { toIso } from '@core/utils/date.util';

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

function setup(
  opts: { course?: Course; fail?: boolean; print?: boolean; slow?: boolean; captureQueue?: boolean } = {},
) {
  const { course = liveCourse, fail = false, print = false, slow = false, captureQueue = false } = opts;

  const service = jasmine.createSpyObj<CourseService>('CourseService', ['getWithLabels']);
  const slowSubject = new Subject<CourseWithLabels>();
  service.getWithLabels.and.returnValue(
    slow
      ? slowSubject.asObservable()
      : fail
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
  // covered by the manual print verification. `captureQueue` instead holds the callback so a
  // spec can simulate a fire arriving after the component has already navigated away (P2.3).
  let capturedFire: (() => void) | undefined;
  spyOn(component as unknown as { queuePrint(fire: () => void): void }, 'queuePrint').and.callFake(
    (fire: () => void) => (captureQueue ? (capturedFire = fire) : fire()),
  );
  fixture.detectChanges();
  return {
    fixture,
    component,
    service,
    navigate,
    printSpy,
    slowSubject,
    fireQueuedPrint: () => capturedFire?.(),
  };
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

  it('does not stall or crash on a load error with ?print=1 armed (P2.6)', () => {
    const { fixture, printSpy } = setup({ fail: true, print: true });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('查無此課程');
    expect((fixture.nativeElement as HTMLElement).querySelector('.flyer-hold')).toBeNull();
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('turns a real QR render failure into qrError — not a poked signal (P2.6)', async () => {
    // Forces the 'qrcode' library's real toDataURL rejection (data too large for byte mode),
    // exercising the renderQr catch branch end-to-end instead of setting qrError directly.
    const hugeCourseId = 'x'.repeat(3000);
    const { component, fixture } = setup({ course: { ...liveCourse, courseId: hugeCourseId } });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(poke<() => boolean>(component, 'qrError')()).toBeTrue();
    expect(poke<() => string>(component, 'qrDataUrl')()).toBe('');
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

    it('does not rewrite document.title if a slow response arrives after destroy (P2.2)', () => {
      const original = document.title;
      const { fixture, slowSubject } = setup({ slow: true });
      fixture.destroy();

      slowSubject.next({ course: liveCourse, certificationLabels: [], jobCategoryLabels: [] });

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

    describe('schedule boundary (clock-frozen)', () => {
      // `isLive()` re-reads `new Date()` at assert time; comparing it against a `today` computed
      // once at module load flakes across local midnight. Freeze the clock so both reads land on
      // the exact same instant, no matter when in the day the suite happens to run.
      const frozenNow = new Date(2026, 0, 15, 12, 0, 0);
      const frozenToday = toIso(frozenNow);

      beforeEach(() => {
        jasmine.clock().install();
        jasmine.clock().mockDate(frozenNow);
      });
      afterEach(() => jasmine.clock().uninstall());

      it('treats ScheduleOn = today as live (inclusive lower boundary)', () => {
        const { component } = setup({ course: { ...liveCourse, scheduleOn: frozenToday } });
        expect(poke<() => boolean>(component, 'isLive')()).toBeTrue();
      });

      it('treats ScheduleOff = today as live (inclusive upper boundary)', () => {
        const { component } = setup({ course: { ...liveCourse, scheduleOff: frozenToday } });
        expect(poke<() => boolean>(component, 'isLive')()).toBeTrue();
      });
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

    it('取消列印 on the warning banner clears the hold instead of dead-ending it (P2.4)', () => {
      const { fixture, navigate, printSpy } = setup({ course: unpublished, print: true });
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('.flyer-hold')!.textContent).toContain('準備列印');
      const cancelBtn = Array.from(el.querySelectorAll('.flyer-banner button')).find((b) =>
        b.textContent!.includes('取消列印'),
      ) as HTMLButtonElement;
      expect(cancelBtn).toBeTruthy();

      cancelBtn.click();
      fixture.detectChanges();

      expect(el.querySelector('.flyer-hold')).toBeNull();
      expect(printSpy).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(
        [],
        jasmine.objectContaining({ queryParams: { print: null }, replaceUrl: true }),
      );
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

    it('turns an <img> decode failure into the same QR-failure decision as a toDataURL rejection (P2.1)', () => {
      // qrDataUrl was set (renderQr succeeded) but the <img> itself failed to decode it — the
      // sheet's (error) output routes here exactly like the (load) output routes to onQrImageLoaded.
      const { component, fixture, printSpy } = setup({ print: true });
      poke<{ set(v: string): void }>(component, 'qrDataUrl').set('data:image/png;base64,x');
      fixture.detectChanges();

      (component as unknown as { onQrImageError(): void }).onQrImageError();
      fixture.detectChanges();

      expect(poke<() => string>(component, 'qrDataUrl')()).toBe('');
      const banner = (fixture.nativeElement as HTMLElement).querySelector('.flyer-banner--error');
      expect(banner).not.toBeNull();
      expect(printSpy).not.toHaveBeenCalled(); // stall averted — now a decision, not a hang
    });

    it('does not fire window.print() if the deferred callback lands after destroy (P2.3)', () => {
      const { component, fixture, printSpy, fireQueuedPrint } = setup({
        print: true,
        captureQueue: true,
      });
      (component as unknown as { onQrImageLoaded(): void }).onQrImageLoaded(); // schedules, held
      expect(printSpy).not.toHaveBeenCalled();

      fixture.destroy(); // navigated away before the rAF/setTimeout chain landed
      fireQueuedPrint(); // simulate the deferred callback finally running

      expect(printSpy).not.toHaveBeenCalled();
    });

    it('does not open a second dialog if a manual click races the auto-print fire (P2.5)', () => {
      const { component, printSpy } = setup({ print: true });
      (component as unknown as { onQrImageLoaded(): void }).onQrImageLoaded();
      expect(printSpy).toHaveBeenCalledTimes(1);

      (component as unknown as { print(): void }).print();
      expect(printSpy).toHaveBeenCalledTimes(1); // printFired guard — no second dialog
    });

    describe('printWithoutQr()', () => {
      it('fires for a live course whose QR failed', () => {
        const { component, fixture, printSpy } = setup({ print: true });
        poke<{ set(v: boolean): void }>(component, 'qrError').set(true);
        fixture.detectChanges();

        (component as unknown as { printWithoutQr(): void }).printWithoutQr();
        expect(printSpy).toHaveBeenCalledTimes(1);
      });

      it('is a no-op for a non-live, unconfirmed course whose QR failed', () => {
        const { component, fixture, printSpy } = setup({ course: unpublished, print: true });
        poke<{ set(v: boolean): void }>(component, 'qrError').set(true);
        fixture.detectChanges();

        (component as unknown as { printWithoutQr(): void }).printWithoutQr();
        expect(printSpy).not.toHaveBeenCalled(); // still gated — banner owns the decision
      });
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
      (component as unknown as { onQrImageLoaded(): void }).onQrImageLoaded();
      fixture.detectChanges();

      expect(poke<() => boolean>(component, 'canPrint')()).toBeFalse();
      (component as unknown as { confirmPrint(): void }).confirmPrint();
      expect(poke<() => boolean>(component, 'canPrint')()).toBeTrue();
    });

    it('keeps 列印 disabled once qrDataUrl is set but before the <img> has decoded (P2.5)', () => {
      // canPrint gates on qrPainted (the <img> load event), not on qrDataUrl merely being set —
      // a fast click must not race ahead of the paint.
      const { component, fixture } = setup();
      poke<{ set(v: string): void }>(component, 'qrDataUrl').set('data:image/png;base64,x');
      fixture.detectChanges();
      expect(poke<() => boolean>(component, 'canPrint')()).toBeFalse();

      (component as unknown as { onQrImageLoaded(): void }).onQrImageLoaded();
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
