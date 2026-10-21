// The Cloudflare Worker behind Krascha's List. It serves the public page at
// /, the board as JSON at /api/board, and takes uploads and removals at
// /api/scores. An upload proves who it belongs to one of two ways. A GitHub
// token is checked once with GitHub and then dropped, never stored or logged,
// and its entry shows as verified and links to the account, so only the user
// id and login are kept. A key the CLI made up is stored only as a hash, so it
// ties uploads together without saying who anyone is.

import {
  GITHUB_LOGIN_PATTERN,
  isScoreUpload,
  KEY_PATTERN,
  NEW_ENTRIES_PER_DAY,
  UPLOADS_PER_DAY,
} from '../../src/shared/leaderboard.js';

import { renderPage } from './page.js';
import type { D1Database, Owner } from './store.js';
import { readBoard, removeScore, saveScore, utcDay } from './store.js';

export interface Env {
  readonly DB: D1Database;
}

/** What the handler needs from the outside, so tests can stand in for GitHub and the clock. */
export interface Deps {
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly now: () => number;
  readonly newId: () => string;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function json(body: unknown, status = 200, cache = 'no-store'): Response {
  return Response.json(body, {
    status,
    headers: { ...JSON_HEADERS, 'cache-control': cache },
  });
}

function fail(status: number, error: string): Response {
  return json({ error }, status);
}

/** Hex SHA-256 of some text. */
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The numeric id and login from GitHub's user response, the only fields kept. */
function githubUserOf(user: unknown): { readonly id: number; readonly login: string } | null {
  if (typeof user !== 'object' || user === null) {
    return null;
  }
  const id: unknown = Reflect.get(user, 'id');
  const login: unknown = Reflect.get(user, 'login');
  return typeof id === 'number' && typeof login === 'string' && GITHUB_LOGIN_PATTERN.test(login)
    ? { id, login }
    : null;
}

async function githubOwner(token: string, deps: Deps): Promise<Owner | null> {
  const response = await deps.fetch('https://api.github.com/user', {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'krascha',
    },
  });
  const user = response.ok ? githubUserOf(await response.json()) : null;
  return user === null
    ? null
    : { id: `github:${String(user.id)}`, verified: true, github: user.login };
}

/**
 * Who sent the request: "Bearer <GitHub token>" or "Key <key>". Null when
 * there is no credential, GitHub turns the token down, or the key is malformed.
 */
async function ownerOf(request: Request, deps: Deps): Promise<Owner | null> {
  const match = /^(Bearer|Key) (\S+)$/u.exec(request.headers.get('authorization') ?? '');
  const [, scheme, secret] = match ?? [];
  if (secret === undefined) {
    return null;
  }
  if (scheme === 'Bearer') {
    return githubOwner(secret, deps);
  }
  return KEY_PATTERN.test(secret)
    ? { id: `key:${await sha256(secret)}`, verified: false, github: null }
    : null;
}

const NO_OWNER =
  'Send a GitHub token or a Krascha key. GitHub did not accept the token, if you sent one.';

async function upload(request: Request, env: Env, deps: Deps): Promise<Response> {
  const owner = await ownerOf(request, deps);
  if (owner === null) {
    return fail(401, NO_OWNER);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'The upload is not JSON.');
  }
  if (!isScoreUpload(body)) {
    return fail(
      400,
      'The upload needs a short name, whole, non-negative counts, a sane token average, a short list of achievements, a short list of agents and a machine id that looks like a Krascha key.',
    );
  }
  // Only these fields are kept, whatever else the body holds.
  const {
    name,
    kind,
    mean,
    prompts,
    achievements = [],
    tokensPerDay = 0,
    tools = [],
    machine,
  } = body;
  const now = deps.now();
  // The address is only hashed with the day, for the cap on new unverified entries.
  const address = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const saved = await saveScore(env.DB, {
    owner,
    upload: {
      name,
      kind,
      mean,
      prompts,
      achievements,
      tokensPerDay,
      tools,
      ...(machine === undefined ? {} : { machine }),
    },
    now,
    newId: deps.newId,
    origin: await sha256(`${utcDay(now)} ${address}`),
  });
  if (!saved.ok && saved.reason === 'new-entries') {
    return fail(
      429,
      `Only ${String(NEW_ENTRIES_PER_DAY)} new entries without GitHub can come from one network a day. Try again tomorrow (UTC), or upload with gh signed in.`,
    );
  }
  if (!saved.ok) {
    return fail(
      429,
      `You can upload ${String(UPLOADS_PER_DAY)} times a day. Try again tomorrow (UTC).`,
    );
  }
  return json(saved.standing, 201);
}

async function remove(request: Request, env: Env, deps: Deps): Promise<Response> {
  const owner = await ownerOf(request, deps);
  if (owner === null) {
    return fail(401, NO_OWNER);
  }
  await removeScore(env.DB, owner);
  return new Response(null, { status: 204 });
}

export async function handle(request: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;
  switch (route) {
    case 'GET /': {
      const board = await readBoard(env.DB, null);
      return new Response(renderPage(board, deps.now()), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=60',
        },
      });
    }
    case 'GET /api/board': {
      const me = url.searchParams.get('me');
      const board = await readBoard(env.DB, me === '' ? null : me);
      return json(board, 200, me === null ? 'public, max-age=60' : 'no-store');
    }
    case 'POST /api/scores': {
      return upload(request, env, deps);
    }
    case 'DELETE /api/scores': {
      return remove(request, env, deps);
    }
    default: {
      return fail(404, 'Nothing here.');
    }
  }
}

const live: Deps = {
  fetch: async (url, init) => fetch(url, init),
  now: () => Date.now(),
  newId: () => crypto.randomUUID(),
};

// Cloudflare runs a module Worker from its default export.
// eslint-disable-next-line import-x/no-default-export -- the Workers runtime needs it
export default {
  fetch: async (request: Request, env: Env): Promise<Response> => handle(request, env, live),
};
