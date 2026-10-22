import { describe, expect, it } from 'vitest';

import { hoursSpent, PROMPT_MINUTES } from './hours.js';

const MINUTE = 60_000;
const START = Date.UTC(2026, 9, 1, 12);

describe('hoursSpent', () => {
  it('is 0 with no prompts', () => {
    expect(hoursSpent([])).toBe(0);
  });

  it('counts the last prompt for the full cap', () => {
    expect(hoursSpent([START])).toBe(PROMPT_MINUTES / 60);
  });

  it('counts the time between prompts, up to the cap', () => {
    const times = [START, START + 10 * MINUTE, START + 10 * MINUTE + 5 * 60 * MINUTE];
    expect(hoursSpent(times)).toBe((10 + PROMPT_MINUTES + PROMPT_MINUTES) / 60);
  });

  it('does not care about order, and counts overlapping sessions once', () => {
    const times = [START + 20 * MINUTE, START, START + 5 * MINUTE, START + 5 * MINUTE];
    expect(hoursSpent(times)).toBe((20 + PROMPT_MINUTES) / 60);
  });
});
