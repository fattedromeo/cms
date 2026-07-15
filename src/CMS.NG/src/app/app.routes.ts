import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app-roles' },
  {
    path: 'app-roles',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('@features/app-roles/app-role-list/app-role-list').then((m) => m.AppRoleList),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('@features/app-roles/app-role-form/app-role-form').then((m) => m.AppRoleForm),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('@features/app-roles/app-role-detail/app-role-detail').then(
            (m) => m.AppRoleDetail,
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('@features/app-roles/app-role-form/app-role-form').then((m) => m.AppRoleForm),
      },
    ],
  },
  {
    path: 'partners',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('@features/partners/partner-list/partner-list').then((m) => m.PartnerList),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('@features/partners/partner-form/partner-form').then((m) => m.PartnerForm),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('@features/partners/partner-detail/partner-detail').then((m) => m.PartnerDetail),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('@features/partners/partner-form/partner-form').then((m) => m.PartnerForm),
      },
    ],
  },
  {
    path: 'app-users',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('@features/app-users/app-user-list/app-user-list').then((m) => m.AppUserList),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('@features/app-users/app-user-form/app-user-form').then((m) => m.AppUserForm),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('@features/app-users/app-user-detail/app-user-detail').then(
            (m) => m.AppUserDetail,
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('@features/app-users/app-user-form/app-user-form').then((m) => m.AppUserForm),
      },
    ],
  },
  {
    path: 'courses',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('@features/courses/course-list/course-list').then((m) => m.CourseList),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('@features/courses/course-form/course-form').then((m) => m.CourseForm),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('@features/courses/course-detail/course-detail').then((m) => m.CourseDetail),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('@features/courses/course-form/course-form').then((m) => m.CourseForm),
      },
    ],
  },
  {
    path: 'course-groups',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('@features/course-groups/course-group-list/course-group-list').then(
            (m) => m.CourseGroupList,
          ),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('@features/course-groups/course-group-form/course-group-form').then(
            (m) => m.CourseGroupForm,
          ),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('@features/course-groups/course-group-detail/course-group-detail').then(
            (m) => m.CourseGroupDetail,
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('@features/course-groups/course-group-form/course-group-form').then(
            (m) => m.CourseGroupForm,
          ),
      },
    ],
  },
  {
    // 上稿作業 — a single week-grid page, so no 'new' / ':id' children: the grid is the detail
    // view and the Edit panel opens inline. See spec/custom/FeaturedPromoItem/FeaturedPromoItem.md.
    path: 'featured-promo-items',
    loadComponent: () =>
      import(
        '@features/featured-promo-items/featured-promo-item-list/featured-promo-item-list'
      ).then((m) => m.FeaturedPromoItemList),
  },
  {
    path: 'publish-statuses',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('@features/publish-statuses/publish-status-list/publish-status-list').then(
            (m) => m.PublishStatusList,
          ),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('@features/publish-statuses/publish-status-form/publish-status-form').then(
            (m) => m.PublishStatusForm,
          ),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('@features/publish-statuses/publish-status-detail/publish-status-detail').then(
            (m) => m.PublishStatusDetail,
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('@features/publish-statuses/publish-status-form/publish-status-form').then(
            (m) => m.PublishStatusForm,
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'app-roles' },
];
