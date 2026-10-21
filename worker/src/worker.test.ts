import { describe, expect, it } from 'vitest';

import { ACHIEVEMENTS } from '../../src/shared/achievements.js';
import type { Board, Standing } from '../../src/shared/leaderboard.js';
import {
  isBoard,
  isStanding,
  MAX_ACHIEVEMENTS,
  MAX_TOKENS_PER_DAY,
  UPLOADS_PER_DAY,
} from '../../src/shared/leaderboard.js';
import { reputationScore } from '../../src/shared/reputation.js';
import { rankBoard, STATUS_LABEL } from '../../src/shared/silo.js';

import { escapeHtml, REPO_URL } from './page.js';
import { robotIcon } from './robot.js';
import { cleanName, utcDay } from './store.js';
import { fakeD1, fakeGitHub } from './test-helpers/fake-d1.js';
import type { Deps } from './worker.js';
import { handle } from './worker.js';

const DAY = 86_400_000;
const START = Date.parse('2026-10-16T12:00:00Z');

interface World {
  readonly call: (
    method: string,
    path: string,
    token?: string,
    body?: unknown,
  ) => Promise<Response>;
  readonly status: (
    method: string,
    path: string,
    token?: string,
    body?: unknown,
  ) => Promise<number>;
  readonly raw: (
    method: string,
    path: string,
    headers: Readonly<Record<string, string>>,
    body?: unknown,
  ) => Promise<Response>;
  readonly board: (me?: string) => Promise<Board>;
  readonly upload: (token: string, body: unknown) => Promise<Standing>;
  readonly setNow: (at: number) => void;
  readonly githubCalls: () => number;
}

function world(): World {
  const env = { DB: fakeD1() };
  let now = START;
  let ids = 0;
  let githubCalls = 0;
  const deps: Deps = {
    fetch: async (_url, init) => {
      githubCalls += 1;
      return fakeGitHub(init);
    },
    now: () => now,
    newId: () => {
      ids += 1;
      return `entry-${String(ids)}`;
    },
  };
  const raw = async (
    method: string,
    path: string,
    headers: Readonly<Record<string, string>>,
    body?: unknown,
  ): Promise<Response> => {
    const init: RequestInit = { method, headers: new Headers(headers) };
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    return handle(new Request(`https://board.test${path}`, init), env, deps);
  };
  const call = async (
    method: string,
    path: string,
    bearer?: string,
    body?: unknown,
  ): Promise<Response> =>
    raw(method, path, bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }, body);
  return {
    call,
    raw,
    status: async (method, path, bearer, body): Promise<number> => {
      const response = await call(method, path, bearer, body);
      return response.status;
    },
    board: async (me): Promise<Board> => {
      const response = await call('GET', me === undefined ? '/api/board' : `/api/board?me=${me}`);
      const body: unknown = await response.json();
      if (!isBoard(body)) {
        throw new Error('not a board');
      }
      return body;
    },
    upload: async (token, body): Promise<Standing> => {
      const response = await call('POST', '/api/scores', token, body);
      expect(response.status).toBe(201);
      const standing: unknown = await response.json();
      if (!isStanding(standing)) {
        throw new Error('not a standing');
      }
      return standing;
    },
    setNow: (at): void => {
      now = at;
    },
    githubCalls: () => githubCalls,
  };
}

const MEAN = { name: 'Ann', kind: 2, mean: 30, prompts: 400 };
const KIND = { name: 'Bob', kind: 80, mean: 1, prompts: 300 };
const MIDDLE = { name: '', kind: 5, mean: 3, prompts: 200 };

