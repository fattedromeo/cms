import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { CourseDetail } from './course-detail';
import { CourseService } from '@core/services/course.service';
import { Course } from '@core/models/course.model';

const sample: Course = {
  pkid: 1,
  title: 'Oracle資料庫之PL／SQL基礎',
  officialTitle: null,
  courseId: 'PLF',
  prodCourseId: 'PLF',
  friendlyUrl: 'oracle-plsql',
  displayOrder: 10,
  partnerPkid: 2,
  courseGroupPkid: 18,
  publishStatusPkid: 3,
  scheduleOn: '2015-11-10',
  scheduleOff: '2021-11-01',
  hour: 21,
  listPrice: 24000,
  learningCredit: 6,
  material: null,
  objective: null,
  target: null,
  prerequisites: null,
  outline: null,
  towardCertOrExam: null,
  note: null,
  otherInfo: null,
  canRepeat: true,
  partner: { pkid: 2, name: 'Oracle' },
  courseGroup: { pkid: 18, description: 'Oracle SQL/DB系列課程' },
  publishStatus: { pkid: 3, description: '已下架' },
  certificationPkids: [5],
  jobCategoryPkids: [22],
};

function setup(course: Course | null = sample, fail = false) {
  const service = jasmine.createSpyObj<CourseService>('CourseService', [
    'getById',
    'getCertificationOptions',
    'getJobCategoryOptions',
  ]);
  service.getById.and.returnValue(fail ? throwError(() => new Error('404')) : of(course!));
  service.getCertificationOptions.and.returnValue(of([{ pkid: '5', label: 'Oracle - OCP' }]));
  service.getJobCategoryOptions.and.returnValue(of([{ pkid: '22', label: '資料庫管理' }]));

  // The template uses routerLink for the FK links, and RouterLink subscribes to router.events —
  // a jasmine Router spy has no events observable, so provide the real router and spy on navigate.
  TestBed.configureTestingModule({
    imports: [CourseDetail],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      // The 異動紀錄 badge's RowAuditService rides the real HttpClient; the testing backend
      // satisfies the injection and leaves its GET pending (harmless here).
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: CourseService, useValue: service },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: '1' }) } },
      },
    ],
  });

  const router = TestBed.inject(Router);
  const navigate = spyOn(router, 'navigate').and.resolveTo(true);

  const fixture: ComponentFixture<CourseDetail> = TestBed.createComponent(CourseDetail);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, service, navigate };
}

/**
 * Intercept the `<a download>` the component builds, without disturbing the `<canvas>` it also
 * creates while compositing. Returns the stubbed anchor, whose click is spied rather than fired.
 */
function stubAnchor(): HTMLAnchorElement & { click: jasmine.Spy } {
  const anchor = document.createElement('a');
  spyOn(anchor, 'click');
  const create = document.createElement.bind(document);
  spyOn(document, 'createElement').and.callFake((tag: string) =>
    tag === 'a' ? anchor : create(tag as keyof HTMLElementTagNameMap),
  );
  return anchor as HTMLAnchorElement & { click: jasmine.Spy };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to decode'));
    img.src = dataUrl;
  });
}

/** True when any non-white pixel exists below `y` — i.e. the caption band was actually drawn on. */
function hasInkBelow(img: HTMLImageElement, y: number): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const band = ctx.getImageData(0, y, img.width, img.height - y).data;
  for (let i = 0; i < band.length; i += 4) {
    if (band[i] !== 255 || band[i + 1] !== 255 || band[i + 2] !== 255) return true;
  }
  return false;
}

