import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CourseFlyerSheet } from './course-flyer-sheet';
import { Course } from '@core/models/course.model';

/** A live, fully-populated course — the happy path. */
const sample: Course = {
  pkid: 1,
  title: 'Oracle資料庫之PL／SQL基礎',
  officialTitle: 'Oracle PL/SQL Fundamentals',
  courseId: 'PLF',
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
  material: '原廠教材',
  objective: '從零開始掌握 PL/SQL。',
  target: '欲轉職之社會人士。',
  prerequisites: '具基本 SQL 能力。',
  outline: '1. 語法基礎\n2. 預存程序',
  towardCertOrExam: null,
  note: '內部備註 — 不得出現在傳單',
  otherInfo: null,
  canRepeat: true,
  partner: { pkid: 2, name: 'Oracle' },
  courseGroup: { pkid: 18, description: 'Oracle SQL/DB系列課程' },
  publishStatus: { pkid: 2, description: '上架中', isPublished: true },
  certificationPkids: [5],
  jobCategoryPkids: [22],
};

/**
 * The monster row — every hostile trait at once: all nullable fields NULL, 0 price, 0 hours,
 * no certifications, unpublished, CJK CourseId. The sheet must still render a valid flyer.
 */
const monster: Course = {
  ...sample,
  title: 'Python-程式設計開發應用',
  officialTitle: null,
  courseId: 'Python-程式設計開發應用',
  publishStatusPkid: 1,
  hour: 0,
  listPrice: 0,
  material: null,
  objective: null,
  target: null,
  prerequisites: null,
  outline: null,
  publishStatus: { pkid: 1, description: '草稿', isPublished: false },
  certificationPkids: [],
  jobCategoryPkids: [],
};

function setup(course: Course = sample, certificationLabels: string[] = ['Oracle - OCP']) {
  TestBed.configureTestingModule({ imports: [CourseFlyerSheet] });
  const fixture: ComponentFixture<CourseFlyerSheet> = TestBed.createComponent(CourseFlyerSheet);
  fixture.componentRef.setInput('course', course);
  fixture.componentRef.setInput('certificationLabels', certificationLabels);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

function factCells(el: HTMLElement): { label: string; value: string }[] {
  return Array.from(el.querySelectorAll('.sheet__fact')).map((cell) => ({
    label: cell.querySelector('.sheet__fact-label')!.textContent!.trim(),
    value: cell.querySelector('.sheet__fact-value')!.textContent!.trim(),
  }));
}

function sectionTitles(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('.sheet__section-title')).map((h) => h.textContent!.trim());
}

