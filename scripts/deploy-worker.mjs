// Deploys Skrusty's List, the leaderboard Worker, to Cloudflare at
// skrusty.com. The first run creates the D1 database and writes its id into
// worker/wrangler.toml. Every run applies new migrations and deploys.
//
//   node scripts/deploy-worker.mjs
//
// Needs a Cloudflare sign-in on this machine first: npx wrangler login

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'worker');
const TOML = path.join(DIR, 'wrangler.toml');
const DATABASE = 'skrusty';
const PLACEHOLDER = 'REPLACE_ON_FIRST_DEPLOY';
const WRANGLER = ['--yes', 'wrangler@4.147.0'];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/u;

/** One line to the terminal. */
function say(line) {
  process.stdout.write(`${line}\n`);
}

/** Runs wrangler in the worker folder, echoing its output, and returns it. */
function wrangler(args, { quiet = false } = {}) {
  const output = execFileSync('npx', [...WRANGLER, ...args], {
    cwd: DIR,
    encoding: 'utf8',
    // CI=true answers wrangler's "ok to proceed?" questions, so nothing waits on a keypress.
    env: { ...process.env, CI: 'true' },
    stdio: ['ignore', 'pipe', quiet ? 'pipe' : 'inherit'],
  });
  if (!quiet) {
    process.stdout.write(output);
  }
  return output;
}

function databaseId() {
  try {
    const found = UUID.exec(wrangler(['d1', 'info', DATABASE, '--json'], { quiet: true }));
    if (found !== null) {
      return found[0];
    }
  } catch {
    // Not created yet.
  }
  const created = UUID.exec(wrangler(['d1', 'create', DATABASE]));
  if (created === null) {
    throw new Error('wrangler did not print the new database id');
  }
  return created[0];
}

const toml = readFileSync(TOML, 'utf8');
if (toml.includes(PLACEHOLDER)) {
  const id = databaseId();
  writeFileSync(TOML, toml.replace(PLACEHOLDER, id));
  say(`Database ${DATABASE} is ${id}. Commit worker/wrangler.toml.`);
}

wrangler(['d1', 'migrations', 'apply', DATABASE, '--remote']);
wrangler(['deploy']);
say('Skrusty\'s List is live at https://skrusty.com');
