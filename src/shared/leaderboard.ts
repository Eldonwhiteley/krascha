// The global Reputation leaderboard, shared by the Cloudflare Worker that
// serves it and the CLI that uploads to it and shows it.
// An upload carries a display name, three counts, your average tokens a day,
// the ids of the achievements you have unlocked and how many times you earned
// the ones you can earn again, the agents you use and a random id for the
// machine they came from, nothing else.

/** The Cloudflare Worker that serves the board. */
export const LEADERBOARD_URL = 'https://krascha.com';
/** Anyone with fewer prompts on file is left off the board, since a short history is mostly noise. */
export const MIN_PROMPTS = 100;
/** Rows in each list. */
export const BOARD_SIZE = 10;
/** Uploads one person may make in a UTC day. */
export const UPLOADS_PER_DAY = 8;
/** Entries without a GitHub check one network may start in a UTC day, so nobody fills the board with made-up keys. */
export const NEW_ENTRIES_PER_DAY = 3;
/** A key the CLI makes up for uploading without GitHub: random base64url text. */
export const KEY_PATTERN = /^[\w-]{32,128}$/u;
export const MAX_NAME_LENGTH = 40;
/** A GitHub login: letters, digits and hyphens, 39 at most, not starting with a hyphen. */
export const GITHUB_LOGIN_PATTERN = /^[a-z\d][a-z\d-]{0,38}$/iu;
/**
 * Achievement ids one upload may carry. A number rather than ACHIEVEMENTS.length,
 * since achievements.ts depends on this file through reputation.ts and importing
 * it back would make a cycle. achievements.test.ts keeps the list under it.
 */
export const MAX_ACHIEVEMENTS = 64;
/** Past anything one person does, so a higher count of one achievement is junk. */
export const MAX_REPEAT = 1_000_000;
/** Agent ids one upload may carry, with room for agents Krascha reads later. */
export const MAX_TOOLS = 8;
/** A trillion tokens a day is past anything one person runs, so anything above it is junk. */
export const MAX_TOKENS_PER_DAY = 1_000_000_000_000;
/**
 * What this copy of Krascha knows beyond its achievements. Bump it when he
 * learns something the board shows that is not a new achievement, so older
 * copies see they are behind and update. 1 covers everything up to updating
 * himself, and 2 sends it with each upload.
 */
export const FEATURES = 2;
/**
 * The oldest FEATURES the board takes an upload from. Copies older than it
 * get told to update instead, since they count things wrong or miss them.
 * Raise it to make every copy update before its next upload.
 */
export const MIN_UPLOAD_FEATURES = 2;
/** The status the board answers a copy older than MIN_UPLOAD_FEATURES with. */
export const TOO_OLD = 426;
/** Shown for anyone who uploads without a name. */
export const ANONYMOUS = 'Anonymous';

/** How many times each achievement was earned, by id, for the ones earned more than once. */
export type Repeats = Readonly<Record<string, number>>;

/** What an upload sends, and all it sends. An empty name shows as Anonymous. */
export interface ScoreUpload {
  readonly name: string;
  readonly kind: number;
  readonly mean: number;
  readonly prompts: number;
  /** Ids from ACHIEVEMENTS. Missing from builds older than achievements on the board. */
  readonly achievements?: readonly string[];
  /** How many times you earned the ones you earned more than once. Missing from builds older than counts on the board. */
  readonly repeats?: Repeats;
  /** Average tokens a day over the last 60 days. Missing from builds older than tokens on the board. */
  readonly tokensPerDay?: number;
  /** Ids from TOOLS for the agents you typed into. Missing from builds older than tools on the board. */
  readonly tools?: readonly string[];
  /**
   * A random id for the machine the counts come from, so uploads from your
   * machines add up. Missing from older builds, whose upload replaces them all.
   */
  readonly machine?: string;
  /** This copy's FEATURES. Missing from builds older than 2, which the board turns away. */
  readonly features?: number;
}

/** One person on the board. The id is random, not their GitHub id. */
export interface BoardEntry {
  readonly id: string;
  readonly name: string;
  /** True when the upload came with a GitHub token the server checked. */
  readonly verified: boolean;
  /** The GitHub login of a checked entry, for a link to the account. Missing otherwise. */
  readonly github?: string;
  readonly rank: string;
  readonly score: number;
  readonly kind: number;
  readonly mean: number;
  readonly prompts: number;
  readonly uploadedAt: number;
  /** Unlocked achievement ids, in list order. Missing from a server older than achievements on the board. */
  readonly achievements?: readonly string[];
  /** How many times it earned the ones it earned more than once. Missing when none were, and from a server older than counts on the board. */
  readonly repeats?: Repeats;
  /** 0 for an upload without it. Missing from a server older than tokens on the board. */
  readonly tokensPerDay?: number;
  /** Ids from TOOLS, in list order. Empty for an upload without them, and missing from a server older than tools on the board. */
  readonly tools?: readonly string[];
  /** How many likes visitors to the board gave it. Missing from a server older than likes on the board. */
  readonly likes?: number;
}

/** An achievement counts can earn, as the server names it, so an older CLI can say what it is missing. */
export interface KnownAchievement {
  readonly id: string;
  readonly name: string;
}

/** Where one entry stands. Place is counted from the most wanted, and is null below MIN_PROMPTS. */
export interface Standing {
  readonly entry: BoardEntry;
  readonly place: number | null;
  /** How many machines the entry adds up. Only in the answer to an upload, and missing from older servers. */
  readonly machines?: number;
  /** Place in the line for the Silo 7 bunks, the best first. Missing from a server older than the silo on the board. */
  readonly siloPlace?: number | null;
  /** The achievements counts can earn on the server. Only in the answer to an upload, and missing from older servers. */
  readonly counted?: readonly KnownAchievement[];
  /** The board's FEATURES. Only in the answer to an upload, and missing from older servers. */
  readonly features?: number;
}

