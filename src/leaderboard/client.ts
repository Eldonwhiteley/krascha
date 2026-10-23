// Calls to the leaderboard server. Reading the board sends only your entry id
// (when you have one). Uploading and removing send either your GitHub token,
// which the server checks once with GitHub and drops, or the key Krascha made
// up for you, which the server keeps only as a hash.

import type { Board, ScoreUpload, Standing } from '../shared/leaderboard.js';
import { isBoard, isStanding, TOO_OLD } from '../shared/leaderboard.js';

/** The global fetch, or a stand-in for tests. */
export type FetchFunction = (url: string, init: RequestInit) => Promise<Response>;

/** How an upload proves it belongs to you. */
export type Credential =
  | { readonly kind: 'github'; readonly token: string }
  | { readonly kind: 'key'; readonly key: string };

function authorization(credential: Credential): string {
  return credential.kind === 'github' ? `Bearer ${credential.token}` : `Key ${credential.key}`;
}

const TIMEOUT_MS = 10_000;

class LeaderboardError extends Error {
  override readonly name = 'LeaderboardError';

  /** The status the server answered with, or null when it could not be reached. */
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

/** True when the board turned this copy away as too old to upload. */
export function isTooOld(error: unknown): boolean {
  return error instanceof LeaderboardError && error.status === TOO_OLD;
}

function endpoint(base: string, route: string, query?: Readonly<Record<string, string>>): string {
  const url = new URL(route, base.endsWith('/') ? base : `${base}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/** The server's own words for a failed call, or the status when it gave none. */
async function failure(response: Response): Promise<LeaderboardError> {
  try {
    const body: unknown = await response.json();
    const error: unknown =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
    if (typeof error === 'string') {
      return new LeaderboardError(error, response.status);
    }
  } catch {
    // Not JSON, so fall back to the status.
  }
  return new LeaderboardError(
    `The leaderboard server answered ${String(response.status)}.`,
    response.status,
  );
}

async function call(fetch: FetchFunction, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new LeaderboardError('The leaderboard server could not be reached.');
  }
}

export async function fetchBoard(
  fetch: FetchFunction,
  base: string,
  me: string | null,
): Promise<Board> {
  const response = await call(
    fetch,
    endpoint(base, 'api/board', me === null ? undefined : { me }),
    { method: 'GET' },
  );
  if (!response.ok) {
    throw await failure(response);
  }
  const body: unknown = await response.json();
  if (!isBoard(body)) {
    throw new LeaderboardError('The leaderboard server sent something that is not a board.');
  }
  return body;
}

export async function uploadScore(
  fetch: FetchFunction,
  base: string,
  credential: Credential,
  upload: ScoreUpload,
): Promise<Standing> {
  const response = await call(fetch, endpoint(base, 'api/scores'), {
    method: 'POST',
    headers: { authorization: authorization(credential), 'content-type': 'application/json' },
    body: JSON.stringify(upload),
  });
  if (!response.ok) {
    throw await failure(response);
  }
  const body: unknown = await response.json();
  if (!isStanding(body)) {
    throw new LeaderboardError('The leaderboard server sent back something unexpected.');
  }
  return body;
}

export async function removeEntry(
  fetch: FetchFunction,
  base: string,
  credential: Credential,
): Promise<void> {
  const response = await call(fetch, endpoint(base, 'api/scores'), {
    method: 'DELETE',
    headers: { authorization: authorization(credential) },
  });
  if (!response.ok) {
    throw await failure(response);
  }
}
