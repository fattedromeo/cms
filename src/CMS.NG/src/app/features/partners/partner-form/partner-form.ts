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

import { PartnerService } from '@core/services/partner.service';
import { PartnerRequest } from '@core/models/partner.model';

@Component({
  selector: 'app-partner-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    InputNumberModule,
    ButtonModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './partner-form.html',
  styleUrl: './partner-form.scss',
})
export class PartnerForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(PartnerService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  protected readonly isEdit = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    // pkid is the smallint IDENTITY key — display-only, disabled in both modes.
    pkid: [{ value: null as number | null, disabled: true }],
    name: ['', [Validators.required, Validators.maxLength(50)]],
    appKey: ['', [Validators.required, Validators.maxLength(10)]],
    nameOnPartnerMenu: ['', [Validators.required, Validators.maxLength(200)]],
    nameOnCourseDetailPage: ['', [Validators.required, Validators.maxLength(50)]],
    displayOrder: [0, [Validators.required]],
    imageFilename: ['' as string | null, [Validators.maxLength(50)]],
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.isEdit.set(!!idParam);

    if (idParam) {
      this.service.getById(Number(idParam)).subscribe({
        next: (partner) => {
          this.form.patchValue({
            pkid: partner.pkid,
            name: partner.name,
            appKey: partner.appKey,
            nameOnPartnerMenu: partner.nameOnPartnerMenu,
            nameOnCourseDetailPage: partner.nameOnCourseDetailPage,
            displayOrder: partner.displayOrder,
            imageFilename: partner.imageFilename,
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

    const raw = this.form.getRawValue();
    const filename = raw.imageFilename?.trim();
    const request: PartnerRequest = {
      pkid: raw.pkid ?? 0,
      name: raw.name!.trim(),
      appKey: raw.appKey!.trim(),
      nameOnPartnerMenu: raw.nameOnPartnerMenu!.trim(),
      nameOnCourseDetailPage: raw.nameOnCourseDetailPage!.trim(),
      displayOrder: raw.displayOrder ?? 0,
      imageFilename: filename ? filename : null,
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
        this.router.navigate(['/partners', pkid]);
      },
      error: () => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: '儲存失敗', detail: '儲存失敗，請稍後再試。' });
      },
    });
  }

  cancel(): void {
    if (this.isEdit()) {
      this.router.navigate(['/partners', this.form.getRawValue().pkid]);
    } else {
      this.router.navigate(['/partners']);
    }
  }

  protected invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}
