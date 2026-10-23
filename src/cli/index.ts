// The entry point esbuild bundles into dist/cli.js. When Krascha has a newer
// copy of himself in his data folder, this runs that copy in place of the
// rest of this file.

import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { CliIo } from './main.js';
import { dataDir, main } from './main.js';
import type { SelfBuild } from './update.js';
import { dropCopy, pickCopy, sha256Of, updatesHimself } from './update.js';

const color = process.stdout.isTTY && process.env['NO_COLOR'] === undefined;

/** The token gh is signed in with, or null when gh is missing or signed out. */
async function githubToken(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('gh', ['auth', 'token'], { timeout: 10_000 }, (error, stdout) => {
      const token = stdout.trim();
      resolve(error === null && token !== '' ? token : null);
    });
  });
}

/** Starts a command on its own, so Krascha can exit while it runs. A command that is not installed is ignored. */
function launch([command, ...args]: readonly string[]): void {
  if (command === undefined) {
    return;
  }
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => undefined);
  child.unref();
}

/** This build, or null when it runs from a checkout of the repo, which keeps itself current. */
function selfBuild(): SelfBuild | null {
  const script = fileURLToPath(import.meta.url);
  const root = path.dirname(path.dirname(script));
  if (existsSync(path.join(root, '.git')) && existsSync(path.join(root, 'src', 'cli'))) {
    return null;
  }
  return { command: [process.execPath, script], sha256: sha256Of(readFileSync(script)) };
}

const io: CliIo = {
  home: os.homedir(),
  env: process.env,
  now: Date.now,
  fetch: async (url, init) => fetch(url, init),
  githubToken,
  newKey: () => randomBytes(32).toString('base64url'),
  launch,
  self: selfBuild(),
  color,
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

/** Runs the newer copy, if there is one. False when this build should run instead. */
async function ranCopy(): Promise<boolean> {
  // The copy is a build of this same file, so it must not look for a copy again.
  if (io.self === null || !updatesHimself(io.env) || io.env['KRASCHA_LAUNCHED'] !== undefined) {
    return false;
  }
  const dir = dataDir(io);
  const copy = await pickCopy(dir, io.self.sha256);
  if (copy === null) {
    return false;
  }
  io.env['KRASCHA_LAUNCHED'] = '1';
  try {
    await import(pathToFileURL(copy).href);
    return true;
  } catch {
    await dropCopy(dir);
    return false;
  }
}

if (!(await ranCopy())) {
  process.exitCode = await main(process.argv.slice(2), io);
}
