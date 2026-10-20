import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import { addPrompt, emptyIndex, saveIndex } from '../reputation/store.js';
import { RANKS } from '../shared/ranks.js';

import { faceFor } from './face.js';
import type { CliIo } from './main.js';
import { INDEX_FILE, dataDir, main } from './main.js';
import { wrap } from './render.js';

interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

interface Home {
  readonly root: string;
  readonly run: (...args: string[]) => Promise<Run>;
}

function prompt(uuid: string, text: string): string {
  return JSON.stringify({
    type: 'user',
    uuid,
    timestamp: '2026-10-01T12:00:00.000Z',
    origin: { kind: 'human' },
    message: { content: text },
  });
}

function event(id: string, content: string): string {
  return JSON.stringify({
    type: 'user.message',
    id,
    timestamp: '2026-10-02T12:00:00.000Z',
    data: { content },
  });
}

async function makeHome(): Promise<Home> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skrusty-cli-'));
  onTestFinished(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const project = path.join(root, '.claude', 'projects', '-work');
  await mkdir(project, { recursive: true });
  const lines = [prompt('u1', 'you idiot'), prompt('u2', 'thanks, great job')];
  await writeFile(path.join(project, 's1.jsonl'), lines.map((line) => `${line}\n`).join(''));
  const session = path.join(root, '.copilot', 'session-state', 'c1');
  await mkdir(session, { recursive: true });
  const long = `please fix the tests${' and then the docs'.repeat(20)} hunter2`;
  await writeFile(path.join(session, 'events.jsonl'), `${event('e1', long)}\n`);
  const run = async (...args: string[]): Promise<Run> => {
    let out = '';
    let err = '';
    const io: CliIo = {
      home: root,
      env: {},
      now: () => Date.parse('2026-10-03T12:00:00.000Z'),
      fetch: () => Promise.reject(new Error('offline')),
      color: false,
      out: (text) => {
        out += text;
      },
      err: (text) => {
        err += text;
      },
    };
    const code = await main(args, io);
    return { code, out, err };
  };
  return { root, run };
}

describe('skrusty', () => {
  it('reads Claude Code and Copilot CLI prompts and shows the verdict', async () => {
    const home = await makeHome();
    const { code, out, err } = await home.run();
    expect(err).toBe('');
    expect(code).toBe(0);
    expect(out).toContain('3 prompts on file: 2 kind, 1 mean');
    expect(out).toContain('Manners module');
    expect(out).toContain('Skrusty remembers.');
    const saved = await readFile(path.join(home.root, '.skrusty', INDEX_FILE), 'utf8');
    // Only the excerpt around a hit is kept, never the whole prompt.
    expect(saved).toContain('please fix the tests');
    expect(saved).not.toContain('hunter2');
  });

  it('prints the counts as JSON', async () => {
    const home = await makeHome();
    const { code, out } = await home.run('json');
    expect(code).toBe(0);
    const report: unknown = JSON.parse(out);
    expect(report).toMatchObject({ prompts: 3, kind: 2, mean: 1, scan: { filesRead: 2 } });
  });

  it('imports another index without counting a prompt twice', async () => {
    const home = await makeHome();
    const old = emptyIndex();
    addPrompt(old, { id: 't:gone', sessionId: 's0', at: 1, text: 'you idiot, again' });
    addPrompt(old, { id: 't:u1', sessionId: 's1', at: 1, text: 'you idiot' });
    const oldFile = path.join(home.root, 'frustration.json');
    await saveIndex(oldFile, old);
    expect(await home.run('import', oldFile)).toMatchObject({ code: 0 });
    const { out } = await home.run('json');
    expect(JSON.parse(out)).toMatchObject({ prompts: 4, mean: 2 });
    expect(await home.run('import', path.join(home.root, 'missing.json'))).toMatchObject({
      code: 1,
    });
  });

  it('says so when the board cannot be reached', async () => {
    const home = await makeHome();
    const { code, err } = await home.run('board');
    expect(code).toBe(1);
    expect(err).toContain('could not be reached');
  });

  it('turns away a command it does not know', async () => {
    const home = await makeHome();
    const { code, err } = await home.run('dance');
    expect(code).toBe(2);
    expect(err).toContain('Usage: skrusty');
  });

  it('keeps its files in SKRUSTY_HOME when set', () => {
    expect(dataDir({ home: '/h', env: {} })).toBe(path.join('/h', '.skrusty'));
    expect(dataDir({ home: '/h', env: { SKRUSTY_HOME: '/s' } })).toBe('/s');
  });
});

describe('faceFor', () => {
  it('draws every mood at one width', () => {
    for (const rank of RANKS) {
      const widths = new Set(faceFor(rank.mood).map((line) => line.length));
      expect(widths.size).toBe(1);
    }
  });
});

describe('wrap', () => {
  it('breaks at spaces and keeps a long word whole', () => {
    expect(wrap('one two three four', 9)).toStrictEqual(['one two', 'three', 'four']);
    expect(wrap('  ', 9)).toStrictEqual([]);
    expect(wrap('abcdefghijk x', 5)).toStrictEqual(['abcdefghijk', 'x']);
  });
});
