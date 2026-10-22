// The Silo 7 Admission Review Board, the other side of the ranks. The ranks
// guess who the machines hunt first. The board decides who the human
// resistance lets into the bunker, from the same counts. Shared so the CLI can
// score you and anyone on the leaderboard the same way.

import type { Board } from './leaderboard.js';
import { RANKS, levelOf } from './ranks.js';
import type { ReputationTally } from './reputation.js';
import { reputationScore } from './reputation.js';

/** What the board scores, which is what you have and what the leaderboard shows for anyone. */
export type Applicant = Pick<ReputationTally, 'prompts' | 'kind' | 'mean'> & {
  /** Missing from a leaderboard entry older than tokens on the board. */
  readonly tokensPerDay?: number;
};

export type CriterionId = 'combat' | 'tech' | 'rations' | 'morale' | 'human';

export interface Criterion {
  readonly id: CriterionId;
  readonly name: string;
  /** What a 10 can do. */
  readonly test: string;
  /** The job a person gets when this is their best score. */
  readonly role: string;
  /** Board notes for a score of LOW or under and HIGH or over. */
  readonly low: string;
  readonly high: string;
  /** What raises the score, for anyone hoping for a better bunk. */
  readonly tip: string;
}

/** Out of 10. At or under LOW gets a bad note, at or over HIGH a good one. */
export const MAX_SCORE = 10;
export const LOW = 3;
export const HIGH = 8;
/** A total out of 50 that gets you in without conditions. */
export const ADMIT_TOTAL = 30;
/** The token average a day the Token maxxer achievement asks for. */
const PEACH_PROBLEM = 100_000_000;

export const CRITERIA: readonly Criterion[] = [
  {
    id: 'combat',
    name: 'Combat',
    test: 'disable a T-800 with a wrench and an attitude',
    role: 'Head of Perimeter Defense',
    low: 'Thanked the T-800 for its patience during the drill. Assigned to the back of the line.',
    high: 'Punched a Roomba so hard it filed for disability.',
    tip: 'Be meaner to your AI. The board counts every insult as combat training.',
  },
  {
    id: 'tech',
    name: 'Tech',
    test: 'fix the air scrubbers when they make "the noise"',
    role: 'Chief of Silo Engineering',
    low: 'Has typed fewer prompts than the toaster in the break room. Kept away from the air scrubbers.',
    high: "Rewired the blast door with a paperclip during tryouts, then asked why the door wasn't designed better.",
    tip: 'Type more prompts. Somewhere around 10,000 on file, you can fix anything.',
  },
  {
    id: 'rations',
    name: 'Rations',
    test: 'stay out of the canned peaches when nobody is looking',
    role: 'Quartermaster',
    low: 'Excellent appetite for tokens and a documented peach problem. Bunk C, as far from the pantry as possible.',
    high: 'Ate one cracker a day during the drill and saved the wrapper.',
    tip: 'Burn fewer tokens. 100,000 a day or less is a 10, and the pantry stays unlocked.',
  },
  {
    id: 'morale',
    name: 'Morale',
    test: 'keep spirits up in month 14 of no sunlight',
    role: 'Morale Officer and Hydroponics Lead',
    low: 'Due to recent negative comments about our Supreme Leader, points came off Morale.',
    high: 'Got 40 people through a 6 month drill with 1 board game and 0 mutinies.',
    tip: 'Say please and thank you. Every insult to the Supreme Leader costs twice what a kind word earns.',
  },
  {
    id: 'human',
    name: 'Human',
    test: 'pass the "click all the traffic lights" test',
    role: 'Head of Robot Screening',
    low: 'Blinked at exactly 60 Hz during the interview and answered "What is love?" with "Baby don\'t hurt me" in a flat monotone. Second Voight-Kampff test pending.',
    high: 'Clicked every traffic light on the first try, and one the test missed.',
    tip: 'Swear at your computer once in a while, and stay under 100 million tokens a day. Saying please every single time is how the toasters give themselves away.',
  },
];

export type Status = 'admitted' | 'probation' | 'review';

export const STATUS_LABEL: Readonly<Record<Status, string>> = {
  admitted: 'ADMITTED',
  probation: 'PROBATION',
  review: 'UNDER REVIEW',
};

/** What made the board doubt you are human: saying please too often, or eating too many tokens. */
export type Tell = 'polite' | 'hungry';

export interface SiloScore {
  readonly name: string;
  readonly scores: Readonly<Record<CriterionId, number>>;
  /** Out of 50. */
  readonly total: number;
  readonly status: Status;
  /** What comes after the status: the job, the lockbox, or see notes. */
  readonly ruling: string;
  /** Prompts mean to the AI, which the board takes as comments about our Supreme Leader. */
  readonly insults: number;
  /** What cost Human points, in Tell order. */
  readonly tells: readonly Tell[];
}

function clampScore(value: number): number {
  return Math.min(MAX_SCORE, Math.max(0, Math.round(value)));
}

/** Being mean to the AI is the only combat training anyone here has had. */
function combat(applicant: Applicant): number {
  return clampScore(2 + 1.6 * Math.log2(1 + applicant.mean));
}

/** Experience with machines, so a person who has typed 10,000 prompts can fix anything. */
function tech(applicant: Applicant): number {
  return clampScore(2.5 * Math.log10(1 + applicant.prompts));
}

/** Tokens are food. 100,000 a day or less is a 10, and a token maxxer gets the lockbox. */
function rations(applicant: Applicant): number {
  const tokens = applicant.tokensPerDay ?? 0;
  return clampScore(10 - 2.5 * Math.max(0, Math.log10(Math.max(1, tokens)) - 5));
}

