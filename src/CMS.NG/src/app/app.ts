import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { ADMIN_ROLE } from '@core/models/auth.model';
import { AuthService } from '@core/services/auth.service';

interface NavChild {
  label: string;
  labelEn: string;
  icon: string;
  route?: string;
  disabled?: boolean;
}

interface NavGroup {
  label: string;
  labelEn: string;
  icon: string;
  children: NavChild[];
  expanded?: boolean;
  /** RoleId required to see this group at all. Undefined = visible to every signed-in user. */
  requiresRole?: string;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  // Regression: FINDING-001 — the sidebar rendered at its full 250px desktop width on mobile
  // viewports with no responsive behavior, squeezing the data table into an unusable ~130px
  // sliver. Default to the already-built collapsed (icon-rail) mode below 768px instead of
  // building new mobile UI. Found by /design-review on 2026-07-17.
  protected readonly collapsed = signal(
    typeof window !== 'undefined' && window.innerWidth < 768,
  );

  /** Drives whether the shell renders at all — the login page must appear on its own. */
  protected readonly isAuthenticated = this.auth.isAuthenticated;
  protected readonly userName = this.auth.userName;

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  /**
   * Sidebar navigation. Only 系統管理 Admin / 角色 AppRole is wired to a route in this
   * first feature; the remaining groups mirror the target UI as placeholders.
   */
  protected readonly navGroups = signal<NavGroup[]>([
    {
      label: '首頁管理',
      labelEn: 'Home',
      icon: 'pi pi-home',
      children: [
        {
          label: '上稿作業',
          labelEn: 'FeaturedPromoItem',
          icon: 'pi pi-calendar',
          route: '/featured-promo-items',
        },
      ],
    },
    {
      label: '課程管理',
      labelEn: 'Course',
      icon: 'pi pi-folder',
      // Expanded by default now that /courses is the landing route for every role. Previously only
      // 系統管理 was, which since it is hidden from non-Admins would leave them staring at a fully
      // collapsed menu on the page they just landed on.
      expanded: true,
      children: [
        { label: '課程', labelEn: 'Course', icon: 'pi pi-book', route: '/courses' },
        { label: '合作廠商', labelEn: 'Partner', icon: 'pi pi-building', route: '/partners' },
        { label: '課程群組', labelEn: 'CourseGroup', icon: 'pi pi-tags', route: '/course-groups' },
      ],
    },
    { label: '說明會', labelEn: 'Seminar', icon: 'pi pi-comments', children: [] },
    { label: '活動管理', labelEn: 'Promotion', icon: 'pi pi-megaphone', children: [] },
    { label: '線上報名', labelEn: 'Forms', icon: 'pi pi-pencil', children: [] },
    { label: '網站資訊', labelEn: 'WebInfo', icon: 'pi pi-globe', children: [] },
    { label: '考試中心', labelEn: 'TestingCenter', icon: 'pi pi-verified', children: [] },
    {
      label: '系統管理',
      labelEn: 'Admin',
      icon: 'pi pi-shield',
      expanded: true,
      // Hidden for non-Admins. Presentation only: the boundary is [Authorize(Roles = "Admin")] on
      // the matching API controllers, with adminGuard keeping the routes consistent with it.
      requiresRole: ADMIN_ROLE,
      children: [
        { label: '角色', labelEn: 'AppRole', icon: 'pi pi-id-card', route: '/app-roles' },
        { label: '使用者', labelEn: 'AppUser', icon: 'pi pi-user', route: '/app-users' },
        {
          label: '發布狀態',
          labelEn: 'PublishStatus',
          icon: 'pi pi-flag',
          route: '/publish-statuses',
        },
      ],
    },
  ]);

  /** What the sidebar actually renders: groups the signed-in user's roles allow. */
  protected readonly visibleNavGroups = computed(() =>
    this.navGroups().filter((g) => !g.requiresRole || this.auth.hasRole(g.requiresRole)),
  );

  toggleCollapsed(): void {
    this.collapsed.update((c) => !c);
  }

  toggleGroup(group: NavGroup): void {
    if (this.collapsed()) return;
    group.expanded = !group.expanded;
    this.navGroups.update((g) => [...g]);
  }
}
