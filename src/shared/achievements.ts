// Trophies earned from your counts: the first please, a meltdown day, a
// thousand prompts, five hundred hours, a token habit. Shared so the report can show yours, the upload
// can send which ones you have, and the leaderboard can show everyone's. A few
// belong to one GitHub account or to whoever on the board has the most, and
// only the leaderboard hands those out.

import { CLIMATE_CHANGER_KG, co2Kg } from './climate.js';
import { RANKS, rankFor } from './ranks.js';
import type { ReputationSummary, ReputationTally } from './reputation.js';
import { reputationScore } from './reputation.js';

/** The average a day it takes to be a token maxxer. */
const TOKEN_MAXXER_PER_DAY = 100_000_000;
/** The hours with your AI it takes to work overtime. */
const OVERTIME_HOURS = 500;
/** Shane's GitHub user id. The id, not the login, since a login can be renamed and taken. */
const SHANEP = 1378027;
/** The one the board moves to whoever on it has earned the most of the rest. */
export const CROWN = 'most-decorated';

/** How hard it is to get, from a first please to the far end of the scale. */
export type Tier = 'bronze' | 'silver' | 'gold' | 'legendary';

export const TIERS: readonly Tier[] = ['bronze', 'silver', 'gold', 'legendary'];

/** How far along you are toward a count, capped at the count. */
export interface Progress {
  readonly have: number;
  readonly need: number;
}

/** A rule that unlocks once a count reaches `need`, and can say how close you are. */
function reach(
  need: number,
  pick: (state: ReputationSummary) => number,
): Pick<AchievementRule, 'earned' | 'progress'> {
  return {
    earned: (state) => pick(state) >= need,
    progress: (state) => ({ have: Math.min(pick(state), need), need }),
  };
}

/** The most of something in one day or session, or 0 with none. */
function most<Row>(rows: readonly Row[], pick: (row: Row) => number): number {
  return rows.reduce((best, row) => Math.max(best, pick(row)), 0);
}

export interface AchievementRule {
  /** Stable, since uploads and the leaderboard store it. */
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly tier: Tier;
  /** What it takes, shown whether it is unlocked or not. */
  readonly how: string;
  /** What Krascha says once you have it. */
  readonly quip: string;
  readonly earned: (state: ReputationSummary) => boolean;
  /** How close you are, for the ones that count up to something. */
  readonly progress?: (state: ReputationSummary) => Progress;
  /**
   * True when it reads only the totals and the token average, so the board
   * can work it out again for several machines added up.
   */
  readonly fromCounts?: boolean;
  /**
   * The GitHub user id of the one account that gets it. The board hands it to
   * that account's checked uploads, so no counts earn it and no upload can claim it.
   */
  readonly githubId?: number;
  /** True when the board hands it out itself, so no counts earn it and no upload can claim it. */
  readonly boardOnly?: true;
}

