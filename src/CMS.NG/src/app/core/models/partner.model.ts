/** Response model for a Partner (mirrors CMS.API.Models.Partner). */
export interface Partner {
  pkid: number;
  name: string;
  appKey: string;
  nameOnPartnerMenu: string;
  nameOnCourseDetailPage: string;
  displayOrder: number;
  imageFilename: string | null;
}

/** Write DTO for create/update. `pkid` is a smallint IDENTITY (0 on create, immutable on edit). */
export interface PartnerRequest {
  pkid: number;
  name: string;
  appKey: string;
  nameOnPartnerMenu: string;
  nameOnCourseDetailPage: string;
  displayOrder: number;
  imageFilename: string | null;
}

/** Search DTO. */
export interface PartnerQuery {
  keyword?: string | null;
}
