/** Body of POST /api/auth/login. */
export interface LoginRequest {
  userId: string;
  password: string;
}

/**
 * The signed-in user, as returned by POST /api/auth/login and stored in SESSION storage.
 *
 * `userId` is the **stored** casing from AppUser, which may differ from what was typed — the
 * backend matches case-insensitively (Chinese_Taiwan_Stroke_CI_AS). See spec/auth/Login.md.
 *
 * There is deliberately no roles property: roles are claims inside `accessToken`, and duplicating
 * them here would let the two disagree. `AuthService.roles` reads them from the token.
 */
export interface UserProfile {
  userId: string;
  userName: string;
  accessToken: string;
}

/**
 * Body of PUT /api/auth/profile.
 *
 * There is no userId: the API takes the account from the JWT and has no property to bind one to.
 * Sending one would be silently ignored — so don't imply otherwise by adding it here.
 */
export interface UpdateProfileRequest {
  userName: string;
}

/** Reply from PUT /api/auth/profile. `userName` is the value as STORED (trimmed). */
export interface ProfileResponse {
  userId: string;
  userName: string;
}

/**
 * Body of POST /api/auth/change-password.
 *
 * 🔐 Plaintext, unavoidably — the server hashes them to compare. No hash is ever sent or received;
 * the reply is a bare 204. Never log or persist this object. As with the other auth DTOs there is no
 * userId: the account comes from the JWT.
 */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

/** RoleId that gates 系統管理 Admin. Must match the API's `AdminRole.Name` — matching is case-sensitive. */
export const ADMIN_ROLE = 'Admin';
