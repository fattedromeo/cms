/** Response model for an AppRole (mirrors CMS.API.Models.AppRole). */
export interface AppRole {
  pkid: number;
  roleId: string;
  roleName: string;
  permissionLevel: number;
  description: string | null;
  userCount: number;
  userIds: string[];
}

/** Write DTO for create/update. */
export interface AppRoleRequest {
  pkid: number;
  roleId: string;
  roleName: string;
  permissionLevel: number;
  description: string | null;
  userIds: string[];
}

/** Search DTO. */
export interface AppRoleQuery {
  keyword?: string | null;
  permissionLevel?: number | null;
}
