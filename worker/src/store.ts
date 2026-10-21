// The leaderboard's tables in Cloudflare D1: a row per owner, each of the
// owner's machines that row adds up, and a count of the unverified entries
// each network started today. The D1 types here are the few calls this file makes, so the Worker needs no
// Cloudflare type package.

import type { MachineCounts } from '../../src/shared/achievements.js';
import { combinedIds, knownIds } from '../../src/shared/achievements.js';
import type { Board, BoardEntry, ScoreUpload, Standing } from '../../src/shared/leaderboard.js';
import {
  ANONYMOUS,
  BOARD_SIZE,
  MIN_PROMPTS,
  NEW_ENTRIES_PER_DAY,
  UPLOADS_PER_DAY,
} from '../../src/shared/leaderboard.js';
import { rankFor } from '../../src/shared/ranks.js';
import { reputationScore } from '../../src/shared/reputation.js';

export type Row = Readonly<Record<string, unknown>>;

export interface D1Statement {
  bind: (...values: readonly (string | number)[]) => D1Statement;
  first: () => Promise<Row | null>;
  all: () => Promise<{ readonly results: readonly Row[] }>;
  run: () => Promise<unknown>;
}

export interface D1Database {
  prepare: (query: string) => D1Statement;
}

/** Who an upload belongs to: "github:<id>" when GitHub vouched for it, else "key:<hash>". */
export interface Owner {
  readonly id: string;
  readonly verified: boolean;
}

const COLUMNS =
  'entry_id, name, verified, kind, mean, prompts, score, uploaded_at, achievements, tokens_per_day';
const LISTED = `prompts >= ${String(MIN_PROMPTS)}`;

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') {
    throw new TypeError(`column ${key} is not text`);
  }
  return value;
}

function number_(row: Row, key: string): number {
  const value = row[key];
  if (typeof value !== 'number') {
    throw new TypeError(`column ${key} is not a number`);
  }
  return value;
}

function entryOf(row: Row): BoardEntry {
  const name = text(row, 'name');
  const score = number_(row, 'score');
  return {
    id: text(row, 'entry_id'),
    name: name === '' ? ANONYMOUS : name,
    verified: number_(row, 'verified') === 1,
    rank: rankFor(score).name,
    score,
    kind: number_(row, 'kind'),
    mean: number_(row, 'mean'),
    prompts: number_(row, 'prompts'),
    uploadedAt: number_(row, 'uploaded_at'),
    // Dropping unknown ids means a retired achievement just stops showing.
    achievements: knownIds(text(row, 'achievements').split(',')),
    tokensPerDay: number_(row, 'tokens_per_day'),
  };
}