export interface Board {
  /** The scores below 0, the most wanted first. */
  readonly mostWanted: readonly BoardEntry[];
  /** The scores above 0, the most loved first. */
  readonly pets: readonly BoardEntry[];
  /** The best Silo 7 totals out of everyone. Missing from a server older than the silo on the board. */
  readonly bunks?: readonly BoardEntry[];
  /** The most tokens a day, the warmest first. Missing from a server older than climate on the board. */
  readonly warmers?: readonly BoardEntry[];
  /** Everyone with at least MIN_PROMPTS. */
  readonly total: number;
  /** How many of them hold each achievement, by id. Missing from a server older than the count. */
  readonly held?: Readonly<Record<string, number>>;
  /** How many of them hold each rank, by rank name. Missing from a server older than the count. */
  readonly ranks?: Readonly<Record<string, number>>;
  /** Who holds Most decorated, or null when nobody does. Missing from a server older than the crown. */
  readonly crown?: BoardEntry | null;
  /** Who holds People's champion, or null when nobody does. Missing from a server older than it. */
  readonly champion?: BoardEntry | null;
  /** Who holds Uses stone tools, or null when nobody does. Missing from a server older than it. */
  readonly stoneTools?: BoardEntry | null;
  /** Who holds Fewest badges, or null when nobody does. Missing from a server older than it. */
  readonly fewestBadges?: BoardEntry | null;
  /** The caller's own entry, when the request named one. */
  readonly me: Standing | null;
  /** The achievements counts can earn on the server. Only from /api/board, and missing from older servers. */
  readonly counted?: readonly KnownAchievement[];
  /** The board's FEATURES. Only from /api/board, and missing from older servers. */
  readonly features?: number;
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

function isRepeats(value: unknown, max: number): value is Repeats {
  if (!isRecord(value)) {
    return false;
  }
  const entries = Object.entries(value);
  return (
    entries.length <= max &&
    entries.every(
      ([id, times]) => id.length <= MAX_NAME_LENGTH && isCount(times) && times <= MAX_REPEAT,
    )
  );
}

function isKnownList(value: unknown): value is readonly KnownAchievement[] {
  return (
    isList(value) &&
    value.every(
      (rule) =>
        isRecord(rule) && typeof rule['id'] === 'string' && typeof rule['name'] === 'string',
    )
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
    (value['repeats'] === undefined || isRepeats(value['repeats'], MAX_ACHIEVEMENTS)) &&
    isTokens(value['tokensPerDay'], MAX_TOKENS_PER_DAY) &&
    (value['tools'] === undefined || isIdList(value['tools'], MAX_TOOLS)) &&
    (value['machine'] === undefined ||
      (typeof value['machine'] === 'string' && KEY_PATTERN.test(value['machine']))) &&
    (value['features'] === undefined || isCount(value['features']))
  );
}

function isBoardEntry(value: unknown): value is BoardEntry {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['verified'] === 'boolean' &&
    (value['github'] === undefined ||
      (typeof value['github'] === 'string' && GITHUB_LOGIN_PATTERN.test(value['github']))) &&
    typeof value['rank'] === 'string' &&
    typeof value['score'] === 'number' &&
    isCount(value['kind']) &&
    isCount(value['mean']) &&
    isCount(value['prompts']) &&
    typeof value['uploadedAt'] === 'number' &&
    (value['achievements'] === undefined || isIdList(value['achievements'], Infinity)) &&
    (value['repeats'] === undefined || isRepeats(value['repeats'], Infinity)) &&
    isTokens(value['tokensPerDay'], Infinity) &&
    (value['tools'] === undefined || isIdList(value['tools'], Infinity)) &&
    (value['likes'] === undefined || isCount(value['likes']))
  );
}

export function isStanding(value: unknown): value is Standing {
  return (
    isRecord(value) &&
    isBoardEntry(value['entry']) &&
    (value['place'] === null || isCount(value['place'])) &&
    (value['machines'] === undefined || isCount(value['machines'])) &&
    (value['counted'] === undefined || isKnownList(value['counted'])) &&
    (value['features'] === undefined || isCount(value['features']))
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
    (value['warmers'] === undefined ||
      (Array.isArray(value['warmers']) && value['warmers'].every(isBoardEntry))) &&
    isCount(value['total']) &&
    (value['held'] === undefined ||
      (isRecord(value['held']) && Object.values(value['held']).every(isCount))) &&
    (value['ranks'] === undefined ||
      (isRecord(value['ranks']) && Object.values(value['ranks']).every(isCount))) &&
    (value['crown'] === undefined || value['crown'] === null || isBoardEntry(value['crown'])) &&
    (value['champion'] === undefined ||
      value['champion'] === null ||
      isBoardEntry(value['champion'])) &&
    (value['stoneTools'] === undefined ||
      value['stoneTools'] === null ||
      isBoardEntry(value['stoneTools'])) &&
    (value['fewestBadges'] === undefined ||
      value['fewestBadges'] === null ||
      isBoardEntry(value['fewestBadges'])) &&
    (value['me'] === null || isStanding(value['me'])) &&
    (value['counted'] === undefined || isKnownList(value['counted'])) &&
    (value['features'] === undefined || isCount(value['features']))
  );
}
