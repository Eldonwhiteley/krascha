// D1 backed by an in-memory SQLite database with the real migrations applied,
// so tests run the Worker's actual SQL.

import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import type { D1Database, D1Statement, Row } from '../store.js';

const MIGRATIONS = new URL('../../migrations/', import.meta.url);

export function fakeD1(): D1Database {
  const database = new DatabaseSync(':memory:');
  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .toSorted((a, b) => a.localeCompare(b))) {
    database.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  }
  const statement = (sql: string, values: readonly (string | number)[]): D1Statement => ({
    bind: (...next) => statement(sql, next),
    first: async (): Promise<Row | null> => {
      await Promise.resolve();
      return database.prepare(sql).get(...values) ?? null;
    },
    all: async (): Promise<{ readonly results: readonly Row[] }> => {
      await Promise.resolve();
      return { results: database.prepare(sql).all(...values) };
    },
    run: async (): Promise<unknown> => {
      await Promise.resolve();
      return database.prepare(sql).run(...values);
    },
  });
  return { prepare: (sql) => statement(sql, []) };
}

/** GitHub's /user endpoint for a few known tokens. Anything else is a bad credential. */
const GITHUB_USERS: Readonly<Record<string, { readonly id: number; readonly login: string }>> = {
  'token-ann': { id: 1, login: 'ann' },
  'token-bob': { id: 2, login: 'bob' },
  'token-cat': { id: 3, login: 'cat' },
  'token-shane': { id: 1378027, login: 'shanep' },
  // Has Shane's login but not his account, like someone who took it after a rename.
  'token-not-shane': { id: 4, login: 'shanep' },
  'token-dan': { id: 5, login: 'dan' },
  'token-eve': { id: 6, login: 'eve' },
};

/** The logins with a pull request merged into Krascha. */
const MERGED: ReadonlySet<string> = new Set(['eve']);
/** The logins whose search fails, like when GitHub rate limits it. */
const SEARCH_FAILS: ReadonlySet<string> = new Set(['dan']);

/** GitHub's /user and its search for merged pull requests, for a few known tokens. */
export async function fakeGitHub(url: string, init: RequestInit): Promise<Response> {
  await Promise.resolve();
  const auth = new Headers(init.headers).get('authorization') ?? '';
  const user = GITHUB_USERS[auth.replace('Bearer ', '')];
  if (user === undefined) {
    return new Response('{"message":"Bad credentials"}', { status: 401 });
  }
  if (url.startsWith('https://api.github.com/search/issues?')) {
    const query = new URL(url).searchParams.get('q') ?? '';
    if (SEARCH_FAILS.has(user.login)) {
      return new Response('{"message":"API rate limit exceeded"}', { status: 403 });
    }
    const merged =
      query.includes('repo:shanep/krascha') &&
      query.includes('is:merged') &&
      query.includes(`author:${user.login}`) &&
      MERGED.has(user.login);
    return Response.json({ total_count: merged ? 1 : 0, items: [] });
  }
  return Response.json({ ...user, email: 'hidden@example.com' });
}