/** UTC calendar date, YYYY-MM-DD, which is when the upload cap resets. */
export function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** Trims the name, drops control characters and squeezes runs of spaces. */
export function cleanName(name: string): string {
  return name
    .replaceAll(/\p{Cc}/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}

/** The most wanted have scores below 0 and the pets above it, so nobody is on both lists. */
async function list(database: D1Database, side: 'wanted' | 'pets'): Promise<BoardEntry[]> {
  const where = side === 'wanted' ? 'score < 0' : 'score > 0';
  const order = side === 'wanted' ? 'ASC' : 'DESC';
  const { results } = await database
    .prepare(
      `SELECT ${COLUMNS} FROM scores WHERE ${LISTED} AND ${where} ORDER BY score ${order}, uploaded_at ASC LIMIT ?`,
    )
    .bind(BOARD_SIZE)
    .all();
  return results.map((row) => entryOf(row));
}

async function total(database: D1Database): Promise<number> {
  const row = await database.prepare(`SELECT COUNT(*) AS n FROM scores WHERE ${LISTED}`).first();
  return row === null ? 0 : number_(row, 'n');
}

/** An entry and its place counted from the most wanted, or null when it is not listed. */
async function standingOf(database: D1Database, row: Row): Promise<Standing> {
  const entry = entryOf(row);
  if (entry.prompts < MIN_PROMPTS) {
    return { entry, place: null };
  }
  const ahead = await database
    .prepare(
      `SELECT COUNT(*) AS n FROM scores WHERE ${LISTED} AND (score < ? OR (score = ? AND uploaded_at < ?))`,
    )
    .bind(entry.score, entry.score, entry.uploadedAt)
    .first();
  return { entry, place: (ahead === null ? 0 : number_(ahead, 'n')) + 1 };
}

export async function readBoard(database: D1Database, me: string | null): Promise<Board> {
  const [mostWanted, pets, count] = await Promise.all([
    list(database, 'wanted'),
    list(database, 'pets'),
    total(database),
  ]);
  const mine =
    me === null
      ? null
      : await database.prepare(`SELECT ${COLUMNS} FROM scores WHERE entry_id = ?`).bind(me).first();
  return {
    mostWanted,
    pets,
    total: count,
    me: mine === null ? null : await standingOf(database, mine),
  };
}

export type SaveResult =
  | { readonly ok: true; readonly standing: Standing }
  | { readonly ok: false; readonly reason: 'limit' | 'new-entries' };

/**
 * Saves an upload over the last one from the same machine and adds up the
 * owner's machines. The score is worked out here from the counts, so a client
 * cannot send a score that does not match them.
 */
export interface Save {
  readonly owner: Owner;
  readonly upload: ScoreUpload;
  readonly now: number;
  /** A fresh entry id, used for an owner's first upload. */
  readonly newId: () => string;
  /** A hash of the network the upload came from, for the cap on new unverified entries. */
  readonly origin: string;
}

/** Counts a new unverified entry from `origin`, or false when it already started its share today. */
async function claimNewEntry(database: D1Database, origin: string, day: string): Promise<boolean> {
  await database.prepare('DELETE FROM new_entries WHERE day <> ?').bind(day).run();
  const row = await database
    .prepare('SELECT count FROM new_entries WHERE origin = ? AND day = ?')
    .bind(origin, day)
    .first();
  if (row !== null && number_(row, 'count') >= NEW_ENTRIES_PER_DAY) {
    return false;
  }
  await database
    .prepare(
      `INSERT INTO new_entries (origin, day, count) VALUES (?, ?, 1)
       ON CONFLICT (origin, day) DO UPDATE SET count = count + 1`,
    )
    .bind(origin, day)
    .run();
  return true;
}

function machineOf(row: Row): MachineCounts {
  return {
    kind: number_(row, 'kind'),
    mean: number_(row, 'mean'),
    prompts: number_(row, 'prompts'),
    tokensPerDay: number_(row, 'tokens_per_day'),
    achievements: text(row, 'achievements').split(','),
  };
}

/**
 * Keeps the upload as its machine's last one and returns all the owner's
 * machines. An upload with no machine id is from an older build that sends
 * everything it knows, so it replaces the other machines, and the first one
 * with an id replaces it.
 */
async function saveMachine(
  database: D1Database,
  owner: Owner,
  upload: ScoreUpload,
): Promise<MachineCounts[]> {
  const machine = upload.machine ?? '';
  await database
    .prepare(
      machine === ''
        ? 'DELETE FROM machines WHERE owner = ?'
        : "DELETE FROM machines WHERE owner = ? AND machine = ''",
    )
    .bind(owner.id)
    .run();
  await database
    .prepare(
      `INSERT INTO machines (owner, machine, kind, mean, prompts, achievements, tokens_per_day)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (owner, machine) DO UPDATE SET
         kind = excluded.kind, mean = excluded.mean, prompts = excluded.prompts,
         achievements = excluded.achievements, tokens_per_day = excluded.tokens_per_day`,
    )
    .bind(
      owner.id,
      machine,
      upload.kind,
      upload.mean,
      upload.prompts,
      knownIds(upload.achievements ?? []).join(','),
      upload.tokensPerDay ?? 0,
    )
    .run();
  const { results } = await database
    .prepare('SELECT kind, mean, prompts, achievements, tokens_per_day FROM machines WHERE owner = ?')
    .bind(owner.id)
    .all();
  return results.map((row) => machineOf(row));
}

export async function saveScore(database: D1Database, save: Save): Promise<SaveResult> {
  const { owner, upload, now, newId } = save;
  const day = utcDay(now);
  const found = await database
    .prepare('SELECT entry_id, upload_day, uploads_today FROM scores WHERE owner = ?')
    .bind(owner.id)
    .first();
  const sameDay = found !== null && text(found, 'upload_day') === day;
  const uploadsToday = sameDay ? number_(found, 'uploads_today') : 0;
  if (uploadsToday >= UPLOADS_PER_DAY) {
    return { ok: false, reason: 'limit' };
  }
  if (found === null && !owner.verified && !(await claimNewEntry(database, save.origin, day))) {
    return { ok: false, reason: 'new-entries' };
  }
  const entryId = found === null ? newId() : text(found, 'entry_id');
  const machines = await saveMachine(database, owner, upload);
  const sum = (pick: (machine: MachineCounts) => number): number =>
    machines.reduce((total, machine) => total + pick(machine), 0);
  const kind = sum((machine) => machine.kind);
  const mean = sum((machine) => machine.mean);
  await database
    .prepare(
      `INSERT INTO scores (owner, verified, entry_id, name, kind, mean, prompts, score, uploaded_at, upload_day, uploads_today, achievements, tokens_per_day)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (owner) DO UPDATE SET
         name = excluded.name, kind = excluded.kind, mean = excluded.mean,
         prompts = excluded.prompts, score = excluded.score, uploaded_at = excluded.uploaded_at,
         upload_day = excluded.upload_day, uploads_today = excluded.uploads_today,
         achievements = excluded.achievements, tokens_per_day = excluded.tokens_per_day`,
    )
    .bind(
      owner.id,
      owner.verified ? 1 : 0,
      entryId,
      cleanName(upload.name),
      kind,
      mean,
      sum((machine) => machine.prompts),
      reputationScore({ kind, mean }),
      now,
      day,
      uploadsToday + 1,
      combinedIds(machines).join(','),
      sum((machine) => machine.tokensPerDay),
    )
    .run();
  const row = await database
    .prepare(`SELECT ${COLUMNS} FROM scores WHERE entry_id = ?`)
    .bind(entryId)
    .first();
  if (row === null) {
    throw new Error('the saved score could not be read back');
  }
  return {
    ok: true,
    standing: { ...(await standingOf(database, row)), machines: machines.length },
  };
}

export async function removeScore(database: D1Database, owner: Owner): Promise<void> {
  await database.prepare('DELETE FROM machines WHERE owner = ?').bind(owner.id).run();
  await database.prepare('DELETE FROM scores WHERE owner = ?').bind(owner.id).run();
}