describe('leaderboard worker', () => {
  it('starts with an empty board', async () => {
    const w = world();
    expect(await w.board()).toStrictEqual({ mostWanted: [], pets: [], total: 0, me: null });
  });

  it('turns away uploads without a GitHub token GitHub accepts', async () => {
    const w = world();
    expect(await w.status('POST', '/api/scores', undefined, MEAN)).toBe(401);
    expect(await w.status('POST', '/api/scores', 'stolen', MEAN)).toBe(401);
    expect(await w.board()).toMatchObject({ total: 0 });
  });

  it('rejects bodies that are not a name and whole counts', async () => {
    const w = world();
    const bad = [
      'not json',
      { ...MEAN, name: 'x'.repeat(41) },
      { ...MEAN, kind: -1 },
      { ...MEAN, mean: 1.5 },
      { ...MEAN, kind: 300, mean: 200 },
      { kind: 1, mean: 1, prompts: 200 },
      { ...MEAN, achievements: 'manners' },
      { ...MEAN, achievements: [1] },
      { ...MEAN, achievements: Array.from({ length: MAX_ACHIEVEMENTS + 1 }, () => 'manners') },
      { ...MEAN, tokensPerDay: -1 },
      { ...MEAN, tokensPerDay: 2.5 },
      { ...MEAN, tokensPerDay: '100' },
      { ...MEAN, tokensPerDay: MAX_TOKENS_PER_DAY + 1 },
    ];
    const statuses = await Promise.all(
      bad.map(async (body) => await w.status('POST', '/api/scores', 'token-ann', body)),
    );
    expect(statuses).toStrictEqual(bad.map(() => 400));
  });

  it('works out the score and rank itself and keeps only the upload fields', async () => {
    const w = world();
    const standing = await w.upload('token-ann', { ...MEAN, score: 1, rank: 'Theodore Twombly' });
    expect(standing).toStrictEqual({
      entry: {
        id: 'entry-1',
        name: 'Ann',
        verified: true,
        rank: 'John Connor',
        score: reputationScore(MEAN),
        kind: 2,
        mean: 30,
        prompts: 400,
        uploadedAt: START,
        achievements: [],
        tokensPerDay: 0,
      },
      place: 1,
    });
  });

  it('keeps known achievements once each, in list order, and drops the rest', async () => {
    const w = world();
    const standing = await w.upload('token-ann', {
      ...MEAN,
      achievements: ['meltdown', 'made-up', 'first-strike', 'meltdown'],
    });
    expect(standing.entry.achievements).toStrictEqual(['first-strike', 'meltdown']);
    const board = await w.board();
    expect(board.mostWanted[0]?.achievements).toStrictEqual(['first-strike', 'meltdown']);
    const page = await w.call('GET', '/');
    const html = await page.text();
    expect(html).toContain('aria-label="Achievements: First strike, Meltdown"');
    expect(html).toContain('<span title="Meltdown: Be mean to Claude 5 times in one day.">🌋</span>');
    const again = await w.upload('token-ann', MEAN);
    expect(again.entry.achievements).toStrictEqual([]);
  });

  it('keeps the token average, shows it on the page and resets it when an upload leaves it out', async () => {
    const w = world();
    const standing = await w.upload('token-ann', { ...MEAN, tokensPerDay: 187_537_200 });
    expect(standing.entry.tokensPerDay).toBe(187_537_200);
    const board = await w.board();
    expect(board.mostWanted[0]?.tokensPerDay).toBe(187_537_200);
    const page = await w.call('GET', '/');
    expect(await page.text()).toContain('2 nice, 30 mean, 187.5M tokens a day');
    const again = await w.upload('token-ann', MEAN);
    expect(again.entry.tokensPerDay).toBe(0);
  });

  it('replaces an account’s last upload and keeps its id', async () => {
    const w = world();
    await w.upload('token-ann', MEAN);
    const again = await w.upload('token-ann', { ...KIND, name: '  Ann \u0007 the   Nice ' });
    expect(again.entry.id).toBe('entry-1');
    expect(again.entry.name).toBe('Ann the Nice');
    expect(await w.board()).toMatchObject({ total: 1 });
  });

  it('lists the most wanted and the pets, with your own place', async () => {
    const w = world();
    const ann = await w.upload('token-ann', MEAN);
    await w.upload('token-bob', KIND);
    const cat = await w.upload('token-cat', MIDDLE);
    expect(cat.entry.name).toBe('Anonymous');
    const board = await w.board(cat.entry.id);
    expect(board.mostWanted.map((entry) => entry.name)).toStrictEqual(['Ann', 'Anonymous']);
    expect(board.pets.map((entry) => entry.name)).toStrictEqual(['Bob']);
    expect(board.total).toBe(3);
    expect(board.me).toStrictEqual({ entry: cat.entry, place: 2 });
    expect(await w.board(ann.entry.id)).toMatchObject({ me: { place: 1 } });
    expect(await w.board('nobody')).toMatchObject({ me: null });
  });

  it('leaves short histories off the board but still tells their owner', async () => {
    const w = world();
    const small = await w.upload('token-ann', { ...MEAN, prompts: 99 });
    expect(small.place).toBeNull();
    const board = await w.board(small.entry.id);
    expect(board.total).toBe(0);
    expect(board.mostWanted).toStrictEqual([]);
    expect(board.me?.place).toBeNull();
  });

  it('caps uploads per UTC day', async () => {
    const w = world();
    for (let index = 0; index < UPLOADS_PER_DAY; index += 1) {
      await w.upload('token-ann', MEAN);
    }
    const capped = await w.call('POST', '/api/scores', 'token-ann', MEAN);
    expect(capped.status).toBe(429);
    expect(await capped.json()).toStrictEqual({
      error: 'You can upload 5 times a day. Try again tomorrow (UTC).',
    });
    w.setNow(START + DAY);
    expect(await w.upload('token-ann', MEAN)).toMatchObject({ entry: { uploadedAt: START + DAY } });
  });

  it('removes your entry and only yours', async () => {
    const w = world();
    await w.upload('token-ann', MEAN);
    await w.upload('token-bob', KIND);
    expect(await w.status('DELETE', '/api/scores')).toBe(401);
    expect(await w.status('DELETE', '/api/scores', 'token-ann')).toBe(204);
    const board = await w.board();
    expect(board.pets.map((entry) => entry.name)).toStrictEqual(['Bob']);
  });

  it('takes uploads with a made-up key, unverified, and ties them together', async () => {
    const w = world();
    const key = (id: string, ip = '10.0.0.1') => ({
      authorization: `Key ${id.repeat(40)}`,
      'cf-connecting-ip': ip,
    });
    const first = await w.raw('POST', '/api/scores', key('a'), MEAN);
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ entry: { id: 'entry-1', verified: false } });
    const again = await w.raw('POST', '/api/scores', key('a'), KIND);
    expect(await again.json()).toMatchObject({ entry: { id: 'entry-1', name: 'Bob' } });
    expect(await w.board()).toMatchObject({ total: 1 });
    expect((await w.raw('POST', '/api/scores', { authorization: 'Key short' }, MEAN)).status).toBe(
      401,
    );
    const page = await (await w.call('GET', '/')).text();
    expect(page).not.toContain('class="verified"');
    expect(w.githubCalls()).toBe(0);
    expect((await w.raw('DELETE', '/api/scores', key('a'))).status).toBe(204);
    expect(await w.board()).toMatchObject({ total: 0 });
  });

  it('caps new unverified entries per network per UTC day', async () => {
    const w = world();
    const from = (id: string, ip: string) => ({
      authorization: `Key ${id.repeat(40)}`,
      'cf-connecting-ip': ip,
    });
    for (const id of ['a', 'b', 'c']) {
      expect((await w.raw('POST', '/api/scores', from(id, '10.0.0.1'), MEAN)).status).toBe(201);
    }
    const capped = await w.raw('POST', '/api/scores', from('d', '10.0.0.1'), MEAN);
    expect(capped.status).toBe(429);
    expect(await capped.json()).toMatchObject({ error: expect.stringContaining('gh signed in') });
    expect((await w.raw('POST', '/api/scores', from('a', '10.0.0.1'), KIND)).status).toBe(201);
    expect((await w.raw('POST', '/api/scores', from('d', '10.0.0.2'), MEAN)).status).toBe(201);
    expect(await w.status('POST', '/api/scores', 'token-ann', MEAN)).toBe(201);
    w.setNow(START + DAY);
    expect((await w.raw('POST', '/api/scores', from('e', '10.0.0.1'), MEAN)).status).toBe(201);
  });

  it('marks entries checked with GitHub on the page', async () => {
    const w = world();
    await w.upload('token-ann', MEAN);
    const page = await (await w.call('GET', '/')).text();
    expect(page).toContain('<span class="verified" title="Checked with GitHub">✓</span>');
  });

  it('explains every achievement on the page, earned or not', async () => {
    const w = world();
    const page = await (await w.call('GET', '/')).text();
    expect(page).toContain('<h2 id="legend">🏆 Achievements</h2>');
    for (const rule of ACHIEVEMENTS) {
      expect(page).toContain(`${escapeHtml(rule.name)}</dt><dd>${escapeHtml(rule.how)}</dd>`);
    }
  });

  it('ranks everyone on the board for Silo 7, like krascha silo board', async () => {
    const w = world();
    expect(await (await w.call('GET', '/')).text()).toContain('More peaches for the board.');
    await w.upload('token-ann', MEAN);
    await w.upload('token-bob', KIND);
    const page = await (await w.call('GET', '/')).text();
    expect(page).toContain('<h2 id="silo">🛡️ Silo 7 admissions</h2>');
    const silo = page.slice(page.indexOf('id="silo"'), page.indexOf('id="legend"'));
    const ranked = rankBoard(await w.board());
    expect(ranked.map(({ score }) => score.name)).toStrictEqual(['Ann', 'Bob']);
    for (const { score } of ranked) {
      expect(silo).toContain(`<strong>${score.name}</strong>`);
      expect(silo).toContain(`${STATUS_LABEL[score.status]}</span>, ${escapeHtml(score.ruling)}`);
      expect(silo).toContain(`${String(score.total)}<span class="out-of">/50</span>`);
    }
    expect(silo.indexOf('<strong>Ann</strong>')).toBeLessThan(silo.indexOf('<strong>Bob</strong>'));
  });

  it('draws Krascha in the title and the tab icon', async () => {
    const w = world();
    const page = await (await w.call('GET', '/')).text();
    expect(page).toContain('<h1><svg class="robot" viewBox="0 0 64 64" aria-hidden="true">');
    expect(page).toContain(`<link rel="icon" type="image/svg+xml" href="${escapeHtml(robotIcon())}">`);
    const icon = decodeURIComponent(robotIcon().slice('data:image/svg+xml,'.length));
    expect(icon).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*>.*<\/svg>$/su);
  });

  it('serves a public page with names escaped', async () => {
    const w = world();
    await w.upload('token-ann', { ...MEAN, name: '<script>x</script>' });
    const response = await w.call('GET', '/');
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const html = await response.text();
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('<script>x');
    expect(html).toContain('1 person on the board');
    expect(html).toContain('Somebody say please.');
    expect(html).toContain(`<a class="get" href="${REPO_URL}">`);
  });

  it('only asks GitHub when a token is sent, and 404s anything else', async () => {
    const w = world();
    expect(await w.status('GET', '/nope')).toBe(404);
    expect(await w.status('PUT', '/api/scores', 'token-ann')).toBe(404);
    expect(w.githubCalls()).toBe(0);
  });
});

describe('leaderboard helpers', () => {
  it('cleans names and days', () => {
    expect(cleanName('\tA\u0000 b\n')).toBe('A b');
    expect(utcDay(START)).toBe('2026-10-16');
    expect(escapeHtml(`a&b"'`)).toBe('a&amp;b&quot;&#39;');
  });
});
