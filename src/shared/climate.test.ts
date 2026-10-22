import { describe, expect, it } from 'vitest';

import { combinedIds } from './achievements.js';
import { CLIMATE_RANKS, climateRankFor, co2Kg, co2Text, warmthPercent } from './climate.js';

describe('climate', () => {
  it('turns a token average into CO2 over the 60 days it covers', () => {
    expect(co2Kg(0)).toBe(0);
    expect(co2Kg(100_000_000)).toBe(600);
  });

  it('ranks warmer as better, ten times the CO2 per rank', () => {
    expect(CLIMATE_RANKS.map((rank) => rank.min)).toStrictEqual([0, 1, 10, 100, 1000]);
    expect(climateRankFor(0).name).toBe('Ice age');
    expect(climateRankFor(9.9).name).toBe('Space heater');
    expect(climateRankFor(100).name).toBe('Data center');
    expect(climateRankFor(1e9).name).toBe('Arizona beachfront');
  });

  it('puts each rank an equal share along the scale, and keeps it from 0 to 100', () => {
    expect(CLIMATE_RANKS.map((rank) => warmthPercent(rank.min))).toStrictEqual([
      0, 25, 50, 75, 100,
    ]);
    expect(warmthPercent(1e9)).toBe(100);
  });

  it('writes grams, kilograms and tonnes', () => {
    expect(co2Text(0)).toBe('0 g');
    expect(co2Text(0.25)).toBe('250 g');
    expect(co2Text(2.5)).toBe('2.5 kg');
    expect(co2Text(600)).toBe('600 kg');
    expect(co2Text(1000)).toBe('1 tonne');
    expect(co2Text(1200)).toBe('1.2 tonnes');
  });

  it('makes you a climate changer at 100 kg, from your machines added up', () => {
    const machine = (tokensPerDay: number) => ({
      kind: 0,
      mean: 0,
      prompts: 0,
      tokensPerDay,
      achievements: [],
    });
    expect(combinedIds([machine(9_000_000), machine(9_000_000)])).toContain('climate-changer');
    expect(combinedIds([machine(8_000_000), machine(8_000_000)])).not.toContain('climate-changer');
  });
});
