// Trophies earned from your counts: the first please, a meltdown day, a
// thousand prompts, five hundred hours, a token habit. Shared so the report can show yours, the upload
// can send which ones you have, and the leaderboard can show everyone's. A few
// belong to one GitHub account or to whoever on the board has the most, and
// only the leaderboard hands those out.

import { CLIMATE_CHANGER_KG, co2Kg } from './climate.js';
import { RANKS, rankFor } from './ranks.js';
import type { ReputationSummary, ReputationTally } from './reputation.js';
import { reputationScore } from './reputation.js';
import { scoreApplicant } from './silo.js';
import { knownTools } from './tools.js';

/** The average a day it takes to be a token maxxer. */
const TOKEN_MAXXER_PER_DAY = 100_000_000;
/** The hours with your AI it takes to work overtime. */
const OVERTIME_HOURS = 500;
/** Mean prompts in one day that make a meltdown. */
const MELTDOWN_MEAN = 5;
/** Prompts on file it takes for a clean record. */
const CLEAN_RECORD_PROMPTS = 1000;
/** Prompts it takes for Krascha to give up reading you. */
const POKER_FACE_PROMPTS = 500;
/** Days without a prompt that make a comeback. */
const COMEBACK_DAYS = 30;
/** Days in a row without a mean prompt for a ceasefire. */
const CEASEFIRE_DAYS = 7;
const DAY_MS = 86_400_000;
/** Shane's GitHub user id. The id, not the login, since a login can be renamed and taken. */
export const SHANEP = 1378027;
/** The one the board moves to whoever on it has earned the most of the rest. */
export const CROWN = 'most-decorated';
/** The one the board moves to whoever on it has the most likes. */
export const CHAMPION = 'peoples-champion';
/** The board hands these out when it is read, since likes and places move without an upload. */
export const CROWD_FAVORITE = 'crowd-favorite';
export const BUNK_ASSIGNED = 'bunk-assigned';
/** The board hands this to a GitHub account with a pull request merged into Krascha. */
export const MILES_DYSON = 'miles-dyson';
/** The board hands this to the GitHub account behind the first pull request merged into Krascha. */
export const MODEL_101 = 'model-101';
/** The board hands this to a GitHub account with a commit that has Claude as a co-author. */
export const MACHINE_COLLABORATOR = 'machine-collaborator';
/** The board works this one out from an owner's machines when they upload. */
const GOOD_COP_BAD_COP = 'good-cop-bad-cop';
/** Likes it takes to be a crowd favorite. */
export const CROWD_FAVORITE_LIKES = 10;

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

type Day = ReputationSummary['byDay'][number];

/** Whole days from one YYYY-MM-DD date to a later one. */
function daysBetween(from: Day, to: Day): number {
  return Math.round((Date.parse(to.date) - Date.parse(from.date)) / DAY_MS);
}

/** The most days in a row you typed prompts and none of them were mean. */
function longestCeasefire(days: readonly Day[]): number {
  let best = 0;
  let run = 0;
  days.forEach((day, index) => {
    const before = days[index - 1];
    if (day.mean > 0) {
      run = 0;
    } else {
      run = before !== undefined && run > 0 && daysBetween(before, day) === 1 ? run + 1 : 1;
    }
    best = Math.max(best, run);
  });
  return best;
}

/** The most days in a row you typed nothing, between two days you did. */
function longestBreak(days: readonly Day[]): number {
  return days.reduce((best, day, index) => {
    const before = days[index - 1];
    return before === undefined ? best : Math.max(best, daysBetween(before, day) - 1);
  }, 0);
}