describe('CourseFlyerSheet', () => {
  it('renders the marketing field set', () => {
    const { el } = setup();
    expect(el.querySelector('.sheet__title')!.textContent).toContain('Oracle資料庫之PL／SQL基礎');
    expect(el.querySelector('.sheet__official')!.textContent).toContain('Oracle PL/SQL Fundamentals');
    expect(sectionTitles(el)).toEqual(['課程目標', '適合對象', '先修條件', '課程大綱']);
  });

  it('never renders admin fields — the flyer is a handout, not an archive', () => {
    const { el } = setup();
    const text = el.textContent!;
    expect(text).not.toContain('顯示順序');
    expect(text).not.toContain('oracle-plsql'); // FriendlyUrl
    expect(text).not.toContain('上架中'); // PublishStatus description
    expect(text).not.toContain('內部備註'); // Note is not a flyer field
  });

  describe('facts strip', () => {
    it('renders 4 cells with the price formatted and dominant', () => {
      const { el } = setup();
      expect(factCells(el)).toEqual([
        { label: '課程時數', value: '21 小時' },
        { label: '定價', value: 'NT$ 24,000' },
        { label: '課程代號', value: 'PLF' },
        { label: '相關認證', value: 'Oracle - OCP' },
      ]);
      const dominant = el.querySelector('.sheet__fact--dominant .sheet__fact-value');
      expect(dominant!.textContent).toContain('NT$ 24,000');
    });

    it('degrades to 3 cells when there are no certifications', () => {
      const { el } = setup(sample, []);
      expect(factCells(el).map((c) => c.label)).toEqual(['課程時數', '定價', '課程代號']);
    });

    it('truncates 3+ certifications to the first 2 + 等 N 項認證 on one line', () => {
      const { el } = setup(sample, ['A', 'B', 'C', 'D']);
      expect(factCells(el).at(-1)!.value).toBe('A、B 等 4 項認證');
    });

    it('renders 洽詢 for a 0 price and omits a 0-hour cell', () => {
      const { el } = setup({ ...sample, listPrice: 0, hour: 0 });
      const cells = factCells(el);
      expect(cells.map((c) => c.label)).not.toContain('課程時數');
      expect(cells.find((c) => c.label === '定價')!.value).toBe('洽詢');
    });
  });

  describe('empty handling — omitted entirely, never a bare heading', () => {
    it('omits empty sections and the official title line', () => {
      const { el } = setup({ ...sample, officialTitle: null, objective: null, outline: '   ' });
      expect(el.querySelector('.sheet__official')).toBeNull();
      expect(sectionTitles(el)).toEqual(['適合對象', '先修條件']);
    });

    it('monster row still renders a valid flyer', () => {
      const { el } = setup(monster, []);
      expect(el.querySelector('.sheet__title')!.textContent).toContain('Python-程式設計開發應用');
      expect(el.querySelector('.sheet__official')).toBeNull();
      expect(sectionTitles(el)).toEqual([]);
      expect(factCells(el)).toEqual([
        { label: '定價', value: '洽詢' },
        { label: '課程代號', value: 'Python-程式設計開發應用' },
      ]);
      expect(el.querySelector('.sheet__qr-caption')!.textContent).toContain('Python-程式設計開發應用');
    });
  });

  it('strips embedded HTML fragments from section text — tags are never printed literally', () => {
    // Real dev rows carry markup like this (SSCP's Objective) — found by print-PDF verification.
    const objective = '<font color="#BD0000">● 認可證照</font>\nSSCP<sup>®</sup>認證';
    const { el } = setup({ ...sample, objective });
    const text = el.querySelector('.sheet__section-text')!.textContent!;
    expect(text).toBe('● 認可證照\nSSCP®認證');
    expect(text).not.toContain('<font');
    expect(text).not.toContain('<sup>');
  });

  it('preserves newlines and CJK full-width-space indentation via pre-wrap', () => {
    const outline = '第一章\n　子項目一\n　子項目二';
    const { el } = setup({ ...sample, outline });
    const text = el.querySelectorAll('.sheet__section-text');
    const outlineEl = text[text.length - 1] as HTMLElement;
    // The DOM keeps the raw text (interpolation, no innerHTML)…
    expect(outlineEl.textContent).toBe(outline);
    // …and pre-wrap makes the newlines and space-indentation survive rendering.
    expect(getComputedStyle(outlineEl).whiteSpace).toBe('pre-wrap');
  });

  describe('footer', () => {
    it('prints a dated disclaimer — shape-asserted, never "today" across midnight', () => {
      const { el } = setup();
      const meta = el.querySelector('.sheet__meta')!.textContent!;
      expect(meta).toMatch(/^\d{4}\/\d{2}\/\d{2} 印製/);
      expect(meta).toContain('價格與開課資訊以官網公告為準');
    });

    it('shows contact block from environment constants', () => {
      const { el } = setup();
      const contact = el.querySelector('.sheet__contact')!.textContent!;
      expect(contact).toContain('(02)25149191');
      expect(contact).toContain('UCOM@uuu.com.tw');
    });

    it('shows the QR image when a data URL is provided, the error slot when it failed', () => {
      const { fixture, el } = setup();
      expect(el.querySelector('.sheet__qr-image')).toBeNull();

      fixture.componentRef.setInput('qrDataUrl', 'data:image/png;base64,x');
      fixture.detectChanges();
      expect(el.querySelector('.sheet__qr-image')).not.toBeNull();

      fixture.componentRef.setInput('qrDataUrl', '');
      fixture.componentRef.setInput('qrError', true);
      fixture.detectChanges();
      expect(el.querySelector('.sheet__qr-error')!.textContent).toContain('QR Code 產生失敗');
    });

    it('emits qrImageLoaded when the QR <img> decodes', (done) => {
      const { fixture, el } = setup();
      fixture.componentInstance.qrImageLoaded.subscribe(() => done());
      // A real 1x1 PNG so the browser fires a genuine load event.
      fixture.componentRef.setInput(
        'qrDataUrl',
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      );
      fixture.detectChanges();
      expect(el.querySelector('.sheet__qr-image')).not.toBeNull();
    });

    it('emits qrImageError when the QR <img> fails to decode (P2.1)', (done) => {
      const { fixture, el } = setup();
      fixture.componentInstance.qrImageError.subscribe(() => done());
      // Valid base64, but not a real PNG — the browser fires a genuine error event on decode failure.
      fixture.componentRef.setInput('qrDataUrl', 'data:image/png;base64,AAAAAAAAAAAAAAAA');
      fixture.detectChanges();
      expect(el.querySelector('.sheet__qr-image')).not.toBeNull();
    });
  });
});
