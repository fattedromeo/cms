import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

import { AppUserService } from '@core/services/app-user.service';
import { AppUser } from '@core/models/app-user.model';

@Component({
  selector: 'app-app-user-detail',
  imports: [CommonModule, ButtonModule, TagModule],
  templateUrl: './app-user-detail.html',
  styleUrl: './app-user-detail.scss',
})
export class AppUserDetail implements OnInit {
  private readonly service = inject(AppUserService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly user = signal<AppUser | null>(null);
  protected readonly roleLabels = signal<string[]>([]);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);

  ngOnInit(): void {
    const userId = this.route.snapshot.paramMap.get('id')!;
    forkJoin({
      user: this.service.getById(userId),
      roles: this.service.getRoleOptions(),
    }).subscribe({
      next: ({ user, roles }) => {
        this.user.set(user);
        // LookupItem.pkid carries RoleId (a string) — matches user.roleIds directly.
        const map = new Map(roles.map((r) => [r.pkid, r.label]));
        this.roleLabels.set(user.roleIds.map((id) => map.get(id) ?? id));
        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }

  edit(): void {
    const u = this.user();
    if (u) this.router.navigate(['/app-users', u.userId, 'edit']);
  }

  back(): void {
    this.router.navigate(['/app-users']);
  }
}
