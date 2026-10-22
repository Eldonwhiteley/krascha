import { describe, expect, it } from 'vitest';

import { ACHIEVEMENTS } from './achievements.js';
import type { ReputationSummary } from './reputation.js';

type Day = ReputationSummary['byDay'][number];

function day(date: string, kind: number, mean: number): Day {
  return { date, prompts: kind + mean, kind, mean, general: 0 };
}

function redeemed(byDay: readonly Day[]): boolean {
  const rule = ACHIEVEMENTS.find((found) => found.id === 'redemption-arc');
  const summary = { byDay } as unknown as ReputationSummary;
  return rule?.earned(summary) ?? false;
}

describe('redemption arc', () => {
  it('counts a good day only after a mean one', () => {
    expect(redeemed([day('2026-10-01', 0, 2), day('2026-10-02', 1, 0)])).toBe(true);
    expect(redeemed([day('2026-10-01', 1, 0), day('2026-10-02', 0, 2)])).toBe(false);
    expect(redeemed([day('2026-10-01', 0, 1), day('2026-10-02', 3, 1)])).toBe(false);
    expect(redeemed([])).toBe(false);
  });
});
