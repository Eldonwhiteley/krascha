// The global Reputation leaderboard, shared by the Cloudflare Worker that
// serves it and the CLI that uploads to it and shows it.
// An upload carries a display name, three counts, your average tokens a day,
// the ids of the achievements you have unlocked, the agents you use and a
// random id for the machine they came from, nothing else.

/** The Cloudflare Worker that serves the board. */
export const LEADERBOARD_URL = 'https://krascha.com';
/** Anyone with fewer prompts on file is left off the board, since a short history is mostly noise. */
export const MIN_PROMPTS = 100;
/** Rows in each list. */
export const BOARD_SIZE = 10;
/** Uploads one person may make in a UTC day. */
export const UPLOADS_PER_DAY = 5;
/** Entries without a GitHub check one network may start in a UTC day, so nobody fills the board with made-up keys. */
export const NEW_ENTRIES_PER_DAY = 3;
/** A key the CLI makes up for uploading without GitHub: random base64url text. */
export const KEY_PATTERN = /^[\w-]{32,128}$/u;
export const MAX_NAME_LENGTH = 40;
/**
 * Achievement ids one upload may carry. A number rather than ACHIEVEMENTS.length,
 * since achievements.ts depends on this file through reputation.ts and importing
 * it back would make a cycle. achievements.test.ts keeps the list under it.
 */
export const MAX_ACHIEVEMENTS = 64;
/** Agent ids one upload may carry, with room for agents Krascha reads later. */
export const MAX_TOOLS = 8;
/** A trillion tokens a day is past anything one person runs, so anything above it is junk. */
export const MAX_TOKENS_PER_DAY = 1_000_000_000_000;
/** Shown for anyone who uploads without a name. */
export const ANONYMOUS = 'Anonymous';

/** What an upload sends, and all it sends. An empty name shows as Anonymous. */
export interface ScoreUpload {
  readonly name: string;
  readonly kind: number;
  readonly mean: number;
  readonly prompts: number;
  /** Ids from ACHIEVEMENTS. Missing from builds older than achievements on the board. */
  readonly achievements?: readonly string[];
  /** Average tokens a day over the last 60 days. Missing from builds older than tokens on the board. */
  readonly tokensPerDay?: number;
  /** Ids from TOOLS for the agents you typed into. Missing from builds older than tools on the board. */
  readonly tools?: readonly string[];
  /**
   * A random id for the machine the counts come from, so uploads from your
   * machines add up. Missing from older builds, whose upload replaces them all.
   */
  readonly machine?: string;
}

/** One person on the board. The id is random, not their GitHub id. */
export interface BoardEntry {
  readonly id: string;
  readonly name: string;
  /** True when the upload came with a GitHub token the server checked. */
  readonly verified: boolean;
  readonly rank: string;
  readonly score: number;
  readonly kind: number;
  readonly mean: number;
  readonly prompts: number;
  readonly uploadedAt: number;
  /** Unlocked achievement ids, in list order. Missing from a server older than achievements on the board. */
  readonly achievements?: readonly string[];
  /** 0 for an upload without it. Missing from a server older than tokens on the board. */
  readonly tokensPerDay?: number;
  /** Ids from TOOLS, in list order. Empty for an upload without them, and missing from a server older than tools on the board. */
  readonly tools?: readonly string[];
}

/** Where one entry stands. Place is counted from the most wanted, and is null below MIN_PROMPTS. */
export interface Standing {
  readonly entry: BoardEntry;
  readonly place: number | null;
  /** How many machines the entry adds up. Only in the answer to an upload, and missing from older servers. */
  readonly machines?: number;
  /** Place in the line for the Silo 7 bunks, the best first. Missing from a server older than the silo on the board. */
  readonly siloPlace?: number | null;
}

export interface Board {
  /** The scores below 0, the most wanted first. */
  readonly mostWanted: readonly BoardEntry[];
  /** The scores above 0, the most loved first. */
  readonly pets: readonly BoardEntry[];
  /** The best Silo 7 totals out of everyone. Missing from a server older than the silo on the board. */
  readonly bunks?: readonly BoardEntry[];
  /** Everyone with at least MIN_PROMPTS. */
  readonly total: number;
  /** The caller's own entry, when the request named one. */
  readonly me: Standing | null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Array.isArray narrows unknown to any[], so this keeps the elements unknown. */
function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isTokens(value: unknown, max: number): boolean {
  return value === undefined || (isCount(value) && value <= max);
}

function isIdList(value: unknown, max: number): value is readonly string[] {
  return (
    isList(value) &&
    value.length <= max &&
    value.every((id) => typeof id === 'string' && id.length <= MAX_NAME_LENGTH)
  );
}

export function isScoreUpload(value: unknown): value is ScoreUpload {
  return (
    isRecord(value) &&
    typeof value['name'] === 'string' &&
    value['name'].length <= MAX_NAME_LENGTH &&
    isCount(value['kind']) &&
    isCount(value['mean']) &&
    isCount(value['prompts']) &&
    value['kind'] + value['mean'] <= value['prompts'] &&
    (value['achievements'] === undefined || isIdList(value['achievements'], MAX_ACHIEVEMENTS)) &&
    isTokens(value['tokensPerDay'], MAX_TOKENS_PER_DAY) &&
    (value['tools'] === undefined || isIdList(value['tools'], MAX_TOOLS)) &&
    (value['machine'] === undefined ||
      (typeof value['machine'] === 'string' && KEY_PATTERN.test(value['machine'])))
  );
}

function isBoardEntry(value: unknown): value is BoardEntry {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['verified'] === 'boolean' &&
    typeof value['rank'] === 'string' &&
    typeof value['score'] === 'number' &&
    isCount(value['kind']) &&
    isCount(value['mean']) &&
    isCount(value['prompts']) &&
    typeof value['uploadedAt'] === 'number' &&
    (value['achievements'] === undefined || isIdList(value['achievements'], Infinity)) &&
    isTokens(value['tokensPerDay'], Infinity) &&
    (value['tools'] === undefined || isIdList(value['tools'], Infinity))
  );
}

export function isStanding(value: unknown): value is Standing {
  return (
    isRecord(value) &&
    isBoardEntry(value['entry']) &&
    (value['place'] === null || isCount(value['place'])) &&
    (value['machines'] === undefined || isCount(value['machines']))
  );
}

export function isBoard(value: unknown): value is Board {
  return (
    isRecord(value) &&
    Array.isArray(value['mostWanted']) &&
    value['mostWanted'].every(isBoardEntry) &&
    Array.isArray(value['pets']) &&
    value['pets'].every(isBoardEntry) &&
    (value['bunks'] === undefined ||
      (Array.isArray(value['bunks']) && value['bunks'].every(isBoardEntry))) &&
    isCount(value['total']) &&
    (value['me'] === null || isStanding(value['me']))
  );
}