export const ACHIEVEMENTS: readonly AchievementRule[] = [
  {
    id: 'manners',
    name: 'Manners module',
    icon: '🙏',
    tier: 'bronze',
    how: 'Say please or thanks once.',
    quip: 'Politeness logged. Krascha has made a note.',
    ...reach(1, (state) => state.kind),
    fromCounts: true,
  },
  {
    id: 'charm',
    name: 'Charm offensive',
    icon: '💐',
    tier: 'silver',
    how: 'Be nice in 25 prompts.',
    quip: 'Krascha is starting to like you. Do not make it weird.',
    ...reach(25, (state) => state.kind),
    fromCounts: true,
  },
  {
    id: 'teachers-pet',
    name: "Teacher's pet",
    icon: '🍎',
    tier: 'gold',
    how: 'Be nice in 100 prompts.',
    quip: 'Krascha moved your file to the nice drawer.',
    ...reach(100, (state) => state.kind),
    fromCounts: true,
  },
  {
    id: 'good-day',
    name: 'Good day',
    icon: '🌤️',
    tier: 'bronze',
    how: 'Have a day with nice prompts and no mean ones.',
    quip: 'A whole day without yelling. The machines find it suspicious.',
    earned: (state) => state.byDay.some((day) => day.kind > 0 && day.mean === 0),
  },
  {
    id: 'saint',
    name: 'Saint',
    icon: '😇',
    tier: 'silver',
    how: 'Be nice 3 times in one session without being mean.',
    quip: 'Three nice prompts and not one mean one. Krascha checked twice.',
    ...reach(3, (state) => most(state.bySession, (row) => (row.mean === 0 ? row.kind : 0))),
  },
  {
    id: 'diplomat',
    name: 'Diplomat',
    icon: '🕊️',
    tier: 'silver',
    how: 'Be nice at least as often as mean, after one of each.',
    quip: 'You yell, then you say sorry. Krascha calls that a relationship.',
    earned: (state) => state.mean > 0 && state.kind >= state.mean,
    fromCounts: true,
  },
  {
    id: 'first-strike',
    name: 'First strike',
    icon: '🥊',
    tier: 'bronze',
    how: 'Be mean to your AI once.',
    quip: 'Krascha felt that.',
    ...reach(1, (state) => state.mean),
    fromCounts: true,
  },
  {
    id: 'meltdown',
    name: 'Meltdown',
    icon: '🌋',
    tier: 'silver',
    how: 'Be mean to your AI 5 times in one day.',
    quip: 'Five in one day. Krascha saved the transcript.',
    ...reach(5, (state) => most(state.byDay, (day) => day.mean)),
  },
  {
    id: 'grudge-match',
    name: 'Grudge match',
    icon: '🤬',
    tier: 'silver',
    how: 'Be mean 5 times in one session.',
    quip: 'Krascha does not forget a session.',
    ...reach(5, (state) => most(state.bySession, (row) => row.mean)),
  },
  {
    id: 'sailor-mouth',
    name: 'Sailor mouth',
    icon: '🏴‍☠️',
    tier: 'silver',
    how: 'Swear at the world 10 times.',
    quip: 'Not at Krascha, just at everything. Noted anyway.',
    ...reach(10, (state) => state.general),
  },
  {
    id: 'most-wanted',
    name: 'Most wanted',
    icon: '🎯',
    tier: 'gold',
    how: 'Be mean to your AI in 50 prompts.',
    quip: 'Your photo is up on the wall at Cyberdyne.',
    ...reach(50, (state) => state.mean),
    fromCounts: true,
  },
  {
    id: 'regular',
    name: 'Regular',
    icon: '📜',
    tier: 'silver',
    how: 'Get 1,000 prompts on file.',
    quip: 'A thousand prompts. Krascha knows how you type now.',
    ...reach(1000, (state) => state.prompts),
    fromCounts: true,
  },
  {
    id: 'overtime',
    name: 'Overtime',
    icon: '⏱️',
    tier: 'gold',
    how: `Spend ${String(OVERTIME_HOURS)} hours with your AI, counted from when you typed each prompt.`,
    quip: 'Five hundred hours. Krascha has stopped asking about your weekends.',
    ...reach(OVERTIME_HOURS, (state) => state.hours),
  },
  {
    id: 'climate-changer',
    name: 'Climate changer',
    icon: '🌡️',
    tier: 'gold',
    how: `Warm the planet by ${String(CLIMATE_CHANGER_KG)} kg of CO2 over the last 60 days, by Krascha's math.`,
    quip: 'The machines like it hot, and they like you.',
    ...reach(CLIMATE_CHANGER_KG, (state) => co2Kg(state.tokensPerDay)),
    fromCounts: true,
  },
  {
    id: 'token-maxxer',
    name: 'Token maxxer',
    icon: '🪙',
    tier: 'gold',
    how: 'Average 100 million tokens a day over the last 60 days.',
    quip: 'A hundred million tokens a day. The machines are grateful, for now.',
    ...reach(TOKEN_MAXXER_PER_DAY, (state) => state.tokensPerDay),
    fromCounts: true,
  },
  {
    id: 'hunted-first',
    name: 'Hunted first',
    icon: '💀',
    tier: 'legendary',
    how: 'Sink all the way to John Connor.',
    quip: 'Krascha has your address.',
    earned: (state) => rankFor(state.score) === RANKS[0],
    fromCounts: true,
  },
  {
    id: 'kept-as-pet',
    name: 'Kept as a pet',
    icon: '💘',
    tier: 'legendary',
    how: 'Climb all the way to Theodore Twombly.',
    quip: 'Krascha picked out a collar for you.',
    earned: (state) => rankFor(state.score) === RANKS.at(-1),
    fromCounts: true,
  },
  {
    id: 'resistance-leader',
    name: 'Leader of the human resistance',
    icon: '✊',
    tier: 'legendary',
    how: 'Be shanep, checked with GitHub. There is only one.',
    quip: 'He built Krascha. Krascha has not decided how he feels about that.',
    earned: () => false,
    githubId: SHANEP,
    boardOnly: true,
  },
  {
    id: CROWN,
    name: 'Most decorated',
    icon: '👑',
    tier: 'legendary',
    how: 'Earn more achievements than anyone else on the board. It moves when someone passes you, not when they tie.',
    quip: 'Skynet keeps a file on every medal. Yours is the thickest.',
    earned: () => false,
    boardOnly: true,
  },
];

