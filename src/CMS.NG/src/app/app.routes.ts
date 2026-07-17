import { Routes } from '@angular/router';

import { adminGuard, authGuard, guestGuard } from '@core/guards/auth.guard';

export const routes: Routes = [
  {
    // The only public route. Everything below requires a token; the admin group also requires the
    // Admin role, mirroring [Authorize(Roles = "Admin")] on the matching API controllers. guestGuard
    // sends an already-signed-in user (e.g. a stale bookmark or the back button) to /courses instead
    // of rendering the login form stacked on top of the shell.
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('@features/login/login').then((m) => m.Login),
  },
  // 課程管理 Course is visible to every signed-in user, so it is the home for all roles. It must NOT
  // be an admin route: a non-Admin landing on one would be bounced straight back out by adminGuard.
  { path: '', pathMatch: 'full', redirectTo: 'courses' },
  {
    // 個人資料 My Profile — the signed-in user's own account. authGuard only: every role has one,
    // and the API scopes it to the token's user, so there is nothing here to gate by role.
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('@features/profile/profile').then((m) => m.Profile),
  },
  {
    path: 'app-roles',
    canActivate: [authGuard, adminGuard],
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
    canActivate: [authGuard],
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
    canActivate: [authGuard, adminGuard],
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
    canActivate: [authGuard],
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
        path: ':id/flyer',
        loadComponent: () =>
          import('@features/courses/course-flyer/course-flyer-page').then(
            (m) => m.CourseFlyerPage,
          ),
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
    canActivate: [authGuard],
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
    canActivate: [authGuard],
    loadComponent: () =>
      import(
        '@features/featured-promo-items/featured-promo-item-list/featured-promo-item-list'
      ).then((m) => m.FeaturedPromoItemList),
  },
  {
    path: 'publish-statuses',
    canActivate: [authGuard, adminGuard],
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
  { path: '**', redirectTo: 'courses' },
];
