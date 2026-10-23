import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import type { UpdateState } from './update.js';
import { chooseCopy, COPY_FILE, dropCopy, pickCopy, sha256Of, UPDATE_FILE } from './update.js';

const OWN = 'a'.repeat(64);
const NEW = 'b'.repeat(64);
const STATE: UpdateState = {
  checkedAt: 1,
  latest: { commit: 'c'.repeat(40), sha256: NEW },
  bad: [],
  announce: null,
};

describe('chooseCopy', () => {
  it('runs the copy only when it is the newest build and this one is not', () => {
    expect(chooseCopy(OWN, STATE, NEW)).toBe(true);
    expect(chooseCopy(NEW, STATE, NEW)).toBe(false);
    expect(chooseCopy(OWN, STATE, null)).toBe(false);
    expect(chooseCopy(OWN, STATE, 'd'.repeat(64))).toBe(false);
    expect(chooseCopy(OWN, { ...STATE, latest: null }, NEW)).toBe(false);
    expect(chooseCopy(OWN, { ...STATE, bad: [NEW] }, NEW)).toBe(false);
  });
});

describe('the copy in the data folder', () => {
  it('is picked when it matches the newest build, and dropped for good when it fails', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'krascha-update-'));
    onTestFinished(async () => {
      await rm(dir, { recursive: true, force: true });
    });
    const build = new TextEncoder().encode('export {};\n');
    const latest = { commit: 'c'.repeat(40), sha256: sha256Of(build) };
    await writeFile(path.join(dir, UPDATE_FILE), JSON.stringify({ ...STATE, latest }));
    expect(await pickCopy(dir, OWN)).toBeNull();
    await mkdir(path.join(dir, 'bin'));
    await writeFile(path.join(dir, COPY_FILE), build);
    expect(await pickCopy(dir, OWN)).toBe(path.join(dir, COPY_FILE));
    await dropCopy(dir);
    await expect(readFile(path.join(dir, COPY_FILE))).rejects.toThrow();
    const saved: unknown = JSON.parse(await readFile(path.join(dir, UPDATE_FILE), 'utf8'));
    expect(saved).toStrictEqual({ ...STATE, latest, bad: [latest.sha256] });
    await writeFile(path.join(dir, COPY_FILE), build);
    expect(await pickCopy(dir, OWN)).toBeNull();
  });

  it('starts over from a state file it cannot read', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'krascha-update-'));
    onTestFinished(async () => {
      await rm(dir, { recursive: true, force: true });
    });
    await writeFile(path.join(dir, UPDATE_FILE), '{"checkedAt": "soon"');
    expect(await pickCopy(dir, OWN)).toBeNull();
  });
});
