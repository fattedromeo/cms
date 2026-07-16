# CMS Database ERD

Generated from the schema scripts in this folder (`admin.sql`, `auth.sql`, `course.sql`,
`promotion.sql`). The `database/*.sql` files are the source of truth — regenerate this diagram when
they change.

Notes on notation:

- Solid lines are declared FK constraints; **dashed lines are logical references with no FK
  constraint** in the schema (`Seminar.Partner_pkid`, `CourseRecomm.CourseId/RecommCourseId`).
- Relationship labels call out `ON DELETE CASCADE` where declared — deleting the parent silently
  deletes those children (no 547 error).
- `AppRole`, `AppUser` and `AppUserRole` have an `IDENTITY` `pkid` column that is **not** the
  primary key; the business key (`RoleId`, `UserId`) is the PK.
- Shared tables (`Partner`, `PartnerCourseGroup`, `PublishStatus`, `TrainingCenter`) appear in more
  than one `.sql` file; they are drawn in full once and abbreviated elsewhere.
- `decimal` column precision omitted: `ListPrice` is `decimal(9,0)`, `LearningCredit` is
  `decimal(9,1)`.

## Auth / Admin (`auth.sql`, `admin.sql`)

`auth.sql` is a subset of `admin.sql` (it lacks `PublishStatus` and `RowAudit`). `SysConfig` and
`RowAudit` have no relationships.

```mermaid
erDiagram
    AppUser ||--o{ AppUserRole : "has"
    AppRole ||--o{ AppUserRole : "grants"

    AppUser {
        int pkid "IDENTITY, not the PK"
        nvarchar(200) UserId PK
        nvarchar(200) UserName
        bit IsActive "default 1"
        nvarchar(800) PasswordHash "secret - no DTO property"
        datetime PasswordUpdatedTime "NULL"
    }
    AppRole {
        int pkid "IDENTITY, not the PK"
        nvarchar(200) RoleId PK
        nvarchar(200) RoleName
        int PermissionLevel "default 100"
        nvarchar(400) Description "NULL"
    }
    AppUserRole {
        int pkid "IDENTITY, not the PK"
        nvarchar(200) UserId PK, FK
        nvarchar(200) RoleId PK, FK
    }
    SysConfig {
        nvarchar(200) configKey PK
        nvarchar(4000) configValue "holds JWT signing key - never expose"
    }
    RowAudit {
        int pkid PK
        varchar(50) TableName
        nvarchar(100) UserName
        nvarchar(100) PrimaryKeyValues
        varchar(20) ActionType
        varchar(1000) ActionDesc "NULL"
        datetime DateTime
    }
```

## Course (`course.sql`)

```mermaid
erDiagram
    Partner ||--o{ Course : "offers"
    CourseGroup |o--o{ Course : "groups (FK NULL, ON DELETE CASCADE)"
    PublishStatus ||--o{ Course : "status of"
    Course ||--o{ CourseFAQ : "has"
    Course ||--o{ HotCourse : "featured as"
    Course ||--o{ CourseRelatedLink : "links to"
    LinkDefinition ||--o{ CourseRelatedLink : "defines"
    Course ||--o{ CourseInCertification : "counts toward (ON UPDATE/DELETE CASCADE)"
    Certification ||--o{ CourseInCertification : "includes"
    Course ||--o{ CourseJobCategories : "tagged (ON UPDATE/DELETE CASCADE)"
    JobCategory ||--o{ CourseJobCategories : "tags"
    Certification ||--o{ CertificationJobCategories : "tagged (ON DELETE CASCADE)"
    JobCategory ||--o{ CertificationJobCategories : "tags"
    Partner ||--o{ Certification : "certifies"
    Partner ||--o{ PartnerCourseGroup : "curates"
    CourseGroup ||--o{ PartnerCourseGroup : "curated as"
    Course |o..o{ CourseRecomm : "CourseId (no FK, varchar key)"
    Course |o..o{ CourseRecomm : "RecommCourseId (no FK, varchar key)"

    Course {
        int pkid PK
        nvarchar(200) Title
        nvarchar(300) OfficialTitle "NULL"
        varchar(50) CourseId "business key - not unique-constrained"
        varchar(50) ProdCourseId
        nvarchar(100) FriendlyUrl
        int DisplayOrder
        smallint Partner_pkid FK
        smallint CourseGroup_pkid FK "NULL"
        tinyint PublishStatus_pkid FK
        date ScheduleOn
        date ScheduleOff
        smallint Hour "default 0"
        decimal ListPrice "default 0"
        decimal LearningCredit "default 0"
        nvarchar(500) Material "NULL"
        nvarchar(4000) Objective "NULL"
        nvarchar(500) Target "NULL"
        nvarchar(4000) Prerequisites "NULL"
        nvarchar(max) Outline "NULL"
        nvarchar(max) TowardCertOrExam "NULL"
        nvarchar(4000) Note "NULL"
        nvarchar(4000) OtherInfo "NULL"
        bit CanRepeat "default 0"
    }
    CourseGroup {
        smallint pkid PK
        nvarchar(100) Description
    }
    Partner {
        smallint pkid PK
        nvarchar(50) Name
        varchar(10) AppKey
        nvarchar(200) NameOnPartnerMenu
        nvarchar(50) NameOnCourseDetailPage
        int DisplayOrder
        varchar(50) ImageFilename "NULL"
    }
    PublishStatus {
        tinyint pkid PK "not IDENTITY"
        nvarchar(50) Description
        bit IsDraft
        bit IsPublished
        bit IsDiscontinued
    }
    CourseFAQ {
        int pkid PK
        int Course_pkid FK
        nvarchar(200) Question "NULL"
        nvarchar(2000) Answer
        int DisplayOrder
    }
    Certification {
        int pkid PK
        smallint Partner_pkid FK
        nchar(100) Title "NULL"
    }
    CourseInCertification {
        int Course_pkid PK, FK
        int Certification_pkid PK, FK
    }
    JobCategory {
        smallint pkid PK
        nvarchar(70) Description
    }
    CourseJobCategories {
        int Course_pkid PK, FK
        smallint JobCategory_pkid PK, FK
    }
    CertificationJobCategories {
        int Certification_pkid PK, FK
        smallint JobCategory_pkid PK, FK
    }
    CourseRecomm {
        varchar(50) CourseId PK "no FK to Course"
        varchar(50) RecommCourseId PK "no FK to Course"
        int CourseOrder
    }
    CourseRelatedLink {
        int pkid PK
        int Course_pkid FK
        int DisplayOrder
        int LinkDefinition_pkid FK
    }
    LinkDefinition {
        int pkid PK
        nvarchar(50) Name
        nvarchar(500) LinkURL
        nvarchar(100) Text
        nvarchar(500) Tooltip "NULL"
        varchar(20) Target "NULL"
        varchar(50) ClassName "NULL"
        nvarchar(50) Alt "NULL"
    }
    HotCourse {
        int pkid PK
        int DisplayOrder
        int Course_pkid FK
        bit Enable "default 1"
    }
    PartnerCourseGroup {
        int pkid PK
        smallint Partner_pkid FK
        smallint CourseGroup_pkid FK
        int DisplayOrder
        nvarchar(100) Description
    }
```

