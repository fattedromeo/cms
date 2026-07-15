import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { AppUser, AppUserQuery, AppUserRequest } from '@core/models/app-user.model';
import { LookupItem } from '@core/models/lookup-item.model';

@Injectable({ providedIn: 'root' })
export class AppUserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/app-users`;
  private readonly lookupUrl = `${environment.apiUrl}/lookups`;

  getAll(): Observable<AppUser[]> {
    return this.http.get<AppUser[]>(this.baseUrl);
  }

  query(query: AppUserQuery): Observable<AppUser[]> {
    return this.http.post<AppUser[]>(`${this.baseUrl}/query`, query);
  }

  // UserId is a string PK and in practice an email (miles@uuu.com.tw), so encodeURIComponent
  // is mandatory, not cosmetic — an unencoded '@' would break the route.
  getById(userId: string): Observable<AppUser> {
    return this.http.get<AppUser>(`${this.baseUrl}/${encodeURIComponent(userId)}`);
  }

  create(request: AppUserRequest): Observable<AppUser> {
    return this.http.post<AppUser>(this.baseUrl, request);
  }

  update(request: AppUserRequest): Observable<void> {
    return this.http.put<void>(this.baseUrl, request);
  }

  delete(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${encodeURIComponent(userId)}`);
  }

  /** AppRole options for the roles multiselect. `pkid` carries RoleId (a string). */
  getRoleOptions(): Observable<LookupItem[]> {
    return this.http.get<LookupItem[]>(`${this.lookupUrl}/app-roles`);
  }
}
