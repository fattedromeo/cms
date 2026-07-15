import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { FeaturedPromoItemForm } from './featured-promo-item-form';
import {
  FeaturedPromoItem,
  FeaturedPromoItemRequest,
} from '@core/models/featured-promo-item.model';
import { LookupItem } from '@core/models/lookup-item.model';

describe('FeaturedPromoItemForm', () => {
  let fixture: ComponentFixture<FeaturedPromoItemForm>;
  let component: FeaturedPromoItemForm;

  // LookupItem.pkid is a STRING even though promotionPkid is a number — that gap is the point of
  // several tests below.
  const promoOptions: LookupItem[] = [
    { pkid: '1081', label: '220624_PowerPlatform' },
    { pkid: '2292', label: '240909_Pythonall' },
    { pkid: '3419', label: '(PMPE+PMPJ19)課程優惠' },
  ];

  const existing: FeaturedPromoItem = {
    pkid: 76884,
    scheduleOn: '2026-03-16',
    trainingCenterPkid: 1,
    slot: 1,
    promotionPkid: 1081,
    topic: '快速上手Power Platform',
    description: '參加Power Platform認證系列課程',
    promotion: { pkid: 1081, promoCode: '220624_PowerPlatform' },
  };

  /** Boot the panel with the given inputs. The template has no routerLink, so no Router is needed. */
  async function setup(inputs: Record<string, unknown>): Promise<void> {
    fixture = TestBed.createComponent(FeaturedPromoItemForm);
    fixture.componentRef.setInput('scheduleOn', '2026-03-16');
    fixture.componentRef.setInput('trainingCenterPkid', 1);
    fixture.componentRef.setInput('slot', 1);
    fixture.componentRef.setInput('promoOptions', promoOptions);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const form = () => (component as unknown as { form: FeaturedPromoItemForm['form'] }).form;
  const save = () => (component as unknown as { save: () => void }).save();
  const cancel = () => (component as unknown as { cancel: () => void }).cancel();
  const filterPromos = (query: string) =>
    (component as unknown as { filterPromos: (e: { query: string }) => void }).filterPromos({
      query,
    });
  const suggestions = () =>
    (component as unknown as { suggestions: () => LookupItem[] }).suggestions();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeaturedPromoItemForm],
      providers: [provideNoopAnimations()],
    }).compileComponents();
  });

  // --- Edit mode ------------------------------------------------------------

  describe('Edit (existing item)', () => {
    it('shows the existing values', async () => {
      await setup({ item: existing });

      expect(form().getRawValue().topic).toBe('快速上手Power Platform');
      expect(form().getRawValue().description).toBe('參加Power Platform認證系列課程');
    });

    it('resolves promotionPkid back to its lookup option so the code is visible', async () => {
      await setup({ item: existing });

      // The stored FK is a number; the option's pkid is a string. Without Number()-mapping the
      // lookup the type-ahead would render blank.
      expect(form().getRawValue().promotion).toEqual({
        pkid: '1081',
        label: '220624_PowerPlatform',
      });
    });

    it('emits an update request carrying the existing pkid', async () => {
      await setup({ item: existing });
      let emitted: FeaturedPromoItemRequest | undefined;
      component.saved.subscribe((r) => (emitted = r));

      save();

      expect(emitted).toEqual({
        pkid: 76884,
        scheduleOn: '2026-03-16',
        trainingCenterPkid: 1,
        slot: 1,
        promotionPkid: 1081, // a NUMBER, converted from the option's string pkid
        topic: '快速上手Power Platform',
        description: '參加Power Platform認證系列課程',
      });
    });

    it('emits promotionPkid as a number, not the string from the lookup', async () => {
      await setup({ item: existing });
      let emitted: FeaturedPromoItemRequest | undefined;
      component.saved.subscribe((r) => (emitted = r));

      save();

      expect(typeof emitted!.promotionPkid).toBe('number');
    });

    it('does not overwrite Topic/Description when a different promo is picked', async () => {
      // Confirmed against the dev data: Topic/Description are per-item free text (only ~6% of
      // 31,715 rows match their promo's Topic), so the lookup sets Promotion_pkid ONLY.
      await setup({ item: existing });

      form().patchValue({ promotion: promoOptions[1] }); // 240909_Pythonall

      expect(form().getRawValue().topic).toBe('快速上手Power Platform');
      expect(form().getRawValue().description).toBe('參加Power Platform認證系列課程');
    });

    it('emits the newly picked promo while keeping the typed Topic', async () => {
      await setup({ item: existing });
      let emitted: FeaturedPromoItemRequest | undefined;
      component.saved.subscribe((r) => (emitted = r));

      form().patchValue({ promotion: promoOptions[1], topic: '我自己的標題' });
      save();

      expect(emitted!.promotionPkid).toBe(2292);
      expect(emitted!.topic).toBe('我自己的標題');
    });
  });

  // --- New mode -------------------------------------------------------------

  describe('New (empty cell)', () => {
    it('opens blank', async () => {
      await setup({ item: null });

      expect(form().getRawValue()).toEqual({
        promotion: null,
        topic: '',
        description: '',
      });
    });

    it('is invalid until a promo, topic and description are supplied', async () => {
      await setup({ item: null });

      expect(form().invalid).toBeTrue();
    });

    it('does not emit while invalid', async () => {
      await setup({ item: null });
      const spy = jasmine.createSpy('saved');
      component.saved.subscribe(spy);

      save();

      expect(spy).not.toHaveBeenCalled();
    });

    it('marks controls touched on an invalid save so errors show', async () => {
      await setup({ item: null });

      save();

      expect(form().get('promotion')!.touched).toBeTrue();
      expect(form().get('topic')!.touched).toBeTrue();
    });

    it('emits a create request with pkid 0 and the cell it was opened on', async () => {
      await setup({ item: null, slot: 3 });
      let emitted: FeaturedPromoItemRequest | undefined;
      component.saved.subscribe((r) => (emitted = r));

      form().patchValue({
        promotion: promoOptions[0],
        topic: '新主題',
        description: '新說明',
      });
      save();

      expect(emitted).toEqual({
        pkid: 0, // 0 = create
        scheduleOn: '2026-03-16',
        trainingCenterPkid: 1,
        slot: 3,
        promotionPkid: 1081,
        topic: '新主題',
        description: '新說明',
      });
    });

    it('trims whitespace off Topic and Description', async () => {
      await setup({ item: null });
      let emitted: FeaturedPromoItemRequest | undefined;
      component.saved.subscribe((r) => (emitted = r));

      form().patchValue({
        promotion: promoOptions[0],
        topic: '  有空白  ',
        description: '  也有空白  ',
      });
      save();

      expect(emitted!.topic).toBe('有空白');
      expect(emitted!.description).toBe('也有空白');
    });

    it('rejects a Topic longer than the nvarchar(100) column', async () => {
      await setup({ item: null });

      form().patchValue({
        promotion: promoOptions[0],
        topic: 'x'.repeat(101),
        description: 'ok',
      });

      expect(form().get('topic')!.invalid).toBeTrue();
    });

    it('rejects a Description longer than the nvarchar(300) column', async () => {
      await setup({ item: null });

      form().patchValue({
        promotion: promoOptions[0],
        topic: 'ok',
        description: 'x'.repeat(301),
      });

      expect(form().get('description')!.invalid).toBeTrue();
    });

    it('accepts a Topic of exactly 100 characters', async () => {
      await setup({ item: null });

      form().patchValue({
        promotion: promoOptions[0],
        topic: 'x'.repeat(100),
        description: 'ok',
      });

      expect(form().get('topic')!.valid).toBeTrue();
    });
  });

  // --- Paste mode -----------------------------------------------------------

  describe('Paste (seeded from the clipboard)', () => {
    const seed = {
      promotionPkid: 2292,
      promoCode: '240909_Pythonall',
      topic: '複製來的主題',
      description: '複製來的說明',
    };

    it('pre-fills from the clipboard', async () => {
      await setup({ item: null, seed });

      expect(form().getRawValue().topic).toBe('複製來的主題');
      expect(form().getRawValue().description).toBe('複製來的說明');
      expect(form().getRawValue().promotion).toEqual(promoOptions[1]);
    });

    it('emits a CREATE (pkid 0) targeted at the pasted-into cell, not the copied one', async () => {
      await setup({ item: null, seed, slot: 2, scheduleOn: '2026-03-20' });
      let emitted: FeaturedPromoItemRequest | undefined;
      component.saved.subscribe((r) => (emitted = r));

      save();

      expect(emitted!.pkid).toBe(0);
      expect(emitted!.scheduleOn).toBe('2026-03-20');
      expect(emitted!.slot).toBe(2);
      expect(emitted!.promotionPkid).toBe(2292);
    });

    it('ignores the seed when an item is also supplied (Edit wins)', async () => {
      await setup({ item: existing, seed });

      expect(form().getRawValue().topic).toBe('快速上手Power Platform');
    });
  });

  // --- PromoCode type-ahead -------------------------------------------------

  describe('PromoCode lookup', () => {
    it('filters options by substring', async () => {
      await setup({ item: null });

      filterPromos('Python');

      expect(suggestions()).toEqual([promoOptions[1]]);
    });

    it('filters case-insensitively', async () => {
      await setup({ item: null });

      filterPromos('powerplatform');

      expect(suggestions()).toEqual([promoOptions[0]]);
    });

    it('matches mid-string, not just the prefix', async () => {
      await setup({ item: null });

      filterPromos('0624');

      expect(suggestions()).toEqual([promoOptions[0]]);
    });

    it('returns every option for an empty query', async () => {
      await setup({ item: null });

      filterPromos('');

      expect(suggestions().length).toBe(3);
    });

    it('returns nothing for an unmatched query', async () => {
      await setup({ item: null });

      filterPromos('does-not-exist');

      expect(suggestions()).toEqual([]);
    });

    it('handles a Chinese PromoCode', async () => {
      await setup({ item: null });

      filterPromos('課程優惠');

      expect(suggestions()).toEqual([promoOptions[2]]);
    });
  });

  // --- Cancel ---------------------------------------------------------------

  it('cancel emits without saving', async () => {
    await setup({ item: existing });
    const savedSpy = jasmine.createSpy('saved');
    const cancelledSpy = jasmine.createSpy('cancelled');
    component.saved.subscribe(savedSpy);
    component.cancelled.subscribe(cancelledSpy);

    cancel();

    expect(cancelledSpy).toHaveBeenCalled();
    expect(savedSpy).not.toHaveBeenCalled();
  });
});
