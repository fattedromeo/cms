import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

import { AppRoleService } from '@core/services/app-role.service';
import { AppRole } from '@core/models/app-role.model';
import { RowAuditBadge } from '@app/shared/row-audit-badge/row-audit-badge';

@Component({
  selector: 'app-app-role-detail',
  imports: [CommonModule, ButtonModule, TagModule, RowAuditBadge],
  templateUrl: './app-role-detail.html',
  styleUrl: './app-role-detail.scss',
})
export class AppRoleDetail implements OnInit {
  private readonly service = inject(AppRoleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly role = signal<AppRole | null>(null);
  protected readonly userLabels = signal<string[]>([]);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);

  ngOnInit(): void {
    const roleId = this.route.snapshot.paramMap.get('id')!;
    forkJoin({
      role: this.service.getById(roleId),
      users: this.service.getUserOptions(),
    }).subscribe({
      next: ({ role, users }) => {
        this.role.set(role);
        const map = new Map(users.map((u) => [u.pkid, u.label]));
        this.userLabels.set(role.userIds.map((id) => map.get(id) ?? id));
        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }

  edit(): void {
    const r = this.role();
    if (r) this.router.navigate(['/app-roles', r.roleId, 'edit']);
  }

  back(): void {
    this.router.navigate(['/app-roles']);
  }
}
