import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';

import { FeaturedPromoItemList } from './featured-promo-item-list';
import { FeaturedPromoItemService } from '@core/services/featured-promo-item.service';
import { FeaturedPromoItem } from '@core/models/featured-promo-item.model';
import { toIso } from '@core/utils/date.util';

describe('FeaturedPromoItemList', () => {
  let fixture: ComponentFixture<FeaturedPromoItemList>;
  let component: FeaturedPromoItemList;
  let service: jasmine.SpyObj<FeaturedPromoItemService>;

  // The real dev-DB tabs: pkids are NOT contiguous (1, 2, 3, 5, 54), ordered by DisplayOrder.
  const centers = [
    { pkid: '1', label: '台北' },
    { pkid: '2', label: '新竹' },
    { pkid: '3', label: '台中' },
    { pkid: '5', label: '高雄' },
    { pkid: '54', label: '線上研討會' },
  ];

  const promos = [
    { pkid: '1081', label: '220624_PowerPlatform' },
    { pkid: '2292', label: '240909_Pythonall' },
  ];

  const itemAt = (slot: number, iso = '2026-03-16', pkid = 76880 + slot): FeaturedPromoItem => ({
    pkid,
    scheduleOn: iso,
    trainingCenterPkid: 1,
    slot,
    promotionPkid: 1081,
    topic: `主題${slot}`,
    description: `說明${slot}`,
    promotion: { pkid: 1081, promoCode: '220624_PowerPlatform' },
  });

  // Accessors for the component's protected surface.
  const api = () =>
    component as unknown as {
      days: () => { iso: string; label: string; rows: { slot: number; item: FeaturedPromoItem | null }[] }[];
      weekLabel: () => string;
      tabOptions: () => { pkid: number; label: string }[];
      activeTcPkid: () => number | null;
      weekStart: () => Date;
      clipboard: () => { promoCode: string; topic: string } | null;
      editingCell: () => string | null;
      pasting: () => boolean;
      loading: () => boolean;
      onTabChange: (v: string | number | undefined) => void;
      prevWeek: () => void;
      nextWeek: () => void;
      openPanel: (iso: string, slot: number) => void;
      paste: (iso: string, slot: number) => void;
      closePanel: () => void;
      isEditing: (iso: string, slot: number) => boolean;
      copy: (i: FeaturedPromoItem) => void;
      remove: (i: FeaturedPromoItem) => void;
      move: (i: FeaturedPromoItem, d: 'up' | 'down') => void;
      canMoveUp: (r: { slot: number; item: FeaturedPromoItem | null }) => boolean;
      canMoveDown: (r: { slot: number; item: FeaturedPromoItem | null }) => boolean;
      onSaved: (r: { pkid: number; topic: string }) => void;
    };

  async function setup(): Promise<void> {
    fixture = TestBed.createComponent(FeaturedPromoItemList);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  /**
   * The component declares `providers: [ConfirmationService, MessageService]`, so it resolves its
   * OWN instances from the element injector. `TestBed.inject()` returns the ROOT instance, which
   * the component never calls — spying on that one silently observes nothing.
   */
  const componentInjected = <T,>(token: abstract new (...args: never[]) => T): T =>
    fixture.debugElement.injector.get(token);

  beforeEach(async () => {
    sessionStorage.clear();
    // Pin "today" to Wednesday 2026-03-18 so the default week is the mockup's 3/16..3/22.
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 2, 18, 10, 0, 0));

    service = jasmine.createSpyObj<FeaturedPromoItemService>('FeaturedPromoItemService', [
      'getTrainingCenterOptions',
      'getPromotionOptions',
      'queryWeek',
      'create',
      'update',
      'delete',
      'move',
    ]);
    service.getTrainingCenterOptions.and.returnValue(of(centers));
    service.getPromotionOptions.and.returnValue(of(promos));
    service.queryWeek.and.returnValue(of([itemAt(1), itemAt(2), itemAt(3)]));

    await TestBed.configureTestingModule({
      imports: [FeaturedPromoItemList],
      providers: [
        { provide: FeaturedPromoItemService, useValue: service },
        ConfirmationService,
        MessageService,
        provideNoopAnimations(),
      ],
    }).compileComponents();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    sessionStorage.clear();
  });

  // --- Tabs -----------------------------------------------------------------

  describe('TrainingCenter tabs', () => {
    it('renders one tab per training center', async () => {
      await setup();

      expect(api().tabOptions().map((t) => t.label)).toEqual([
        '台北',
        '新竹',
        '台中',
        '高雄',
        '線上研討會',
      ]);
    });

    it('maps the lookup string pkid to a NUMBER for the tab value', async () => {
      await setup();

      // p-tabs compares by identity: a string option against a numeric active value would leave
      // every tab inactive.
      const values = api().tabOptions().map((t) => t.pkid);
      expect(values).toEqual([1, 2, 3, 5, 54]);
      values.forEach((v) => expect(typeof v).toBe('number'));
    });

    it('defaults to the first tab', async () => {
      await setup();

      expect(api().activeTcPkid()).toBe(1);
    });

    it('filters by the pkid, not the tab index', async () => {
      await setup();
      service.queryWeek.calls.reset();

      api().onTabChange(54); // 線上研討會 — pkid 54 but tab INDEX 4

      expect(service.queryWeek).toHaveBeenCalledWith(54, jasmine.any(Date));
    });

    it('coerces a string tab value to a number', async () => {
      await setup();
      service.queryWeek.calls.reset();

      // Tabs.value is typed string | number — the handler must not pass '5' through.
      api().onTabChange('5');

      expect(api().activeTcPkid()).toBe(5);
      expect(service.queryWeek).toHaveBeenCalledWith(5, jasmine.any(Date));
    });

    it('renders an empty week for a center with no rows rather than failing', async () => {
      await setup();
      service.queryWeek.and.returnValue(of([]));

      api().onTabChange(54);

      const filled = api()
        .days()
        .flatMap((d) => d.rows)
        .filter((r) => r.item);
      expect(filled).toEqual([]);
      expect(api().days().length).toBe(7); // still 7 days x 3 slots
    });

    it('closes an open panel when the tab changes', async () => {
      await setup();
      api().openPanel('2026-03-16', 1);

      api().onTabChange(2);

      expect(api().editingCell()).toBeNull();
    });
  });

  // --- Week navigation ------------------------------------------------------

  describe('one-week window', () => {
    it('defaults to the Monday of the current week', async () => {
      await setup();

      // "Today" is Wednesday 2026-03-18.
      expect(toIso(api().weekStart())).toBe('2026-03-16');
    });

    it('requests exactly the current week on load', async () => {
      await setup();

      expect(service.queryWeek).toHaveBeenCalledWith(1, jasmine.any(Date));
      expect(toIso(service.queryWeek.calls.mostRecent().args[1])).toBe('2026-03-16');
    });

    it('loads the week ONCE on init', async () => {
      // p-tabs binds [value] one-way + (valueChange); if it echoed the initial value back as a
      // change event, every page visit would fire a second identical query.
      await setup();

      expect(service.queryWeek).toHaveBeenCalledTimes(1);
    });

    it('renders 7 days', async () => {
      await setup();

      expect(api().days().map((d) => d.iso)).toEqual([
        '2026-03-16',
        '2026-03-17',
        '2026-03-18',
        '2026-03-19',
        '2026-03-20',
        '2026-03-21',
        '2026-03-22',
      ]);
    });

    it('labels days as M/D (weekday) Monday-first', async () => {
      await setup();

      expect(api().days()[0].label).toBe('3/16 (一)');
      expect(api().days()[6].label).toBe('3/22 (日)');
    });

    it('shows the week label as the mockup does', async () => {
      await setup();

      expect(api().weekLabel()).toBe('3/16 -- 3/22');
    });

    it('steps back a week', async () => {
      await setup();

      api().prevWeek();

      expect(toIso(api().weekStart())).toBe('2026-03-09');
      expect(api().weekLabel()).toBe('3/9 -- 3/15');
      expect(toIso(service.queryWeek.calls.mostRecent().args[1])).toBe('2026-03-09');
    });

    it('steps forward a week', async () => {
      await setup();

      api().nextWeek();

      expect(toIso(api().weekStart())).toBe('2026-03-23');
      expect(toIso(service.queryWeek.calls.mostRecent().args[1])).toBe('2026-03-23');
    });

    it('stays Monday-aligned across a month boundary', async () => {
      await setup();

      api().nextWeek(); // 3/23
      api().nextWeek(); // 3/30
      api().nextWeek(); // 4/6

      expect(toIso(api().weekStart())).toBe('2026-04-06');
      expect(api().weekStart().getDay()).toBe(1); // Monday
      expect(api().weekLabel()).toBe('4/6 -- 4/12');
    });

    it('closes an open panel when the week changes', async () => {
      await setup();
      api().openPanel('2026-03-16', 1);

      api().nextWeek();

      expect(api().editingCell()).toBeNull();
    });
  });

  // --- The grid -------------------------------------------------------------

  describe('slot grid', () => {
    it('renders 3 slots for every day', async () => {
      await setup();

      api().days().forEach((d) => {
        expect(d.rows.map((r) => r.slot)).toEqual([1, 2, 3]);
      });
    });

    it('places each row in its own slot', async () => {
      await setup();

      const monday = api().days()[0];
      expect(monday.rows[0].item!.topic).toBe('主題1');
      expect(monday.rows[1].item!.topic).toBe('主題2');
      expect(monday.rows[2].item!.topic).toBe('主題3');
    });

    it('leaves a HOLE at the missing slot when a day is partly filled', async () => {
      // The dev DB really has days like this: 2026-07-30 / center 3 holds slots 1 and 3 only.
      // Rendering the response in order instead of matching on slot would slide slot 3 up into
      // slot 2's row and mislabel it.
      service.queryWeek.and.returnValue(of([itemAt(1), itemAt(3)]));
      await setup();

      const monday = api().days()[0];
      expect(monday.rows[0].item).toBeTruthy();
      expect(monday.rows[1].item).toBeNull(); // the hole stays a hole
      expect(monday.rows[2].item!.slot).toBe(3);
    });

    it('shows empty cells for a day with no rows', async () => {
      await setup();

      const tuesday = api().days()[1];
      expect(tuesday.rows.every((r) => r.item === null)).toBeTrue();
    });

    it('does not leak rows across days', async () => {
      service.queryWeek.and.returnValue(
        of([itemAt(1, '2026-03-16', 1), itemAt(1, '2026-03-20', 2)]),
      );
      await setup();

      expect(api().days()[0].rows[0].item!.pkid).toBe(1);
      expect(api().days()[4].rows[0].item!.pkid).toBe(2);
      expect(api().days()[1].rows[0].item).toBeNull();
    });
  });

  // --- Move -----------------------------------------------------------------

  describe('move (the 「+」/「--」 buttons)', () => {
    it('「+」 sends direction "down"', async () => {
      await setup();
      service.move.and.returnValue(of(void 0));

      api().move(itemAt(1), 'down');

      expect(service.move).toHaveBeenCalledWith(76881, 'down');
    });

    it('「--」 sends direction "up"', async () => {
      await setup();
      service.move.and.returnValue(of(void 0));

      api().move(itemAt(2), 'up');

      expect(service.move).toHaveBeenCalledWith(76882, 'up');
    });

    it('reloads the week after a move so the swap is visible', async () => {
      await setup();
      service.move.and.returnValue(of(void 0));
      service.queryWeek.calls.reset();

      api().move(itemAt(1), 'down');

      expect(service.queryWeek).toHaveBeenCalledTimes(1);
    });

    it('cannot move up from slot 1', async () => {
      await setup();

      expect(api().canMoveUp({ slot: 1, item: itemAt(1) })).toBeFalse();
    });

    it('cannot move down from slot 3', async () => {
      await setup();

      expect(api().canMoveDown({ slot: 3, item: itemAt(3) })).toBeFalse();
    });

    it('can move both ways from slot 2', async () => {
      await setup();

      expect(api().canMoveUp({ slot: 2, item: itemAt(2) })).toBeTrue();
      expect(api().canMoveDown({ slot: 2, item: itemAt(2) })).toBeTrue();
    });

    it('cannot move an empty cell in either direction', async () => {
      await setup();

      expect(api().canMoveUp({ slot: 2, item: null })).toBeFalse();
      expect(api().canMoveDown({ slot: 2, item: null })).toBeFalse();
    });

    it('reloads after a failed move so the grid stops being stale', async () => {
      await setup();
      service.move.and.returnValue(throwError(() => ({ status: 400 })));
      service.queryWeek.calls.reset();

      api().move(itemAt(1), 'up');

      expect(service.queryWeek).toHaveBeenCalledTimes(1);
    });
  });

  // --- Copy / Paste ---------------------------------------------------------

  describe('copy & paste', () => {
    it('Copy stashes the payload, not the cell', async () => {
      await setup();

      api().copy(itemAt(1));

      expect(api().clipboard()).toEqual({
        promotionPkid: 1081,
        promoCode: '220624_PowerPlatform',
        topic: '主題1',
        description: '說明1',
      } as never);
    });

    it('Paste does nothing when the clipboard is empty', async () => {
      await setup();

      api().paste('2026-03-17', 1);

      expect(api().editingCell()).toBeNull();
    });

    it('Paste opens the panel in seeding mode on the target cell', async () => {
      await setup();
      api().copy(itemAt(1));

      api().paste('2026-03-17', 2);

      expect(api().isEditing('2026-03-17', 2)).toBeTrue();
      expect(api().pasting()).toBeTrue();
    });

    it('the clipboard survives week navigation', async () => {
      await setup();
      api().copy(itemAt(1));

      api().nextWeek();

      expect(api().clipboard()).not.toBeNull();
    });

    it('Edit opens the panel WITHOUT seeding, even when the clipboard is full', async () => {
      await setup();
      api().copy(itemAt(1));

      api().openPanel('2026-03-16', 1);

      expect(api().pasting()).toBeFalse();
    });
  });

  // --- Panel + save ---------------------------------------------------------

  describe('inline panel', () => {
    it('opens on exactly one cell', async () => {
      await setup();

      api().openPanel('2026-03-16', 2);

      expect(api().isEditing('2026-03-16', 2)).toBeTrue();
      expect(api().isEditing('2026-03-16', 1)).toBeFalse();
      expect(api().isEditing('2026-03-17', 2)).toBeFalse();
    });

    it('closes on cancel', async () => {
      await setup();
      api().openPanel('2026-03-16', 1);

      api().closePanel();

      expect(api().editingCell()).toBeNull();
    });

    it('routes pkid 0 to create', async () => {
      await setup();
      service.create.and.returnValue(of(itemAt(1)));

      api().onSaved({ pkid: 0, topic: '新的' } as never);

      expect(service.create).toHaveBeenCalled();
      expect(service.update).not.toHaveBeenCalled();
    });

    it('routes a non-zero pkid to update', async () => {
      await setup();
      service.update.and.returnValue(of(void 0));

      api().onSaved({ pkid: 76884, topic: '改過的' } as never);

      expect(service.update).toHaveBeenCalled();
      expect(service.create).not.toHaveBeenCalled();
    });

    it('closes and reloads after a successful save', async () => {
      await setup();
      service.update.and.returnValue(of(void 0));
      service.queryWeek.calls.reset();
      api().openPanel('2026-03-16', 1);

      api().onSaved({ pkid: 76884, topic: '改過的' } as never);

      expect(api().editingCell()).toBeNull();
      expect(service.queryWeek).toHaveBeenCalledTimes(1);
    });

    it('keeps the panel open when a save fails, so the input is not lost', async () => {
      await setup();
      service.update.and.returnValue(throwError(() => ({ status: 500 })));
      api().openPanel('2026-03-16', 1);

      api().onSaved({ pkid: 76884, topic: '改過的' } as never);

      expect(api().editingCell()).toBe('2026-03-16#1');
    });

    it('surfaces the API message on a 409 duplicate cell', async () => {
      await setup();
      const spy = spyOn(componentInjected(MessageService), 'add');
      service.update.and.returnValue(
        throwError(() => ({ status: 409, error: { message: '此日期／訓練中心的此欄位已有資料，無法修改。' } })),
      );

      api().onSaved({ pkid: 76884, topic: 'x' } as never);

      expect(spy).toHaveBeenCalledWith(
        jasmine.objectContaining({ detail: '此日期／訓練中心的此欄位已有資料，無法修改。' }),
      );
    });
  });

  // --- Delete ---------------------------------------------------------------

  describe('delete', () => {
    it('deletes after the confirmation is accepted', async () => {
      await setup();
      service.delete.and.returnValue(of(void 0));
      const confirm = componentInjected(ConfirmationService);
      spyOn(confirm, 'confirm').and.callFake((opts) => {
        opts.accept!();
        return confirm;
      });

      api().remove(itemAt(1));

      expect(service.delete).toHaveBeenCalledWith(76881);
    });

    it('does not delete without confirmation', async () => {
      await setup();
      const confirm = componentInjected(ConfirmationService);
      spyOn(confirm, 'confirm').and.returnValue(confirm); // never accepts

      api().remove(itemAt(1));

      expect(service.delete).not.toHaveBeenCalled();
    });

    it('warns about no cascade — nothing FK-references this table', async () => {
      await setup();
      const confirm = componentInjected(ConfirmationService);
      const spy = spyOn(confirm, 'confirm').and.returnValue(confirm);

      api().remove(itemAt(1));

      const message = spy.calls.mostRecent().args[0].message!;
      expect(message).toContain('3/16');
      expect(message).toContain('220624_PowerPlatform');
      // No "children will also be deleted" warning belongs here, unlike CourseGroup's.
      expect(message).not.toContain('一併');
    });
  });

  // --- sessionStorage -------------------------------------------------------

  describe('persisted filters', () => {
    it('persists the tab and week', async () => {
      await setup();

      api().onTabChange(3);

      const saved = JSON.parse(sessionStorage.getItem('featured-promo-item-list-filters')!);
      expect(saved.trainingCenterPkid).toBe(3);
      expect(saved.weekStart).toBe('2026-03-16');
    });

    it('restores the tab and week', async () => {
      sessionStorage.setItem(
        'featured-promo-item-list-filters',
        JSON.stringify({ trainingCenterPkid: 5, weekStart: '2026-04-06' }),
      );

      await setup();

      expect(api().activeTcPkid()).toBe(5);
      expect(toIso(api().weekStart())).toBe('2026-04-06');
      expect(service.queryWeek).toHaveBeenCalledWith(5, jasmine.any(Date));
    });

    it('re-normalises a restored non-Monday to its Monday', async () => {
      // A stale or hand-edited value must not skew the whole grid off Monday.
      sessionStorage.setItem(
        'featured-promo-item-list-filters',
        JSON.stringify({ trainingCenterPkid: 1, weekStart: '2026-04-09' }), // a Thursday
      );

      await setup();

      expect(toIso(api().weekStart())).toBe('2026-04-06');
    });

    it('falls back to the first tab when the saved center no longer exists', async () => {
      sessionStorage.setItem(
        'featured-promo-item-list-filters',
        JSON.stringify({ trainingCenterPkid: 999, weekStart: '2026-03-16' }),
      );

      await setup();

      expect(api().activeTcPkid()).toBe(1);
    });

    it('survives corrupt stored JSON', async () => {
      sessionStorage.setItem('featured-promo-item-list-filters', '{not json');

      await setup();

      expect(api().activeTcPkid()).toBe(1);
      expect(sessionStorage.getItem('featured-promo-item-list-filters')).toBeNull();
    });
  });

  // --- Failure handling -----------------------------------------------------

  describe('load failures', () => {
    it('clears loading and shows a message when the week query fails', async () => {
      service.queryWeek.and.returnValue(throwError(() => ({ status: 500 })));
      await setup();

      expect(api().loading()).toBeFalse();
      expect(api().days().flatMap((d) => d.rows).every((r) => r.item === null)).toBeTrue();
    });

    it('clears loading when the lookups fail', async () => {
      service.getTrainingCenterOptions.and.returnValue(throwError(() => ({ status: 500 })));
      await setup();

      expect(api().loading()).toBeFalse();
    });
  });
});
