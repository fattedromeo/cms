import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { environment } from '@env/environment';
import { Course, CourseQuery, CourseRequest } from '@core/models/course.model';
import { LookupItem } from '@core/models/lookup-item.model';

/** A course plus its N-N pkid lists resolved to display labels (detail page, flyer). */
export interface CourseWithLabels {
  course: Course;
  certificationLabels: string[];
  jobCategoryLabels: string[];
}

@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/courses`;
  private readonly lookupUrl = `${environment.apiUrl}/lookups`;

  getAll(): Observable<Course[]> {
    return this.http.get<Course[]>(this.baseUrl);
  }

  query(query: CourseQuery): Observable<Course[]> {
    return this.http.post<Course[]>(`${this.baseUrl}/query`, query);
  }

  // pkid is numeric — no encodeURIComponent needed (unlike the string-PK AppRole service).
  getById(pkid: number): Observable<Course> {
    return this.http.get<Course>(`${this.baseUrl}/${pkid}`);
  }

  /**
   * Course + resolved N-N labels in one call — shared by the detail page and the flyer so the
   * forkJoin/resolve logic isn't duplicated. LookupItem.pkid is a string; the course carries
   * numeric pkids (frontend rule 16) — hence the Number() bridge.
   */
  getWithLabels(pkid: number): Observable<CourseWithLabels> {
    return forkJoin({
      course: this.getById(pkid),
      certifications: this.getCertificationOptions(),
      jobCategories: this.getJobCategoryOptions(),
    }).pipe(
      map(({ course, certifications, jobCategories }) => ({
        course,
        certificationLabels: resolveLabels(certifications, course.certificationPkids),
        jobCategoryLabels: resolveLabels(jobCategories, course.jobCategoryPkids),
      })),
    );
  }

  create(request: CourseRequest): Observable<Course> {
    return this.http.post<Course>(this.baseUrl, request);
  }

  update(request: CourseRequest): Observable<void> {
    return this.http.put<void>(this.baseUrl, request);
  }

  delete(pkid: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${pkid}`);
  }

  // --- Lookups used by the Course filter drawer and form -------------------

  /** 原廠 options (label = Partner.Name, ordered by DisplayOrder). */
  getPartnerOptions(): Observable<LookupItem[]> {
    return this.http.get<LookupItem[]>(`${this.lookupUrl}/partners`);
  }

  /** 課程群組 options (label = Description). */
  getCourseGroupOptions(): Observable<LookupItem[]> {
    return this.http.get<LookupItem[]>(`${this.lookupUrl}/course-groups`);
  }

  /** 上架狀態 options (label = Description). */
  getPublishStatusOptions(): Observable<LookupItem[]> {
    return this.http.get<LookupItem[]>(`${this.lookupUrl}/publish-statuses`);
  }

  /** 認證 options for the N-N picker (label = "Partner - Title"). */
  getCertificationOptions(): Observable<LookupItem[]> {
    return this.http.get<LookupItem[]>(`${this.lookupUrl}/certifications`);
  }

  /** 職務類別 options for the N-N picker (label = Description). */
  getJobCategoryOptions(): Observable<LookupItem[]> {
    return this.http.get<LookupItem[]>(`${this.lookupUrl}/job-categories`);
  }
}

function resolveLabels(options: LookupItem[], pkids: number[]): string[] {
  return options.filter((o) => pkids.includes(Number(o.pkid))).map((o) => o.label);
}
