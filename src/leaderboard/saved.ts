// What Skrusty remembers about your leaderboard entry, in his data folder:
// the entry's random id, the name you last chose, how your uploads prove they
// are yours, and the key he made up if you upload without GitHub.

import path from 'node:path';

import { readJsonOrUndefined, writeFileAtomic } from '../files.js';

export const SAVED_FILE = 'leaderboard.json';

export interface SavedEntry {
  /** Null until the first upload, and again after removing it. */
  readonly entryId: string | null;
  /** The name you last uploaded under. Empty is anonymous, null is never chosen. */
  readonly name: string | null;
  /** How the entry was made, so later uploads replace it. Null with no entry. */
  readonly auth: 'github' | 'key' | null;
  /** The key for uploading without GitHub. Kept after a removal so it is reused. */
  readonly key: string | null;
}

export const NO_ENTRY: SavedEntry = { entryId: null, name: null, auth: null, key: null };

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
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
  };
}

export async function saveSaved(storageDir: string, saved: SavedEntry): Promise<void> {
  await writeFileAtomic(path.join(storageDir, SAVED_FILE), `${JSON.stringify(saved, null, 2)}\n`);
}