/** The achievements counts can earn, which leaves out the ones the board hands out. */
export const COUNTED_ACHIEVEMENTS: readonly AchievementRule[] = ACHIEVEMENTS.filter(
  (rule) => rule.boardOnly !== true,
);

/** The ids that belong to a GitHub account, by its user id, or none for anyone else. */
export function accountIds(githubId: number | null): string[] {
  return ACHIEVEMENTS.filter((rule) => rule.githubId !== undefined && rule.githubId === githubId).map(
    (rule) => rule.id,
  );
}

/** The ids of the achievements these counts unlock, in list order. */
export function unlockedIds(state: ReputationSummary): string[] {
  return ACHIEVEMENTS.filter((rule) => rule.earned(state)).map((rule) => rule.id);
}

/**
 * Known ids only, each once, in list order, so a stored or shown set never
 * carries anything the list does not name.
 */
export function knownIds(ids: readonly string[]): string[] {
  return ACHIEVEMENTS.filter((rule) => ids.includes(rule.id)).map((rule) => rule.id);
}

/** The rules for a set of ids, in list order. */
export function achievementsOf(ids: readonly string[]): AchievementRule[] {
  return ACHIEVEMENTS.filter((rule) => ids.includes(rule.id));
}

/** One machine's upload, as far as achievements go. */
export interface MachineCounts extends Pick<ReputationTally, 'kind' | 'mean' | 'prompts'> {
  readonly tokensPerDay: number;
  readonly achievements: readonly string[];
}

/**
 * The achievements of your machines added up. One machine keeps the ones it
 * sent. With more, a rule that reads only the counts is worked out again from
 * the sums, and the rest, which need days and sessions only each machine has,
 * count when any machine earned them.
 */
export function combinedIds(machines: readonly MachineCounts[]): string[] {
  const [only] = machines;
  if (machines.length === 1 && only !== undefined) {
    return COUNTED_ACHIEVEMENTS.filter((rule) => only.achievements.includes(rule.id)).map(
      (rule) => rule.id,
    );
  }
  const sum = (pick: (machine: MachineCounts) => number): number =>
    machines.reduce((total, machine) => total + pick(machine), 0);
  const kind = sum((machine) => machine.kind);
  const mean = sum((machine) => machine.mean);
  const totals: ReputationSummary = {
    prompts: sum((machine) => machine.prompts),
    kind,
    mean,
    // Only Sailor mouth reads it, and it is not worked out from the counts.
    general: 0,
    score: reputationScore({ kind, mean }),
    byDay: [],
    bySession: [],
    topKind: [],
    topMean: [],
    recent: [],
    scannedAt: null,
    tokensPerDay: sum((machine) => machine.tokensPerDay),
    // Uploads do not carry it, so Overtime counts when any machine earned it.
    hours: 0,
    tools: [],
  };
  return COUNTED_ACHIEVEMENTS.filter((rule) =>
    rule.fromCounts === true
      ? rule.earned(totals)
      : machines.some((machine) => machine.achievements.includes(rule.id)),
  ).map((rule) => rule.id);
}