describe('CourseDetail', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('loads the course by numeric id', () => {
    const { component, service } = setup();
    expect(service.getById).toHaveBeenCalledWith(1);
    expect(component['course']()).toEqual(sample);
  });

  it('renders the course and its resolved FK labels', () => {
    const { fixture } = setup();
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('PLF');
    expect(text).toContain('Oracle');
    expect(text).toContain('Oracle SQL/DB系列課程');
    expect(text).toContain('已下架');
  });

  it('resolves the N-N pkids to labels', () => {
    const { component } = setup();
    expect(component['certificationLabels']()).toEqual(['Oracle - OCP']);
    expect(component['jobCategoryLabels']()).toEqual(['資料庫管理']);
  });

  it('renders an em dash when the nullable courseGroup FK is null', () => {
    const { component } = setup({ ...sample, courseGroupPkid: null, courseGroup: null });
    expect(component['course']()!.courseGroup).toBeNull();
  });

  it('flags notFound when the course is missing', () => {
    const { component } = setup(null, true);
    expect(component['notFound']()).toBeTrue();
  });

  it('edit() navigates to the edit route', () => {
    const { component, navigate } = setup();
    component['edit']();
    expect(navigate).toHaveBeenCalledWith(['/courses', 1, 'edit']);
  });

  it('back() navigates to the list', () => {
    const { component, navigate } = setup();
    component['back']();
    expect(navigate).toHaveBeenCalledWith(['/courses']);
  });

  describe('QR code', () => {
    it('encodes the public course URL built from pkid and courseId', () => {
      const { component } = setup();
      expect(component['qrUrl']()).toBe('https://www.uuu.com.tw/Course/Show/1/PLF');
    });

    it('percent-encodes a courseId that is not URL-safe', () => {
      // 15 of the 1,080 dev rows carry spaces or CJK characters; pkid 2103 is literally `23aiNFA `.
      const { component } = setup({ ...sample, pkid: 2103, courseId: '23aiNFA ' });
      expect(component['qrUrl']()).toBe('https://www.uuu.com.tw/Course/Show/2103/23aiNFA%20');
    });

    it('encodes the URL verbatim rather than trimming the stored courseId', () => {
      const { component } = setup({ ...sample, courseId: ' PLF ' });
      expect(component['qrUrl']()).toContain('/Course/Show/1/%20PLF%20');
    });

    it('is empty while no course is loaded', () => {
      const { component } = setup(null, true);
      expect(component['qrUrl']()).toBe('');
    });

    it('renders a QR image once the course loads', async () => {
      const { fixture, component } = setup();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component['qrDataUrl']()).toMatch(/^data:image\/png;base64,/);

      const img: HTMLImageElement = fixture.nativeElement.querySelector('.qr-panel__image');
      expect(img).toBeTruthy();
      expect(img.src).toBe(component['qrDataUrl']());
    });

    it('shows the courseId as the QR title', async () => {
      const { fixture } = setup();
      await fixture.whenStable();
      fixture.detectChanges();

      const caption: HTMLElement = fixture.nativeElement.querySelector('.qr-panel__title');
      expect(caption.textContent!.trim()).toBe('PLF');
    });

    it('downloads a PNG named after the courseId', async () => {
      const { fixture, component } = setup();
      await fixture.whenStable();

      const anchor = stubAnchor();
      await component['downloadQr']();

      expect(anchor.href).toMatch(/^data:image\/png;base64,/);
      expect(anchor.download).toBe('PLF.png');
      expect(anchor.click).toHaveBeenCalled();
    });

    it('trims the download filename even though the URL keeps the courseId verbatim', async () => {
      const { fixture, component } = setup({ ...sample, courseId: '23aiNFA ' });
      await fixture.whenStable();

      const anchor = stubAnchor();
      await component['downloadQr']();

      expect(anchor.download).toBe('23aiNFA.png');
    });

    it('composites the title under the QR, making the download taller than the bare code', async () => {
      const { fixture, component } = setup();
      await fixture.whenStable();

      const bare = await loadImage(component['qrDataUrl']());
      const composed = await loadImage(await component['composePng']('PLF'));

      expect(composed.width).toBe(bare.width);
      expect(composed.height).toBe(bare.height + 34); // CAPTION_BAND_PX
      expect(hasInkBelow(composed, bare.height)).toBeTrue();
    });

    it('does nothing when there is no course to download', async () => {
      const { component } = setup(null, true);
      const anchor = stubAnchor();
      await component['downloadQr']();
      expect(anchor.click).not.toHaveBeenCalled();
    });
  });
});
