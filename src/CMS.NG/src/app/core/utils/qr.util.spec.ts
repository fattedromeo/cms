import { environment } from '@env/environment';
import { buildCourseQrUrl, renderQrDataUrl } from './qr.util';

/**
 * URL-safety contract from spec/course/CourseQRCode.md: 15 of 1,080 dev rows carry characters
 * outside [A-Za-z0-9._-]. The QR must encode the STORED value verbatim — never trimmed — so it
 * always resolves to exactly the CourseId the record holds.
 */
describe('qr.util', () => {
  const base = `${environment.publicSiteUrl}/Course/Show`;

  describe('buildCourseQrUrl', () => {
    it('builds the pretty-case URL', () => {
      expect(buildCourseQrUrl(1, 'PLF')).toBe(`${base}/1/PLF`);
    });

    it('percent-encodes a trailing space verbatim — no trim (pkid 2103)', () => {
      expect(buildCourseQrUrl(2103, '23aiNFA ')).toBe(`${base}/2103/23aiNFA%20`);
    });

    it('does not trim a leading space either', () => {
      expect(buildCourseQrUrl(1, ' PLF ')).toBe(`${base}/1/%20PLF%20`);
    });

    it('keeps parentheses literal — encodeURIComponent leaves them unescaped (DO180(NO))', () => {
      expect(buildCourseQrUrl(500, 'DO180(NO)')).toBe(`${base}/500/DO180(NO)`);
    });

    it('percent-encodes CJK (pkid 1319)', () => {
      // 程 = %E7%A8%8B in UTF-8 — a literal so a broken encoder cannot tautologically pass.
      expect(buildCourseQrUrl(1319, '程式')).toBe(`${base}/1319/%E7%A8%8B%E5%BC%8F`);
    });
  });

  describe('renderQrDataUrl', () => {
    it('renders a PNG data URL', async () => {
      const url = await renderQrDataUrl(buildCourseQrUrl(1, 'PLF'));
      expect(url.startsWith('data:image/png')).toBeTrue();
    });
  });
});
