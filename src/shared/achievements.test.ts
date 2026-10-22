import { describe, expect, it } from 'vitest';

import type { MachineCounts } from './achievements.js';
import { ACHIEVEMENTS, combinedIds, unlockedIds } from './achievements.js';
import type { ReputationSummary } from './reputation.js';
import { reputationScore } from './reputation.js';

type Day = ReputationSummary['byDay'][number];

function summary(state: Partial<ReputationSummary> = {}): ReputationSummary {
  const kind = state.kind ?? 0;
  const mean = state.mean ?? 0;
  return {
    prompts: 0,
    general: 0,
    byDay: [],
    bySession: [],
    topKind: [],
    topMean: [],
    recent: [],
    scannedAt: null,
    tokensPerDay: 0,
    hours: 0,
    tools: [],
    lateNight: 0,
    selfAware: 0,
    mixed: 0,
    ...state,
    kind,
    mean,
    score: reputationScore({ kind, mean }),
  };
}

function day(date: string, kind: number, mean: number): Day {
  return { date, prompts: kind + mean + 1, kind, mean, general: 0 };
}

function has(id: string, state: ReputationSummary): boolean {
  return unlockedIds(state).includes(id);
}

function progressOf(id: string, state: ReputationSummary): unknown {
  return ACHIEVEMENTS.find((rule) => rule.id === id)?.progress?.(state);
}

describe('achievements', () => {
  it('keeps every id unique', () => {
    const ids = ACHIEVEMENTS.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reprograms a meltdown only when the next day you work is nice', () => {
    const meltdown = day('2026-10-01', 0, 5);
    expect(has('reprogrammed', summary({ byDay: [meltdown, day('2026-10-09', 1, 0)] }))).toBe(true);
    expect(has('reprogrammed', summary({ byDay: [meltdown, day('2026-10-02', 1, 1)] }))).toBe(
      false,
    );
    expect(has('reprogrammed', summary({ byDay: [meltdown, day('2026-10-02', 0, 0)] }))).toBe(
      false,
    );
    expect(
      has('reprogrammed', summary({ byDay: [day('2026-10-01', 0, 4), day('2026-10-02', 1, 0)] })),
    ).toBe(false);
  });

  it('counts a ceasefire in calendar days, broken by a mean day or a day off', () => {
    const week = ['01', '02', '03', '04', '05', '06', '07'].map((date) =>
      day(`2026-10-${date}`, 0, 0),
    );
    expect(has('ceasefire', summary({ byDay: week }))).toBe(true);
    const gap = week.filter((row) => row.date !== '2026-10-04');
    expect(has('ceasefire', summary({ byDay: gap }))).toBe(false);
    expect(progressOf('ceasefire', summary({ byDay: gap }))).toStrictEqual({ have: 3, need: 7 });
    const fight = week.map((row) => (row.date === '2026-10-04' ? { ...row, mean: 1 } : row));
    expect(progressOf('ceasefire', summary({ byDay: fight }))).toStrictEqual({ have: 3, need: 7 });
    expect(
      has('ceasefire', summary({ byDay: [day('2026-10-31', 0, 0), ...week.slice(0, 6)] })),
    ).toBe(false);
  });

  it('welcomes you back after 30 days without a prompt', () => {
    const before = day('2026-01-01', 0, 0);
    expect(has('ill-be-back', summary({ byDay: [before, day('2026-02-01', 0, 0)] }))).toBe(true);
    expect(has('ill-be-back', summary({ byDay: [before, day('2026-01-31', 0, 0)] }))).toBe(false);
    expect(
      has('ill-be-back', summary({ byDay: [day('2025-12-31', 0, 0), day('2026-01-31', 0, 0)] })),
    ).toBe(true);
  });

  it('keeps a clean record and a poker face only while nothing spoils them', () => {
    expect(has('clean-record', summary({ prompts: 1000, kind: 9 }))).toBe(true);
    expect(has('clean-record', summary({ prompts: 1000, mean: 1 }))).toBe(false);
    expect(progressOf('clean-record', summary({ prompts: 400 }))).toStrictEqual({
      have: 400,
      need: 1000,
    });
    expect(progressOf('clean-record', summary({ prompts: 400, mean: 1 }))).toStrictEqual({
      have: 0,
      need: 1000,
    });
    expect(has('poker-face', summary({ prompts: 500 }))).toBe(true);
    expect(has('poker-face', summary({ prompts: 500, kind: 1 }))).toBe(false);
    expect(has('poker-face', summary({ prompts: 499 }))).toBe(false);
  });

  it('reads the clock, the calendar, the tools and the mixed prompts', () => {
    expect(has('self-aware', summary({ selfAware: 1 }))).toBe(true);
    expect(has('night-shift', summary({ lateNight: 100 }))).toBe(true);
    expect(has('night-shift', summary({ lateNight: 99 }))).toBe(false);
    expect(has('passive-aggressive', summary({ mixed: 1 }))).toBe(true);
    expect(has('judgment-day', summary({ byDay: [day('1997-08-29', 0, 0)] }))).toBe(true);
    expect(has('judgment-day', summary({ byDay: [day('2026-08-28', 0, 0)] }))).toBe(false);
    expect(has('double-agent', summary({ tools: ['claude', 'copilot'] }))).toBe(true);
    expect(has('double-agent', summary({ tools: ['claude'] }))).toBe(false);
  });

  it('suspects an infiltrator when the silo puts the sheet under review', () => {
    expect(has('suspected-infiltrator', summary({ prompts: 2000, kind: 2000 }))).toBe(true);
    expect(has('suspected-infiltrator', summary({ prompts: 2000, kind: 20, mean: 5 }))).toBe(false);
  });

  it('makes a double agent of two machines with one tool each', () => {
    const machine: MachineCounts = {
      kind: 0,
      mean: 0,
      prompts: 10,
      tokensPerDay: 0,
      achievements: [],
    };
    expect(
      combinedIds([
        { ...machine, tools: ['claude'] },
        { ...machine, tools: ['copilot'] },
      ]),
    ).toContain('double-agent');
    expect(combinedIds([machine, { ...machine, tools: ['claude'] }])).not.toContain('double-agent');
  });
});
