/**
 * One RowAudit row for a record's 異動紀錄 History (GET /api/rowaudit).
 *
 * ⚠️ `dateTime` is server-LOCAL time (the audit writer stamps `DateTime.Now`), unlike
 * `passwordUpdatedTime` (UTC). Do NOT apply the usual `+ 'Z'` datetime trick here — the bare
 * ISO string parses as local time, which is already correct; appending 'Z' would shift every
 * timestamp by the UTC offset.
 */
export interface RowAuditEntry {
  dateTime: string;
  userName: string;
  actionType: string;
  actionDesc: string | null;
}
