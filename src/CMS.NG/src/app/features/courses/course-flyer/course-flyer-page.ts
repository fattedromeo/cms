import { Component, OnDestroy, OnInit, Renderer2, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';

import { CourseService } from '@core/services/course.service';
import { Course } from '@core/models/course.model';
import { buildCourseQrUrl, renderQrDataUrl } from '@core/utils/qr.util';
import { toIso } from '@core/utils/date.util';
import { RowAuditBadge } from '@app/shared/row-audit-badge/row-audit-badge';
import { CourseFlyerSheet } from './course-flyer-sheet';

/**
 * Route wrapper for the course flyer (spec/course/CourseFlyer.md): loads the course, runs the
 * publish gate, orchestrates `?print=1`, and owns the document.title / body-class lifecycle.
 * Everything visual lives in CourseFlyerSheet — this component is deliberately not reusable.
 */
@Component({
  selector: 'app-course-flyer-page',
  imports: [ButtonModule, RowAuditBadge, CourseFlyerSheet],
  templateUrl: './course-flyer-page.html',
  styleUrl: './course-flyer-page.scss',
})
export class CourseFlyerPage implements OnInit, OnDestroy {
  private readonly service = inject(CourseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly renderer = inject(Renderer2);
  private readonly document = inject(DOCUMENT);

  protected readonly course = signal<Course | null>(null);
  protected readonly certificationLabels = signal<string[]>([]);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly qrDataUrl = signal('');
  protected readonly qrError = signal(false);

  /** True while a `?print=1` auto-print is armed and has not yet fired or been cancelled. */
  protected readonly printPending = signal(false);
  /** Per-visit gate confirmation — resets on route re-entry by construction (component state). */
  protected readonly printConfirmed = signal(false);
  protected readonly hintDismissed = signal(false);

  private originalTitle = '';
  private printScheduled = false;
  private qrPainted = false;

  /**
   * The publish gate. Fail-safe: only `isPublished === true` counts (the flag is absent on
   * client-relabeled nav objects — never here, since this page always loads fresh from the API).
   * Boundaries are inclusive both ends, compared as yyyy-MM-dd strings (rule 17). Heuristic:
   * the public site's real visibility logic lives outside this repo.
   */
  protected readonly isLive = computed(() => {
    const c = this.course();
    if (!c) return false;
    const today = toIso(new Date());
    return c.publishStatus?.isPublished === true && c.scheduleOn <= today && today <= c.scheduleOff;
  });

  /** Data + QR outcome are in (success or loud failure) — preview controls may enable. */
  protected readonly ready = computed(() => !!this.course() && (!!this.qrDataUrl() || this.qrError()));

  /** 列印 stays disabled for a non-live course until the banner's explicit confirm. */
  protected readonly canPrint = computed(() => this.ready() && (this.isLive() || this.printConfirmed()));

  ngOnInit(): void {
    this.originalTitle = this.document.title;
    // Body class keys the global print CSS (styles.scss). Component styles are
    // _ngcontent-scoped and cannot reach the shell — this is the documented mechanism.
    this.renderer.addClass(this.document.body, 'flyer-print');

    this.printPending.set(this.route.snapshot.queryParamMap.get('print') === '1');

    const pkid = Number(this.route.snapshot.paramMap.get('id'));
    this.service.getWithLabels(pkid).subscribe({
      next: ({ course, certificationLabels }) => {
        this.course.set(course);
        this.certificationLabels.set(certificationLabels);
        this.loading.set(false);
        // Chrome's Save-as-PDF default filename comes from document.title. Trimmed CourseId:
        // a trailing space (pkid 2103) does not survive a filesystem anyway.
        this.document.title = `${course.courseId.trim()} ${course.title}`;
        void this.renderQr(course);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    // Runs on the notFound path too — a leaked body class would rewire every route's Ctrl+P,
    // and a stuck title would mislabel the tab for the rest of the session.
    this.renderer.removeClass(this.document.body, 'flyer-print');
    this.document.title = this.originalTitle;
  }

  /** QR generation failure is loud, never a stall: the pending auto-print becomes a decision. */
  private async renderQr(course: Course): Promise<void> {
    try {
      this.qrDataUrl.set(await renderQrDataUrl(buildCourseQrUrl(course.pkid, course.courseId)));
    } catch {
      this.qrError.set(true);
    }
  }

  /** The sheet's QR <img> has decoded — the last precondition for a pending auto-print. */
  protected onQrImageLoaded(): void {
    this.qrPainted = true;
    this.tryAutoPrint();
  }

  protected confirmPrint(): void {
    this.printConfirmed.set(true);
    this.tryAutoPrint();
  }

  /** 列印 button — enabled only via canPrint(), so the gate has already been satisfied. */
  protected print(): void {
    this.firePrint();
  }

  /** QR failed while `?print=1` was armed and the user chose to print anyway. */
  protected printWithoutQr(): void {
    if (this.isLive() || this.printConfirmed()) {
      this.firePrint();
    }
  }

  protected cancelPendingPrint(): void {
    this.printPending.set(false);
    this.stripPrintParam();
  }

  protected back(): void {
    const c = this.course();
    this.router.navigate(c ? ['/courses', c.pkid] : ['/courses']);
  }

  private tryAutoPrint(): void {
    if (!this.printPending() || this.printScheduled) return;
    if (!this.course() || !this.qrPainted) return;
    if (!this.isLive() && !this.printConfirmed()) return; // held by the banner until confirm
    this.printScheduled = true; // fire-once, even if another precondition re-triggers
    this.queuePrint(() => this.firePrint());
  }

  /**
   * window.print() is synchronous and must not fire inside change detection; the img `load`
   * event fires on decode, not paint. Double-rAF walks past the next paint, setTimeout leaves
   * the current task. Protected so specs can collapse the timing to a synchronous call.
   */
  protected queuePrint(fire: () => void): void {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(fire)));
  }

  private firePrint(): void {
    window.print();
    if (this.printPending()) {
      this.printPending.set(false);
      this.stripPrintParam();
    }
  }

  /** F5 / back-forward must not re-fire the dialog or re-arm the confirm. */
  private stripPrintParam(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { print: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
