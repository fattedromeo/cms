import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { CourseGroup, CourseGroupQuery, CourseGroupRequest } from '@core/models/course-group.model';
import { LookupItem } from '@core/models/lookup-item.model';

@Injectable({ providedIn: 'root' })
export class CourseGroupService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/course-groups`;
  private readonly lookupUrl = `${environment.apiUrl}/lookups`;

  getAll(): Observable<CourseGroup[]> {
    return this.http.get<CourseGroup[]>(this.baseUrl);
  }

  query(query: CourseGroupQuery): Observable<CourseGroup[]> {
    return this.http.post<CourseGroup[]>(`${this.baseUrl}/query`, query);
  }

  // pkid is numeric — no encodeURIComponent needed (unlike the string-PK AppRole service).
  getById(pkid: number): Observable<CourseGroup> {
    return this.http.get<CourseGroup>(`${this.baseUrl}/${pkid}`);
  }

  create(request: CourseGroupRequest): Observable<CourseGroup> {
    return this.http.post<CourseGroup>(this.baseUrl, request);
  }

  update(request: CourseGroupRequest): Observable<void> {
    return this.http.put<void>(this.baseUrl, request);
  }

  delete(pkid: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${pkid}`);
  }

  /** CourseGroup options for FK pickers in future consumers (Course, PartnerCourseGroup). */
  getCourseGroupOptions(): Observable<LookupItem[]> {
    return this.http.get<LookupItem[]>(`${this.lookupUrl}/course-groups`);
  }
}
