// The entry point esbuild bundles into dist/cli.js.

import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import os from 'node:os';

import { main } from './main.js';

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

process.exitCode = await main(process.argv.slice(2), {
  home: os.homedir(),
  env: process.env,
  now: Date.now,
  fetch: async (url, init) => fetch(url, init),
  githubToken,
  newKey: () => randomBytes(32).toString('base64url'),
  color,
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
});
