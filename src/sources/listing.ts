// Folder listing and file stamps that treat a missing path as empty, shared
// by the agents' prompt readers.

import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';

import type { PromptFile } from './types.js';

export async function listDir(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export async function stampOf(file: string): Promise<PromptFile['stamp']> {
  try {
    const info = await stat(file);
    return { mtimeMs: info.mtimeMs, size: info.size };
  } catch {
    return null;
  }
}
