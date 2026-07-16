import { toDataURL, QRCodeRenderersOptions } from 'qrcode';

import { environment } from '@env/environment';

/**
 * Shared QR rendering options — one source for the detail page's QR panel and the course flyer.
 * errorCorrectionLevel M keeps the symbol scannable after the flyer's ≥25mm print floor.
 */
export const QR_OPTIONS: QRCodeRenderersOptions = {
  errorCorrectionLevel: 'M',
  margin: 2,
  width: 220,
};

/**
 * Public-site URL a course QR encodes.
 *
 * `CourseId` is NOT URL-safe: of 1,080 dev rows, 15 carry spaces, parentheses or CJK characters
 * (e.g. `23aiNFA `, `DO180(NO)`, and pkid 1319's Chinese title), so the segment must be encoded —
 * verbatim, never trimmed (the QR must resolve to exactly the stored CourseId). `pkid` is an int
 * and needs none. See spec/course/CourseQRCode.md.
 */
export function buildCourseQrUrl(pkid: number, courseId: string): string {
  return `${environment.publicSiteUrl}/Course/Show/${pkid}/${encodeURIComponent(courseId)}`;
}

/** Bare QR as a PNG data URL (no caption — captions are the caller's concern). */
export function renderQrDataUrl(url: string): Promise<string> {
  return toDataURL(url, QR_OPTIONS);
}
