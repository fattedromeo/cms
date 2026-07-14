/** Response model for a CourseGroup (mirrors CMS.API.Models.CourseGroup). */
export interface CourseGroup {
  pkid: number;
  description: string;
}

/** Write DTO for create/update. `pkid` is a smallint IDENTITY (0 on create, immutable on edit). */
export interface CourseGroupRequest {
  pkid: number;
  description: string;
}

/** Search DTO. */
export interface CourseGroupQuery {
  keyword?: string | null;
}