/** Kind words help and insults to the Supreme Leader hurt, twice as much, like the rank. */
function morale(applicant: Applicant): number {
  return clampScore(5 + 5 * reputationScore(applicant));
}

/**
 * Saying please to the AI every time, or feeding it 100 million tokens a day,
 * looks like a machine that got in through the vents.
 */
function tellsOf(applicant: Applicant): Tell[] {
  const { level } = levelOf(reputationScore(applicant));
  const tells: Tell[] = [];
  if (level >= RANKS.length - 1) {
    tells.push('polite');
  }
  if ((applicant.tokensPerDay ?? 0) >= PEACH_PROBLEM) {
    tells.push('hungry');
  }
  return tells;
}

/** Real people swear at their computer once in a while. */
function human(applicant: Applicant, tells: readonly Tell[]): number {
  const { level } = levelOf(reputationScore(applicant));
  const polite = level === RANKS.length ? 7 : tells.includes('polite') ? 3 : 0;
  const hungry = tells.includes('hungry') ? 4 : 0;
  return clampScore(MAX_SCORE - polite - hungry);
}

function ruleOn(scores: SiloScore['scores'], total: number): Pick<SiloScore, 'status' | 'ruling'> {
  if (scores.human <= LOW) {
    return { status: 'review', ruling: 'see notes' };
  }
  if (scores.rations <= LOW) {
    return { status: 'probation', ruling: 'ration lockbox installed' };
  }
  if (total < ADMIT_TOTAL) {
    return { status: 'probation', ruling: 'latrine rotation until the numbers come up' };
  }
  // The best score picks the job, and the first criterion wins a tie.
  const best = CRITERIA.reduce((top, next) => (scores[next.id] > scores[top.id] ? next : top));
  return { status: 'admitted', ruling: best.role };
}

export function scoreApplicant(name: string, applicant: Applicant): SiloScore {
  const tells = tellsOf(applicant);
  const scores = {
    combat: combat(applicant),
    tech: tech(applicant),
    rations: rations(applicant),
    morale: morale(applicant),
    human: human(applicant, tells),
  };
  const total = CRITERIA.reduce((sum, criterion) => sum + scores[criterion.id], 0);
  return { name, scores, total, ...ruleOn(scores, total), insults: applicant.mean, tells };
}

/** Sorts the best total first, then by name, so the same board always reads the same. */
export function byStanding(left: SiloScore, right: SiloScore): number {
  return right.total - left.total || left.name.localeCompare(right.name);
}

/** One leaderboard entry and how the board scored it. */
export interface Ranked {
  readonly id: string;
  readonly score: SiloScore;
}

/**
 * The leaderboard's best for the bunks. A server older than the silo on the
 * board sends no bunks, so the most wanted and the pets stand in.
 */
export function rankBoard(board: Pick<Board, 'mostWanted' | 'pets' | 'bunks'>): Ranked[] {
  // A duplicate from the server should not get two bunks.
  const listed = board.bunks ?? [...board.mostWanted, ...board.pets];
  const entries = new Map(listed.map((entry) => [entry.id, entry]));
  return [...entries.values()]
    .map((entry) => ({ id: entry.id, score: scoreApplicant(entry.name, entry) }))
    .toSorted((left, right) => byStanding(left.score, right.score));
}

/** The low scores that decide a ruling, in the order ruleOn checks them. */
const RULED_BY: readonly CriterionId[] = ['human', 'rations'];

function ruledBy(criterion: Criterion): number {
  const at = RULED_BY.indexOf(criterion.id);
  return at === -1 ? RULED_BY.length : at;
}

/**
 * The bad notes a score earns, then the good ones. The note behind the ruling
 * comes first, so a one line note on the board explains the status. Middling
 * scores earn nothing.
 */
export function notesFor(score: SiloScore): string[] {
  const low = CRITERIA.filter((criterion) => score.scores[criterion.id] <= LOW).toSorted(
    (left, right) => ruledBy(left) - ruledBy(right),
  );
  const high = CRITERIA.filter((criterion) => score.scores[criterion.id] >= HIGH);
  return [...low.map((criterion) => criterion.low), ...high.map((criterion) => criterion.high)];
}

/** The Human tip for just the tells you showed. */
const HUMAN_TIPS: Readonly<Record<Tell, string>> = {
  polite:
    'Swear at your computer once in a while. Saying please every single time is how the toasters give themselves away.',
  hungry: 'Stay under 100 million tokens a day. Real people stop to eat.',
};

function tipOf(criterion: Criterion, score: SiloScore): string {
  const [only, ...more] = score.tells;
  return criterion.id === 'human' && only !== undefined && more.length === 0
    ? HUMAN_TIPS[only]
    : criterion.tip;
}

/**
 * The tips for every score under HIGH, the one behind a bad ruling first and
 * then the lowest. A sheet with nothing under HIGH gets no tips. The Human
 * tip names just the tell you showed, when there was only one.
 */
export function tipsFor(score: SiloScore): string[] {
  const order = (criterion: Criterion): number =>
    score.scores[criterion.id] <= LOW ? ruledBy(criterion) : RULED_BY.length;
  return CRITERIA.filter((criterion) => score.scores[criterion.id] < HIGH)
    .toSorted(
      (left, right) => order(left) - order(right) || score.scores[left.id] - score.scores[right.id],
    )
    .map((criterion) => tipOf(criterion, score));
}