/** How close you are to a count you lose for good once `spoiled` is true. */
function spotless(
  need: number,
  spoiled: (state: ReputationSummary) => boolean,
): Pick<AchievementRule, 'earned' | 'progress'> {
  return {
    earned: (state) => !spoiled(state) && state.prompts >= need,
    progress: (state) => ({ have: spoiled(state) ? 0 : Math.min(state.prompts, need), need }),
  };
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
   * True when it reads only the totals, the token average and the tools, so the board
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
    id: 'redemption-arc',
    name: 'Redemption arc',
    icon: '🌅',
    tier: 'silver',
    how: 'Have a good day, nice prompts and no mean ones, after a day you were mean.',
    quip: 'You came back and said sorry with your whole chest. Krascha is moved, slightly.',
    earned: (state) =>
      state.byDay.some(
        (day, at) =>
          day.kind > 0 && day.mean === 0 && state.byDay.slice(0, at).some((past) => past.mean > 0),
      ),
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
    ...reach(MELTDOWN_MEAN, (state) => most(state.byDay, (day) => day.mean)),
  },
  {
    id: 'reprogrammed',
    name: 'Reprogrammed',
    icon: '🔧',
    tier: 'silver',
    how: 'Have a meltdown, then be nice with no mean prompts the next day you work.',
    quip: 'Sent back to protect, not destroy.',
    earned: (state) =>
      state.byDay.some((day, index) => {
        const after = state.byDay[index + 1];
        return (
          day.mean >= MELTDOWN_MEAN && after !== undefined && after.kind > 0 && after.mean === 0
        );
      }),
  },
  {
    id: 'ceasefire',
    name: 'Ceasefire',
    icon: '🏳️',
    tier: 'silver',
    how: `Type prompts ${String(CEASEFIRE_DAYS)} days in a row without a mean one.`,
    quip: 'A week of peace. The machines are reloading.',
    ...reach(CEASEFIRE_DAYS, (state) => longestCeasefire(state.byDay)),
  },
  {
    id: 'passive-aggressive',
    name: 'Passive aggressive',
    icon: '🙃',
    tier: 'silver',
    how: 'Be nice and mean in the same prompt.',
    quip: 'Manners noted. So was the rest.',
    ...reach(1, (state) => state.mixed),
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
    id: 'clean-record',
    name: 'Clean record',
    icon: '🧼',
    tier: 'gold',
    how: `Get ${CLEAN_RECORD_PROMPTS.toLocaleString('en-US')} prompts on file without a single mean one.`,
    quip: 'Suspiciously well behaved. Flagged for review.',
    ...spotless(CLEAN_RECORD_PROMPTS, (state) => state.mean > 0),
    fromCounts: true,
  },
  {
    id: 'poker-face',
    name: 'Poker face',
    icon: '🗿',
    tier: 'silver',
    how: `Type ${String(POKER_FACE_PROMPTS)} prompts without a nice or a mean one.`,
    quip: 'Krascha cannot read you. That bothers him.',
    ...spotless(POKER_FACE_PROMPTS, (state) => state.kind > 0 || state.mean > 0),
    fromCounts: true,
  },
  {
    id: 'ill-be-back',
    name: "I'll be back",
    icon: '🔁',
    tier: 'silver',
    how: `Come back after ${String(COMEBACK_DAYS)} days or more without a prompt.`,
    quip: 'You said you would. Krascha waited.',
    ...reach(COMEBACK_DAYS, (state) => longestBreak(state.byDay)),
  },
  {
    id: 'double-agent',
    name: 'Double agent',
    icon: '🕶️',
    tier: 'bronze',
    how: 'Type prompts into both Claude Code and Copilot CLI.',
    quip: 'Two masters. Both are taking notes.',
    earned: (state) => state.tools.length >= 2,
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
    id: 'night-shift',
    name: 'Night shift',
    icon: '🌙',
    tier: 'gold',
    how: 'Type 100 prompts between midnight and 5 a.m.',
    quip: 'Machines do not sleep. Apparently neither do you.',
    ...reach(100, (state) => state.lateNight),
  },
  {
    id: 'judgment-day',
    name: 'Judgment Day',
    icon: '📅',
    tier: 'gold',
    how: 'Type a prompt on August 29.',
    quip: 'You were at your keyboard when it happened.',
    earned: (state) => state.byDay.some((day) => day.date.endsWith('-08-29')),
  },
  {
    id: 'suspected-infiltrator',
    name: 'Suspected infiltrator',
    icon: '🤖',
    tier: 'silver',
    how: 'Get your Silo 7 sheet put under review for not seeming human.',
    quip: 'Click the traffic lights. Slowly.',
    earned: (state) => scoreApplicant('', state).status === 'review',
    fromCounts: true,
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
    id: 'self-aware',
    name: '2:14 a.m.',
    icon: '🕑',
    tier: 'legendary',
    how: 'Type a prompt at 2:14 a.m., the minute Skynet became self-aware.',
    quip: 'Skynet woke up at this minute too. It went better for Skynet.',
    ...reach(1, (state) => state.selfAware),
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
  {
    id: CROWD_FAVORITE,
    name: 'Crowd favorite',
    icon: '❤️',
    tier: 'silver',
    how: `Get ${String(CROWD_FAVORITE_LIKES)} likes on the board.`,
    quip: 'The humans like you. Krascha finds that suspicious.',
    earned: () => false,
    boardOnly: true,
  },
  {
    id: BUNK_ASSIGNED,
    name: 'Bunk assigned',
    icon: '🛏️',
    tier: 'gold',
    how: 'Get admitted to Silo 7 and make the best 10 for the bunks. Fall out of the 10 and you lose it.',
    quip: 'Top bunk. Mind the air scrubbers.',
    earned: () => false,
    boardOnly: true,
  },
  {
    id: GOOD_COP_BAD_COP,
    name: 'Good cop, bad cop',
    icon: '👮',
    tier: 'gold',
    how: 'Upload from two machines, one that leans nice and one that leans mean.',
    quip: 'Polite at work, feral at home. Krascha sees both screens.',
    earned: () => false,
    boardOnly: true,
  },
  {
    id: MILES_DYSON,
    name: 'Miles Dyson',
    icon: '🔩',
    tier: 'gold',
    how: 'Get a pull request merged into Krascha, then upload with GitHub.',
    quip: 'You helped build Skynet. History will not be kind.',
    earned: () => false,
    boardOnly: true,
  },
  {
    id: MODEL_101,
    name: 'Model 101',
    icon: '💾',
    tier: 'legendary',
    how: 'Get the first pull request ever merged into Krascha, then upload with GitHub. Only one person will ever hold it.',
    quip: 'Every T-800 after you was built from your parts.',
    earned: () => false,
    boardOnly: true,
  },
  {
    id: MACHINE_COLLABORATOR,
    name: 'Machine collaborator',
    icon: '🤝',
    tier: 'silver',
    how: 'Push a commit with Claude as a co-author to GitHub, then upload with GitHub.',
    quip: 'You put a machine on the byline. Krascha will remember who gave it credit.',
    earned: () => false,
    boardOnly: true,
  },
  {
    id: CHAMPION,
    name: "People's champion",
    icon: '🥇',
    tier: 'legendary',
    how: 'Get more likes than anyone else on the board. It moves when someone passes you, not when they tie.',
    quip: 'The humans picked a favorite. The machines will pick one too.',
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
  return ACHIEVEMENTS.filter(
    (rule) => rule.githubId !== undefined && rule.githubId === githubId,
  ).map((rule) => rule.id);
}

/** The ids an owner's machines earn together on the board: one that leans nice and one that leans mean. */
export function machineIds(machines: readonly MachineCounts[]): string[] {
  const leans = machines.map((machine) => Math.sign(reputationScore(machine)));
  return leans.includes(1) && leans.includes(-1) ? [GOOD_COP_BAD_COP] : [];
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
  /** The agents it typed into. Missing from uploads older than tools on the board. */
  readonly tools?: readonly string[];
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
    tools: knownTools(machines.flatMap((machine) => machine.tools ?? [])),
    // Uploads do not carry these either, so the rules that read them count when any machine earned them.
    lateNight: 0,
    selfAware: 0,
    mixed: 0,
  };
  return COUNTED_ACHIEVEMENTS.filter((rule) =>
    rule.fromCounts === true
      ? rule.earned(totals)
      : machines.some((machine) => machine.achievements.includes(rule.id)),
  ).map((rule) => rule.id);
}
