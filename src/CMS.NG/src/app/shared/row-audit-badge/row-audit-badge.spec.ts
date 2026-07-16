import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { RowAuditBadge } from './row-audit-badge';
import { RowAuditEntry } from '@core/models/row-audit.model';
import { environment } from '@env/environment';

const trail: RowAuditEntry[] = [
  // Newest first — as the API returns it.
  { dateTime: '2026-06-04T14:30:00', userName: 'alice', actionType: 'Update', actionDesc: 'Title, DisplayOrder' },
  { dateTime: '2026-05-01T09:00:00', userName: 'bob', actionType: 'Insert', actionDesc: 'AZ-900' },
];

describe('RowAuditBadge', () => {
  let fixture: ComponentFixture<RowAuditBadge>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RowAuditBadge],
      providers: [provideNoopAnimations(), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RowAuditBadge);
  });

  afterEach(() => httpMock.verify());

  function init(pkid: number | string | null): void {
    fixture.componentRef.setInput('tableName', 'Course');
    fixture.componentRef.setInput('pkid', pkid);
    fixture.detectChanges();
  }

  function flushTrail(rows: RowAuditEntry[]): void {
    const req = httpMock.expectOne(
      (r) =>
        r.url === `${environment.apiUrl}/rowaudit` &&
        r.params.get('tableName') === 'Course' &&
        r.params.get('pkid') === '123',
    );
    expect(req.request.method).toBe('GET');
    req.flush(rows);
    fixture.detectChanges();
  }

  it('fetches the history and shows the latest record inline on the badge', () => {
    init(123);
    flushTrail(trail);

    const badge = (fixture.nativeElement as HTMLElement).querySelector('.row-audit-badge')!;
    // Latest = first row (newest first); local-time render, no 'Z' shift.
    expect(badge.textContent).toContain('異動紀錄 History');
    expect(badge.textContent).toContain('Update by alice · 2026-06-04 14:30');
  });

  it('opens the dialog with the full trail, newest first', () => {
    init(123);
    flushTrail(trail);

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.row-audit-badge')!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance['dialogVisible']()).toBeTrue();
    // The dialog may render appended elsewhere — assert on the whole document.
    const rows = Array.from(document.querySelectorAll('.row-audit-trail tbody tr'));
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('alice');
    expect(rows[0].textContent).toContain('Update');
    expect(rows[0].textContent).toContain('Title, DisplayOrder');
    expect(rows[1].textContent).toContain('bob');
    expect(rows[1].textContent).toContain('Insert');
  });

  it('shows the neutral empty state inline and in the dialog when there is no history', () => {
    init(123);
    flushTrail([]);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.row-audit-badge')!.textContent).toContain('尚無紀錄 No history');

    el.querySelector<HTMLButtonElement>('.row-audit-badge')!.click();
    fixture.detectChanges();
    expect(document.body.textContent).toContain('No history yet');
  });

  it('does not call the API on a create form (null pkid) and shows the empty state', () => {
    init(null);

    // afterEach's httpMock.verify() asserts no request was made.
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.row-audit-badge')!.textContent).toContain('尚無紀錄 No history');
  });
});