## Promotion (`promotion.sql`)

`Partner`, `PartnerCourseGroup`, `PublishStatus` and `CourseGroup` are the same tables as in the
Course diagram — abbreviated here. `TrainingCenter` (also declared in `course.sql`, unreferenced
there) is drawn in full since this is where it participates in a relationship.

```mermaid
erDiagram
    PublishStatus ||--o{ Promotion2 : "status of"
    Partner |o--o{ Promotion2 : "related (FK NULL)"
    PartnerCourseGroup |o--o{ Promotion2 : "related (FK NULL)"
    Seminar |o--o{ Promotion2 : "promotes (FK NULL)"
    Promotion2 ||--o{ FeaturedPromoItem : "featured as"
    TrainingCenter ||--o{ FeaturedPromoItem : "hosts"
    Partner |o..o{ Seminar : "Partner_pkid (NULL, no FK constraint)"

    Promotion2 {
        int pkid PK
        tinyint PublishStatus_pkid FK
        uniqueidentifier ObjectId
        nvarchar(30) PromoCode UK
        nvarchar(100) Topic
        nvarchar(300) Description
        int DisplayOrder
        date ScheduleOn
        date ScheduleOff
        nvarchar(100) EdmTopic "NULL"
        nvarchar(50) Image_200x100 "NULL"
        nvarchar(50) Image_266x160 "NULL"
        nvarchar(30) Flash_200x100 "NULL"
        nvarchar(30) Flash_266x160 "NULL"
        smallint RelatedPartner_pkid FK "NULL"
        int RelatedPartnerCourseGroup_pkid FK "NULL"
        int Seminar_pkid FK "NULL"
    }
    FeaturedPromoItem {
        int pkid PK
        date ScheduleOn UK "unique with TrainingCenter+Slot"
        smallint TrainingCenter_pkid UK, FK
        tinyint Slot UK
        int Promotion_pkid FK
        nvarchar(100) Topic
        nvarchar(300) Description
    }
    Seminar {
        int pkid PK
        nvarchar(200) Title
        smallint Partner_pkid "NULL, no FK constraint"
        nvarchar(3000) Description
        nvarchar(50) attr_id "NULL"
    }
    TrainingCenter {
        smallint pkid PK
        nvarchar(10) Name
        varchar(3) AppKey
        int DisplayOrder
        nvarchar(30) City
        nvarchar(200) Address
        nvarchar(30) PhoneNumber
        nvarchar(30) FaxNumber
        nvarchar(2000) Transportation
        nvarchar(50) MapImageFilename
        nvarchar(100) CourseRegistrationEmail
        nvarchar(100) SeminarRegistrationEmail
        nvarchar(100) ServiceEmail
        bit IsDefault
        nvarchar(200) TestCenterAddress
        nvarchar(30) TestCenterPhone
        nvarchar(30) TestCenterFax
        varchar(20) PrometricCode
        varchar(20) VueCode
        nvarchar(30) CorporateSalesPhone
        nvarchar(30) SkillTrainingFax
        nvarchar(30) MarketingPhone
        nvarchar(100) SalesEmail
        varchar(100) RetainEmailAddress
        varchar(30) CustomerServiceExt
    }
    Partner {
        smallint pkid PK
        nvarchar(50) Name "full definition in Course diagram"
    }
    PartnerCourseGroup {
        int pkid PK
        smallint Partner_pkid FK
        smallint CourseGroup_pkid FK "full definition in Course diagram"
    }
    PublishStatus {
        tinyint pkid PK "full definition in Course diagram"
        nvarchar(50) Description
    }
```

## Cascade summary (affects DELETE confirm text — see CLAUDE.md rule 6)

| Parent | Child | Behavior |
|--------|-------|----------|
| CourseGroup | Course | **ON DELETE CASCADE** — deleting a group silently deletes its courses |
| Course | CourseInCertification | ON UPDATE + ON DELETE CASCADE |
| Course | CourseJobCategories | ON UPDATE + ON DELETE CASCADE |
| Certification | CertificationJobCategories | ON DELETE CASCADE |
| all other FKs | — | NO ACTION — parent DELETE raises error 547 while children exist |
