import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { CourseGroupService } from '@core/services/course-group.service';
import { CourseGroupRequest } from '@core/models/course-group.model';

@Component({
  selector: 'app-course-group-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    InputNumberModule,
    ButtonModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './course-group-form.html',
  styleUrl: './course-group-form.scss',
})
export class CourseGroupForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CourseGroupService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  protected readonly isEdit = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    // pkid is the smallint IDENTITY key — display-only, disabled in both modes.
    pkid: [{ value: null as number | null, disabled: true }],
    description: ['', [Validators.required, Validators.maxLength(100)]],
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.isEdit.set(!!idParam);

    if (idParam) {
      this.service.getById(Number(idParam)).subscribe({
        next: (group) => {
          this.form.patchValue({
            pkid: group.pkid,
            description: group.description,
          });
          this.loading.set(false);
        },
        error: () => {
          this.messages.add({ severity: 'error', summary: '載入失敗', detail: '無法取得資料。' });
          this.loading.set(false);
        },
      });
    } else {
      this.loading.set(false);
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messages.add({ severity: 'warn', summary: '請檢查欄位', detail: '尚有必填欄位未完成。' });
      return;
    }

    // getRawValue() — the disabled pkid control is excluded from .value.
    const raw = this.form.getRawValue();
    const request: CourseGroupRequest = {
      pkid: raw.pkid ?? 0,
      description: raw.description!.trim(),
    };

    this.saving.set(true);
    const op$: Observable<unknown> = this.isEdit()
      ? this.service.update(request)
      : this.service.create(request);
    op$.subscribe({
      next: (result) => {
        this.saving.set(false);
        // On create the new pkid comes back in the response; on edit reuse the form pkid.
        const pkid = this.isEdit() ? request.pkid : (result as { pkid: number }).pkid;
        this.router.navigate(['/course-groups', pkid]);
      },
      error: () => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: '儲存失敗', detail: '儲存失敗，請稍後再試。' });
      },
    });
  }

  cancel(): void {
    if (this.isEdit()) {
      this.router.navigate(['/course-groups', this.form.getRawValue().pkid]);
    } else {
      this.router.navigate(['/course-groups']);
    }
  }

  protected invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}
