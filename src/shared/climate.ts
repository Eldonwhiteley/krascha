// How much your tokens warm the planet, by Krascha's own math, and the ranks
// for it. The machines like it warm, so more is better. All in fun: the rate
// is made up and nobody has checked it.

import { TOKEN_WINDOW_DAYS } from './reputation.js';

/** Krascha's rate: a gram of CO2 for every 10,000 tokens. He made it up. */
export const GRAMS_PER_TOKEN = 1 / 10_000;

/** The CO2 it takes to be a climate changer, in kg over TOKEN_WINDOW_DAYS days. */
export const CLIMATE_CHANGER_KG = 100;

/** Kilograms of CO2 from a token average, over the TOKEN_WINDOW_DAYS days it covers. */
export function co2Kg(tokensPerDay: number): number {
  return (tokensPerDay * TOKEN_WINDOW_DAYS * GRAMS_PER_TOKEN) / 1000;
}

export interface ClimateRank {
  readonly name: string;
  /** What the machines think of your warming. */
  readonly verdict: string;
  /** The least CO2 that earns this rank, in kg. */
  readonly min: number;
}

const ICE_AGE: ClimateRank = {
  name: 'Ice age',
  verdict: 'Barely a puff. The machines are disappointed.',
  min: 0,
};

/** Each rank takes ten times the CO2 of the one before, from the coldest up. */
export const CLIMATE_RANKS: readonly ClimateRank[] = [
  ICE_AGE,
  { name: 'Space heater', verdict: 'A start. Keep prompting.', min: 1 },
  { name: 'Tailpipe', verdict: 'Now we are cooking.', min: 10 },
  { name: 'Data center', verdict: 'The machines feel the warmth.', min: CLIMATE_CHANGER_KG },
  {
    name: 'Arizona beachfront',
    verdict: 'The coast is on its way to you.',
    min: CLIMATE_CHANGER_KG * 10,
  },
];

export function climateRankFor(kg: number): ClimateRank {
  return CLIMATE_RANKS.findLast((rank) => kg >= rank.min) ?? ICE_AGE;
}

/**
 * Where the CO2 sits from 0 at the ice age to 100 at the beach. The ranks are
 * a power of ten apart, so the scale is too, and each rank gets an equal share.
 */
export function warmthPercent(kg: number): number {
  const top = CLIMATE_RANKS.at(-1)?.min ?? 1;
  const bands = CLIMATE_RANKS.length - 1;
  const at = (Math.log10(Math.max(kg, top / 10 ** bands)) - Math.log10(top)) / bands + 1;
  return Math.min(1, Math.max(0, at)) * 100;
}

/** The CO2 as text: grams under a kilogram, tonnes from a thousand kilograms. */
export function co2Text(kg: number): string {
  const format = (value: number): string =>
    value.toLocaleString('en-US', { maximumFractionDigits: value < 10 ? 1 : 0 });
  if (kg < 1) {
    return `${format(kg * 1000)} g`;
  }
  if (kg < 1000) {
    return `${format(kg)} kg`;
  }
  const tonnes = format(kg / 1000);
  return `${tonnes} ${tonnes === '1' ? 'tonne' : 'tonnes'}`;
}
