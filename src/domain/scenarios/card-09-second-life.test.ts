// Card 9, second life: `ebike-007` comes back fair at 18 400 km. The refurbishment plan and
// the waiting-list match are wave 3's; today the harness pins the facts the card rests on
// and keeps the judged numbers as todos.
import { describe, expect, it } from 'vitest';
import { assetById, pack } from './fixtures';

const entry = (id: string) => pack.demand.find((d) => d.id === id);

describe('card 9: second life (ebike-007, fair, 18 400 km)', () => {
  it('ebike-007 is returned, fair, 18 400 km, after one life', () => {
    expect(assetById('ebike-007')).toMatchObject({
      status: 'returned',
      condition: 'fair',
      usage: { unit: 'km', value: 18_400 },
      previous_lives: 1,
    });
  });

  it('wait-02 takes fair at 12 months, wait-13 needs good at 24, both up to 9 000 net', () => {
    expect(entry('wait-02')).toMatchObject({
      category: 'e_bike',
      min_condition: 'fair',
      preferred_term_months: 12,
      max_monthly_net_rent_cents: 9_000,
    });
    expect(entry('wait-13')).toMatchObject({
      category: 'e_bike',
      min_condition: 'good',
      preferred_term_months: 24,
      max_monthly_net_rent_cents: 9_000,
    });
  });

  it.todo('the battery is replaced (35 000, over 15 000 km) and usage resets (wave 3)');
  it.todo('the safety inspection 4 500 is always charged (wave 3)');
  it.todo('fair to good costs 12 000 more (wave 3)');
  it.todo('as is, it matches wait-02 (fair, 12 months, up to 9 000) (wave 3)');
  it.todo('refurbished to good, it matches wait-13 (good, 24 months, up to 9 000) (wave 3)');
});
