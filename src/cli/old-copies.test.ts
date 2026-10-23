// Runs real builds from old commits against a fake board and a fake GitHub,
// with fake claude, copilot and gh commands that write down what they were
// asked, to make sure every old copy still finds its way to the newest build.

import { execFile, execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { build } from 'esbuild';
import { describe, expect, it, onTestFinished } from 'vitest';

import { COUNTED_ACHIEVEMENTS } from '../shared/achievements.js';
import { FEATURES, TOO_OLD } from '../shared/leaderboard.js';

import { sha256Of } from './update.js';

/** The first copy that could update himself, through the plugin, with a restart. */
const FIRST_UPDATER = '08fca7b';
/** The last copy before the launcher, which knew FEATURES 4. */
const LAST_BEFORE_LAUNCHER = 'f61e5e0';
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const COMMIT = 'f'.repeat(40);
const TOO_OLD_TEXT = 'This copy of Krascha is too old for the board. Update it.';
const PLUGIN_UPDATES = [
  'claude plugin update krascha@shanep',
  'copilot plugin update krascha@shanep',
];

interface Ran {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

interface World {
  readonly env: NodeJS.ProcessEnv;
  readonly root: string;
  readonly log: string;
  /** A build to serve as the newest one at COMMIT. */
  readonly serve: (newest: Uint8Array) => void;
  readonly run: (script: string, ...args: string[]) => Promise<Ran>;
}

async function world(): Promise<World> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'krascha-old-'));
  const bin = path.join(root, 'bin');
  const log = path.join(root, 'commands.log');
  await mkdir(bin);
  for (const command of ['claude', 'copilot']) {
    const file = path.join(bin, command);
    await writeFile(file, `#!/bin/sh\necho "${command} $*" >> "$KRASCHA_TEST_LOG"\n`);
    await chmod(file, 0o755);
  }
  // Signed out, so uploads use a key and no real token goes anywhere.
  await writeFile(path.join(bin, 'gh'), '#!/bin/sh\nexit 1\n');
  await chmod(path.join(bin, 'gh'), 0o755);
  let newest: Uint8Array | null = null;
  const server = createServer((request, response) => {
    const send = (status: number, body: unknown): void => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    const url = request.url ?? '';
    if (url.startsWith('/api/board')) {
      const counted = COUNTED_ACHIEVEMENTS.map(({ id, name }) => ({ id, name }));
      send(200, { mostWanted: [], pets: [], total: 0, me: null, counted, features: FEATURES });
    } else if (url === '/api/version' && newest !== null) {
      send(200, { commit: COMMIT, sha256: sha256Of(newest) });
    } else if (url === `/github/${COMMIT}/dist/cli.js` && newest !== null) {
      response.writeHead(200);
      response.end(newest);
    } else if (url === '/api/scores') {
      send(TOO_OLD, { error: TOO_OLD_TEXT });
    } else {
      send(404, { error: 'Nothing here.' });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  // listen on a port always gives an AddressInfo, but the type also allows a pipe name.
  const { port } = server.address() as AddressInfo;
  onTestFinished(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  const board = `http://127.0.0.1:${String(port)}`;
  const env: NodeJS.ProcessEnv = {
    PATH: `${bin}${path.delimiter}${process.env['PATH'] ?? ''}`,
    HOME: root,
    KRASCHA_HOME: path.join(root, '.krascha'),
    KRASCHA_LEADERBOARD_URL: board,
    KRASCHA_UPDATE_SOURCE: `${board}/github`,
    KRASCHA_TEST_LOG: log,
  };
  const run = async (script: string, ...args: string[]): Promise<Ran> =>
    new Promise((resolve) => {
      execFile(process.execPath, [script, ...args], { env, timeout: 20_000 }, (error, out, err) => {
        resolve({ code: error === null ? 0 : Number(error.code ?? 1), out, err });
      });
    });
  const serve = (next: Uint8Array): void => {
    newest = next;
  };
  return { env, root, log, serve, run };
}

/** dist/cli.js as it was at `commit`, laid out like a plugin install. */
async function oldPlugin(at: World, commit: string): Promise<string> {
  const script = path.join(at.root, `plugin-${commit}`, 'dist', 'cli.js');
  await mkdir(path.dirname(script), { recursive: true });
  const bytes = execFileSync('git', ['show', `${commit}:dist/cli.js`], {
    cwd: ROOT,
    maxBuffer: 16 * 1024 * 1024,
  });
  await writeFile(script, bytes);
  return script;
}

/** This checkout's source, built the way the plugin ships it. */
async function newBuild(): Promise<Uint8Array> {
  const result = await build({
    entryPoints: [path.join(ROOT, 'src', 'cli', 'index.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    banner: { js: '#!/usr/bin/env node' },
    minify: true,
    legalComments: 'none',
    write: false,
    logLevel: 'silent',
  });
  const [output] = result.outputFiles;
  if (output === undefined) {
    throw new Error('esbuild wrote nothing');
  }
  return output.contents;
}

/** Waits for background commands, which Krascha does not wait for. */
async function eventually(check: () => Promise<boolean>): Promise<void> {
  const until = Date.now() + 15_000;
  while (!(await check())) {
    if (Date.now() > until) {
      throw new Error('timed out waiting for a background command');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function commands(at: World): Promise<string[]> {
  try {
    return (await readFile(at.log, 'utf8')).split('\n').filter((line) => line !== '');
  } catch {
    return [];
  }
}

describe('old copies', { timeout: 60_000 }, () => {
  it.each([FIRST_UPDATER, LAST_BEFORE_LAUNCHER])(
    'start a plugin update when the board knows more than %s',
    async (commit) => {
      const at = await world();
      const script = await oldPlugin(at, commit);
      expect((await at.run(script, 'board')).code).toBe(0);
      await eventually(async () => (await commands(at)).length >= 2);
      expect((await commands(at)).toSorted()).toStrictEqual(PLUGIN_UPDATES);
    },
  );

  it('print what the board says when it turns away a copy older than updating himself', async () => {
    const at = await world();
    const script = await oldPlugin(at, `${FIRST_UPDATER}^`);
    const { code, err } = await at.run(script, 'upload', '--no-gh', 'Kyle');
    expect(code).toBe(1);
    expect(err).toBe(`Krascha: ${TOO_OLD_TEXT}\n`);
  });

  it('run the newest build once the plugin update lands, with no restart', async () => {
    const at = await world();
    const bundled = await newBuild();
    const script = path.join(at.root, 'plugin-new', 'dist', 'cli.js');
    await mkdir(path.dirname(script), { recursive: true });
    await writeFile(script, bundled);
    // The newest build is a different file from the one the plugin has.
    at.serve(new Uint8Array([...bundled, ...new TextEncoder().encode('\n// newer\n')]));
    expect((await at.run(script, 'help')).code).toBe(0);
    const copy = path.join(at.root, '.krascha', 'bin', 'cli.mjs');
    await eventually(async () => (await commands(at)).length >= 2);
    expect((await commands(at)).toSorted()).toStrictEqual(PLUGIN_UPDATES);
    expect(sha256Of(await readFile(copy))).not.toBe(sha256Of(bundled));
    const { code, out } = await at.run(script);
    expect(code).toBe(0);
    expect(out).toContain(`Krascha updated himself to ${COMMIT.slice(0, 7)}.`);
  });
});
