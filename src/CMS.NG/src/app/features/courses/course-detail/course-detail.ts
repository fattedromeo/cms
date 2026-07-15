import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { toCanvas, toDataURL, QRCodeRenderersOptions } from 'qrcode';

import { environment } from '@env/environment';
import { CourseService } from '@core/services/course.service';
import { Course } from '@core/models/course.model';
import { LookupItem } from '@core/models/lookup-item.model';

const QR_OPTIONS: QRCodeRenderersOptions = {
  errorCorrectionLevel: 'M',
  margin: 2,
  width: 220,
};

/** Height of the white band composited under the QR to hold the CourseId caption. */
const CAPTION_BAND_PX = 34;

@Component({
  selector: 'app-course-detail',
  imports: [CommonModule, RouterLink, ButtonModule],
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

  /**
   * Public-site URL the QR encodes.
   *
   * `CourseId` is NOT URL-safe: of 1,080 dev rows, 15 carry spaces, parentheses or CJK characters
   * (e.g. `23aiNFA `, `DO180(NO)`, and pkid 1319's Chinese title), so the segment must be encoded.
   * `pkid` is an int and needs none.
   */
  protected readonly qrUrl = computed(() => {
    const c = this.course();
    if (!c) return '';
    return `${environment.publicSiteUrl}/Course/Show/${c.pkid}/${encodeURIComponent(c.courseId)}`;
  });

  ngOnInit(): void {
    const pkid = Number(this.route.snapshot.paramMap.get('id'));

    forkJoin({
      course: this.service.getById(pkid),
      certifications: this.service.getCertificationOptions(),
      jobCategories: this.service.getJobCategoryOptions(),
    }).subscribe({
      next: ({ course, certifications, jobCategories }) => {
        this.course.set(course);
        this.certificationLabels.set(this.resolve(certifications, course.certificationPkids));
        this.jobCategoryLabels.set(this.resolve(jobCategories, course.jobCategoryPkids));
        this.loading.set(false);
        void this.renderQr();
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }

  /** LookupItem.pkid is a string; the course carries numeric pkids. */
  private resolve(options: LookupItem[], pkids: number[]): string[] {
    return options.filter((o) => pkids.includes(Number(o.pkid))).map((o) => o.label);
  }

  private async renderQr(): Promise<void> {
    this.qrDataUrl.set(await toDataURL(this.qrUrl(), QR_OPTIONS));
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

  back(): void {
    this.router.navigate(['/courses']);
  }
}
