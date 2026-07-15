/** Slim Partner projection resolved by the API's JOIN (原廠). */
export interface CoursePartnerRef {
  pkid: number;
  name: string;
}

/** Slim CourseGroup projection resolved by the API's LEFT JOIN (課程群組). */
export interface CourseGroupRef {
  pkid: number;
  description: string;
}

/** Slim PublishStatus projection resolved by the API's JOIN (上架狀態). */
export interface CoursePublishStatusRef {
  pkid: number;
  description: string;
}

/** Response model for a Course (mirrors CMS.API.Models.Course). */
export interface Course {
  pkid: number;
  title: string;
  officialTitle: string | null;
  courseId: string;
  prodCourseId: string;
  friendlyUrl: string;
  displayOrder: number;
  partnerPkid: number;
  courseGroupPkid: number | null;
  publishStatusPkid: number;
  /** `yyyy-MM-dd` — DateOnly, no time part. Convert with fromIso/toIso, never `new Date(s)`. */
  scheduleOn: string;
  /** `yyyy-MM-dd` — DateOnly, no time part. */
  scheduleOff: string;
  hour: number;
  listPrice: number;
  learningCredit: number;
  material: string | null;
  objective: string | null;
  target: string | null;
  prerequisites: string | null;
  outline: string | null;
  towardCertOrExam: string | null;
  note: string | null;
  otherInfo: string | null;
  canRepeat: boolean;
  /** Resolved FK label. */
  partner: CoursePartnerRef | null;
  /** null when courseGroupPkid is null — the FK is nullable. */
  courseGroup: CourseGroupRef | null;
  publishStatus: CoursePublishStatusRef | null;
  /** N-N — populated by getById only, empty on list/query. */
  certificationPkids: number[];
  /** N-N — populated by getById only, empty on list/query. */
  jobCategoryPkids: number[];
}

/** Write DTO for create/update. `pkid` is an int IDENTITY (0 on create, immutable on edit). */
export interface CourseRequest {
  pkid: number;
  title: string;
  officialTitle: string | null;
  courseId: string;
  prodCourseId: string;
  friendlyUrl: string;
  displayOrder: number;
  partnerPkid: number;
  courseGroupPkid: number | null;
  publishStatusPkid: number;
  scheduleOn: string;
  scheduleOff: string;
  hour: number;
  listPrice: number;
  learningCredit: number;
  material: string | null;
  objective: string | null;
  target: string | null;
  prerequisites: string | null;
  outline: string | null;
  towardCertOrExam: string | null;
  note: string | null;
  otherInfo: string | null;
  canRepeat: boolean;
  certificationPkids: number[];
  jobCategoryPkids: number[];
}

/** Search DTO. */
export interface CourseQuery {
  keyword?: string | null;
  partnerPkid?: number | null;
  courseGroupPkid?: number | null;
  publishStatusPkid?: number | null;
  /** `yyyy-MM-dd`, inclusive. */
  scheduleOnFrom?: string | null;
  scheduleOnTo?: string | null;
  scheduleOffFrom?: string | null;
  scheduleOffTo?: string | null;
  /** Tri-state: null = no filter. */
  canRepeat?: boolean | null;
}
