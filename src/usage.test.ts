import { describe, expect, it } from 'vitest';

import { computedThrough, lifetimeTokens } from './usage.js';

const usage = (tokens: number): Record<string, number> => ({
  inputTokens: tokens,
  outputTokens: tokens,
  cacheReadInputTokens: tokens,
  cacheCreationInputTokens: tokens,
  webSearchRequests: 99,
  costUSD: 99,
});

describe('lifetime tokens', () => {
  it("adds up every model's input, output and cache tokens", () => {
    const stats = { modelUsage: { opus: usage(100), haiku: usage(10), junk: 'no' } };
    expect(lifetimeTokens(stats)).toBe(440);
  });

  it('takes the daily totals when they add up to more', () => {
    const stats = {
      modelUsage: { opus: usage(1) },
      dailyModelTokens: [
        { date: '2026-10-20', tokensByModel: { opus: 500 } },
        { date: '2026-10-21', tokensByModel: { opus: 250, haiku: 50 } },
      ],
    };
    expect(lifetimeTokens(stats)).toBe(800);
  });

  it('is 0 without usage stats', () => {
    expect(lifetimeTokens(undefined)).toBe(0);
    expect(lifetimeTokens({ modelUsage: [] })).toBe(0);
  });
});

describe('computedThrough', () => {
  const days = [
    { date: '2026-10-21', tokensByModel: { opus: 1 } },
    { date: '2026-10-19', tokensByModel: { opus: 1 } },
  ];

  it('takes the date the stats say they were worked out through', () => {
    expect(computedThrough({ lastComputedDate: '2026-10-22', dailyModelTokens: days })).toBe(
      '2026-10-22',
    );
  });

  it('falls back to the newest day, or null with none', () => {
    expect(computedThrough({ lastComputedDate: 'soon', dailyModelTokens: days })).toBe(
      '2026-10-21',
    );
    expect(computedThrough({})).toBeNull();
  });
});
