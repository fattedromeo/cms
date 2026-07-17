import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { toCanvas } from 'qrcode';

import { CourseService } from '@core/services/course.service';
import { Course } from '@core/models/course.model';
import { QR_OPTIONS, buildCourseQrUrl, renderQrDataUrl } from '@core/utils/qr.util';
import { RowAuditBadge } from '@app/shared/row-audit-badge/row-audit-badge';

/** Height of the white band composited under the QR to hold the CourseId caption. */
const CAPTION_BAND_PX = 34;

@Component({
  selector: 'app-course-detail',
  imports: [CommonModule, RouterLink, ButtonModule, RowAuditBadge],
  templateUrl: './course-detail.html',
  styleUrl: './course-detail.scss',
})
export class CourseDetail implements OnInit {
  private readonly service = inject(CourseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly course = signal<Course | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);

  // The N-N lists come back as pkids; resolve them to labels for display.
  protected readonly certificationLabels = signal<string[]>([]);
  protected readonly jobCategoryLabels = signal<string[]>([]);

  /** PNG data URL of the bare QR shown on the page. The caption is HTML, not part of this image. */
  protected readonly qrDataUrl = signal<string>('');

  /** Public-site URL the QR encodes — URL-safety rules live in `qr.util.ts`. */
  protected readonly qrUrl = computed(() => {
    const c = this.course();
    if (!c) return '';
    return buildCourseQrUrl(c.pkid, c.courseId);
  });

  ngOnInit(): void {
    const pkid = Number(this.route.snapshot.paramMap.get('id'));

    // Label resolution lives in CourseService.getWithLabels — shared with the flyer page.
    this.service.getWithLabels(pkid).subscribe({
      next: ({ course, certificationLabels, jobCategoryLabels }) => {
        this.course.set(course);
        this.certificationLabels.set(certificationLabels);
        this.jobCategoryLabels.set(jobCategoryLabels);
        this.loading.set(false);
        void this.renderQr();
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }

  private async renderQr(): Promise<void> {
    this.qrDataUrl.set(await renderQrDataUrl(this.qrUrl()));
  }

  /**
   * QR plus the CourseId caption drawn beneath it, so the saved file identifies its own course.
   * The on-page QR stays bare — its caption is HTML.
   */
  private async composePng(courseId: string): Promise<string> {
    const qr = await toCanvas(this.qrUrl(), QR_OPTIONS);

    const canvas = document.createElement('canvas');
    canvas.width = qr.width;
    canvas.height = qr.height + CAPTION_BAND_PX;

    const ctx = canvas.getContext('2d')!;
    // qrcode's own margin is transparent, so paint the background before drawing onto it.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(qr, 0, 0);

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // maxWidth condenses rather than overflows — CourseId runs to 18 chars in the dev data.
    ctx.fillText(courseId, canvas.width / 2, qr.height + CAPTION_BAND_PX / 2, canvas.width - 16);

    return canvas.toDataURL('image/png');
  }

  protected async downloadQr(): Promise<void> {
    const c = this.course();
    if (!c) return;

    const anchor = document.createElement('a');
    anchor.href = await this.composePng(c.courseId);
    // The URL keeps CourseId verbatim, but a filename does not survive trailing spaces anyway.
    anchor.download = `${c.courseId.trim()}.png`;
    anchor.click();
  }

  edit(): void {
    const c = this.course();
    if (c) this.router.navigate(['/courses', c.pkid, 'edit']);
  }

  /** Opens the flyer print-first: `?print=1` auto-fires the dialog once data + QR are ready. */
  flyer(): void {
    const c = this.course();
    if (c) this.router.navigate(['/courses', c.pkid, 'flyer'], { queryParams: { print: 1 } });
  }

  back(): void {
    this.router.navigate(['/courses']);
  }
}
