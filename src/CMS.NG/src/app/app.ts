import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

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
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly collapsed = signal(false);

  /**
   * Sidebar navigation. Only 系統管理 Admin / 角色 AppRole is wired to a route in this
   * first feature; the remaining groups mirror the target UI as placeholders.
   */
  protected readonly navGroups = signal<NavGroup[]>([
    { label: '首頁管理', labelEn: 'Home', icon: 'pi pi-home', children: [] },
    {
      label: '課程管理',
      labelEn: 'Course',
      icon: 'pi pi-folder',
      children: [
        { label: '合作廠商', labelEn: 'Partner', icon: 'pi pi-building', route: '/partners' },
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
      children: [
        { label: '角色', labelEn: 'AppRole', icon: 'pi pi-id-card', route: '/app-roles' },
        { label: '使用者', labelEn: 'AppUser', icon: 'pi pi-user', disabled: true },
        {
          label: '發布狀態',
          labelEn: 'PublishStatus',
          icon: 'pi pi-flag',
          route: '/publish-statuses',
        },
      ],
    },
  ]);

  toggleCollapsed(): void {
    this.collapsed.update((c) => !c);
  }

  toggleGroup(group: NavGroup): void {
    if (this.collapsed()) return;
    group.expanded = !group.expanded;
    this.navGroups.update((g) => [...g]);
  }
}
