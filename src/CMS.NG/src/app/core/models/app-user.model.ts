/**
 * Response model for an AppUser (mirrors CMS.API.Models.AppUser).
 *
 * There is deliberately **no `passwordHash`** here, and there must not be: the API never sends it
 * and never accepts it. The password is set server-side from the configured default on create, and
 * is untouched by update.
 */
export interface AppUser {
  /** Surrogate IDENTITY column, display only (主代碼). `userId` is the real key. */
  pkid: number;
  userId: string;
  userName: string;
  isActive: boolean;
  /**
   * SQL `datetime`, so it arrives with no timezone suffix (Kind = Unspecified).
   * Append 'Z' before parsing/formatting: `{{ u.passwordUpdatedTime + 'Z' | date:'...' }}`.
   * `null` = the account is still on the default password.
   */
  passwordUpdatedTime: string | null;
  roleCount: number;
  /** N-N — populated by getById only, empty on list/query. */
  roleIds: string[];
}

/** Write DTO for create/update. No `passwordHash` — the API would ignore it anyway. */
export interface AppUserRequest {
  pkid: number;
  userId: string;
  userName: string;
  isActive: boolean;
  roleIds: string[];
}

/** Search DTO. */
export interface AppUserQuery {
  keyword?: string | null;
  /** Tri-state: null = no filter. */
  isActive?: boolean | null;
  /** N-N filter: users holding this role. */
  roleId?: string | null;
}
