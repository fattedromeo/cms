import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { RowAuditEntry } from '@core/models/row-audit.model';

@Injectable({ providedIn: 'root' })
export class RowAuditService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/rowaudit`;

  /**
   * One record's audit trail, newest first. `pkid` rides as a string because
   * RowAudit.PrimaryKeyValues is nvarchar; HttpParams handles the URL encoding.
   */
  getForRecord(tableName: string, pkid: number | string): Observable<RowAuditEntry[]> {
    const params = new HttpParams().set('tableName', tableName).set('pkid', String(pkid));
    return this.http.get<RowAuditEntry[]>(this.baseUrl, { params });
  }
}
