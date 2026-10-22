// What Krascha remembers about your leaderboard entry, in his data folder:
// the entry's random id, the name you last chose, how your uploads prove they
// are yours, the key he made up if you upload without GitHub, how many
// prompts and which achievements you had at the last upload, which
// achievements and features the board could count when he last asked it, and
// when he last tried to update himself. This machine's id sits in a file of
// its own.

import path from 'node:path';

import { readJsonOrUndefined, readOptional, writeFileAtomic } from '../files.js';
import type { KnownAchievement } from '../shared/leaderboard.js';
import { KEY_PATTERN } from '../shared/leaderboard.js';

export const SAVED_FILE = 'leaderboard.json';
export const MACHINE_FILE = 'machine-id';

export interface SavedEntry {
  /** Null until the first upload, and again after removing it. */
  readonly entryId: string | null;
  /** The name you last uploaded under. Empty is anonymous, null is never chosen. */
  readonly name: string | null;
  /** How the entry was made, so later uploads replace it. Null with no entry. */
  readonly auth: 'github' | 'key' | null;
  /** The key for uploading without GitHub. Kept after a removal so it is reused. */
  readonly key: string | null;
  /** Your prompt count at the last upload, so Krascha can tell when the board is behind. */
  readonly uploadedPrompts: number | null;
  /** Your achievement ids at the last upload, so Krascha can tell when the board is missing new ones. */
  readonly uploadedAchievements: readonly string[] | null;
  /** The achievements the board could count when Krascha last asked it, so he can tell when this copy is behind. */
  readonly boardAchievements: readonly KnownAchievement[] | null;
  /** The board's FEATURES when Krascha last asked it, so he can tell when this copy is behind on more than achievements. */
  readonly boardFeatures: number | null;
  /** When Krascha last started updating himself, so he tries at most once a day. Null when this copy is not behind. */
  readonly updateTriedAt: number | null;
}

export const NO_ENTRY: SavedEntry = {
  entryId: null,
  name: null,
  auth: null,
  key: null,
  uploadedPrompts: null,
  uploadedAchievements: null,
  boardAchievements: null,
  boardFeatures: null,
  updateTriedAt: null,
};

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function textsOrNull(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
}

function achievementsOrNull(value: unknown): KnownAchievement[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const known = value.flatMap((rule: unknown): KnownAchievement[] => {
    const field = (key: string): string | null =>
      typeof rule === 'object' && rule !== null ? textOrNull(Reflect.get(rule, key)) : null;
    const id = field('id');
    const name = field('name');
    return id === null || name === null ? [] : [{ id, name }];
  });
  return known.length === value.length ? known : null;
}

export async function loadSaved(storageDir: string): Promise<SavedEntry> {
  const data = await readJsonOrUndefined(path.join(storageDir, SAVED_FILE));
  if (typeof data !== 'object' || data === null) {
    return NO_ENTRY;
  }
  const auth: unknown = Reflect.get(data, 'auth');
  return {
    entryId: textOrNull(Reflect.get(data, 'entryId')),
    name: textOrNull(Reflect.get(data, 'name')),
    auth: auth === 'github' || auth === 'key' ? auth : null,
    key: textOrNull(Reflect.get(data, 'key')),
    uploadedPrompts: numberOrNull(Reflect.get(data, 'uploadedPrompts')),
    uploadedAchievements: textsOrNull(Reflect.get(data, 'uploadedAchievements')),
    boardAchievements: achievementsOrNull(Reflect.get(data, 'boardAchievements')),
    boardFeatures: numberOrNull(Reflect.get(data, 'boardFeatures')),
    updateTriedAt: numberOrNull(Reflect.get(data, 'updateTriedAt')),
  };
}

export async function saveSaved(storageDir: string, saved: SavedEntry): Promise<void> {
  await writeFileAtomic(path.join(storageDir, SAVED_FILE), `${JSON.stringify(saved, null, 2)}\n`);
}

/**
 * This machine's random id, made the first time, so its uploads add to your
 * other machines' instead of replacing them. It is kept out of SAVED_FILE so
 * copying that file to another machine shares the key but not the id.
 */
export async function loadMachine(storageDir: string, newId: () => string): Promise<string> {
  const file = path.join(storageDir, MACHINE_FILE);
  const known = (await readOptional(file))?.trim();
  if (known !== undefined && KEY_PATTERN.test(known)) {
    return known;
  }
  const id = newId();
  await writeFileAtomic(file, `${id}\n`);
  return id;
}
