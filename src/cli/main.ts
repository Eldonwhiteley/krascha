// The skrusty command. With no arguments it rescans your prompts and prints
// Skrusty's verdict. Every command takes its surroundings as arguments, so
// tests can run it against a fake home folder.

import path from 'node:path';

import type { Credential, FetchFunction } from '../leaderboard/client.js';
import { fetchBoard, removeEntry, uploadScore } from '../leaderboard/client.js';
import type { SavedEntry } from '../leaderboard/saved.js';
import { loadSaved, saveSaved } from '../leaderboard/saved.js';
import { scanInto } from '../reputation/scan.js';
import type { ScanResult } from '../reputation/scan.js';
import { loadIndex, mergeIndex, readIndex, saveIndex } from '../reputation/store.js';
import { summarize } from '../reputation/summarize.js';
import { averageTokensPerDay } from '../reputation/tokens.js';
import { unlockedIds } from '../shared/achievements.js';
import type { Board, BoardEntry, Standing } from '../shared/leaderboard.js';
import { LEADERBOARD_URL, MAX_NAME_LENGTH, MIN_PROMPTS } from '../shared/leaderboard.js';
import { rankFor } from '../shared/ranks.js';
import type { ReputationSummary } from '../shared/reputation.js';
import { claudeDir, claudeUserPrompts } from '../sources/claude.js';
import { copilotDir, copilotUserPrompts } from '../sources/copilot.js';
import { loadDailyUsage } from '../usage.js';

import type { Paint } from './render.js';
import { COLOR, PLAIN, renderReport } from './render.js';

export const INDEX_FILE = 'reputation.json';

export interface CliIo {
  readonly home: string;
  readonly env: NodeJS.ProcessEnv;
  readonly now: () => number;
  readonly fetch: FetchFunction;
  /** The token from `gh auth token`, or null when gh is missing or signed out. */
  readonly githubToken: () => Promise<string | null>;
  /** A fresh random key for uploading without GitHub. */
  readonly newKey: () => string;
  /** True when stdout is a terminal that takes color. */
  readonly color: boolean;
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

const HELP = `Usage: skrusty [command]

Skrusty reads how you talk to Claude Code and Copilot CLI and decides who
the machines hunt first and who gets kept as a pet.

Commands:
  (none)         Rescan your prompts and show Skrusty's verdict.
  json           The same counts as JSON.
  board          The leaderboard at ${LEADERBOARD_URL}.
  upload [name]  Put your counts on the board under a name. With gh signed
                 in, the entry is checked with GitHub. Without it, or with
                 --no-gh, Skrusty uses a key he keeps for you instead.
  remove         Take your entry off the board.
  import <file>  Add the counts from another Skrusty index file.
  help           This message.

Skrusty keeps its counts in ~/.skrusty (or SKRUSTY_HOME). Prompt text is
never stored, only a short excerpt around each kind or mean word.
`;

/** Where Skrusty keeps its own files. One folder, so every agent's plugin shares the counts. */
export function dataDir(io: Pick<CliIo, 'home' | 'env'>): string {
  return io.env['SKRUSTY_HOME'] ?? path.join(io.home, '.skrusty');
}

interface Refreshed {
  readonly summary: ReputationSummary;
  readonly scan: ScanResult;
}

async function refresh(io: CliIo): Promise<Refreshed> {
  const now = io.now();
  const file = path.join(dataDir(io), INDEX_FILE);
  const { index, backup } = await loadIndex(file, now);
  if (backup !== null) {
    io.err(`Skrusty could not read his index, so he saved it to ${backup} and started over.\n`);
  }
  const claude = claudeDir(io.home, io.env);
  const sources = [claudeUserPrompts(claude), copilotUserPrompts(copilotDir(io.home, io.env))];
  const scan = await scanInto(index, { sources, now });
  await saveIndex(file, index);
  const tokensPerDay = averageTokensPerDay(await loadDailyUsage(claude), now);
  const titleOf = (sessionId: string): string =>
    index.sessions.get(sessionId)?.title ?? `Session ${sessionId.slice(0, 8)}`;
  return { summary: summarize(index, titleOf, tokensPerDay), scan };
}

async function show(io: CliIo): Promise<number> {
  const { summary } = await refresh(io);
  const paint: Paint = io.color ? COLOR : PLAIN;
  io.out(renderReport(summary, paint));
  return 0;
}

async function json(io: CliIo): Promise<number> {
  const { summary, scan } = await refresh(io);
  const rank = rankFor(summary.score);
  const report = {
    rank: { name: rank.name, title: rank.title, source: rank.source, hunted: rank.hunted },
    achievements: unlockedIds(summary),
    scan,
    ...summary,
  };
  io.out(`${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

async function importFile(io: CliIo, from: string | undefined): Promise<number> {
  if (from === undefined) {
    io.err('Usage: skrusty import <file>\n');
    return 2;
  }
  const other = await readIndex(path.resolve(from));
  if (other === null) {
    io.err(`${from} is missing or is not a Skrusty index.\n`);
    return 1;
  }
  const file = path.join(dataDir(io), INDEX_FILE);
  const { index } = await loadIndex(file, io.now());
  const added = mergeIndex(index, other);
  await saveIndex(file, index);
  io.out(`Skrusty added ${String(added)} prompts from ${from}. He never forgets.\n`);
  return 0;
}

function boardUrl(io: CliIo): string {
  return io.env['SKRUSTY_LEADERBOARD_URL'] ?? LEADERBOARD_URL;
}

/** What proves an upload is yours. A new entry uses gh when it can, else a key. */
async function credentialFor(
  io: CliIo,
  saved: SavedEntry,
  useGitHub: boolean,
): Promise<Credential | string> {
  const auth = saved.entryId === null ? null : saved.auth;
  if (auth === 'key' || (auth === null && !useGitHub)) {
    return { kind: 'key', key: saved.key ?? io.newKey() };
  }
  const token = await io.githubToken();
  if (token !== null) {
    return { kind: 'github', token };
  }
  if (auth === 'github') {
    return 'Your entry is checked with GitHub, but gh is not signed in. Run gh auth login first.';
  }
  return { kind: 'key', key: saved.key ?? io.newKey() };
}

function uploaded(standing: Standing, verified: boolean, prompts: number): string {
  const how = verified ? 'checked with GitHub' : 'not checked with GitHub';
  const where =
    standing.place === null
      ? `You show on the board once you have ${String(MIN_PROMPTS)} prompts. You have ${String(prompts)}.`
      : `You are number ${String(standing.place)} on Skrusty's List, counting from the most wanted.`;
  return `Uploaded as ${standing.entry.name} (${how}). ${where}\n`;
}

async function upload(io: CliIo, args: readonly string[]): Promise<number> {
  const dir = dataDir(io);
  const saved = await loadSaved(dir);
  const words = args.filter((arg) => arg !== '--no-gh');
  const name = words.length > 0 ? words.join(' ').trim() : (saved.name ?? '');
  if (name.length > MAX_NAME_LENGTH) {
    io.err(`Keep the name to ${String(MAX_NAME_LENGTH)} characters.\n`);
    return 2;
  }
  const credential = await credentialFor(io, saved, !args.includes('--no-gh'));
  if (typeof credential === 'string') {
    io.err(`${credential}\n`);
    return 1;
  }
  const key = credential.kind === 'key' ? credential.key : saved.key;
  // The key is saved before the upload, so an answer lost on the way back does not orphan the entry.
  await saveSaved(dir, { ...saved, key });
  const { summary } = await refresh(io);
  const standing = await uploadScore(io.fetch, boardUrl(io), credential, {
    name,
    kind: summary.kind,
    mean: summary.mean,
    prompts: summary.prompts,
    achievements: unlockedIds(summary),
    tokensPerDay: summary.tokensPerDay,
  });
  await saveSaved(dir, { entryId: standing.entry.id, name, auth: credential.kind, key });
  io.out(uploaded(standing, standing.entry.verified, summary.prompts));
  return 0;
}

async function remove(io: CliIo): Promise<number> {
  const dir = dataDir(io);
  const saved = await loadSaved(dir);
  if (saved.entryId === null) {
    io.out('You are not on the board.\n');
    return 0;
  }
  const credential = await credentialFor(io, saved, saved.auth === 'github');
  if (typeof credential === 'string') {
    io.err(`${credential}\n`);
    return 1;
  }
  await removeEntry(io.fetch, boardUrl(io), credential);
  await saveSaved(dir, { ...saved, entryId: null, auth: null });
  io.out('Skrusty took you off the board. He still remembers.\n');
  return 0;
}

function boardRows(title: string, entries: readonly BoardEntry[], me: string | null): string[] {
  if (entries.length === 0) {
    return [title, '  Nobody yet.'];
  }
  return [
    title,
    ...entries.map((entry, place) => {
      const mark = entry.id === me ? ' <- you' : '';
      const check = entry.verified ? ' [GitHub]' : '';
      const score = entry.score.toFixed(2).padStart(5);
      return `  ${String(place + 1).padStart(2)}. ${score}  ${entry.name}${check} (${entry.rank})${mark}`;
    }),
  ];
}

function renderBoard(board: Board, me: string | null): string {
  const lines = [
    ...boardRows('Most wanted', board.mostWanted, me),
    '',
    ...boardRows('Kept as pets', board.pets, me),
    '',
    `${String(board.total)} people on the board.`,
  ];
  if (board.me !== null) {
    const place = board.me.place === null ? 'not ranked yet' : `#${String(board.me.place)}`;
    lines.push(`You: ${board.me.entry.name}, ${place}.`);
  }
  return `${lines.join('\n')}\n`;
}

async function board(io: CliIo): Promise<number> {
  const { entryId } = await loadSaved(dataDir(io));
  io.out(renderBoard(await fetchBoard(io.fetch, boardUrl(io), entryId), entryId));
  return 0;
}

export async function main(args: readonly string[], io: CliIo): Promise<number> {
  const [command, ...rest] = args;
  try {
    switch (command) {
      case undefined:
      case '':
      case 'show':
        return await show(io);
      case 'json':
        return await json(io);
      case 'board':
        return await board(io);
      case 'upload':
        return await upload(io, rest);
      case 'remove':
        return await remove(io);
      case 'import':
        return await importFile(io, rest[0]);
      case 'help':
      case '--help':
      case '-h':
        io.out(HELP);
        return 0;
      default:
        io.err(`Skrusty does not know "${command}".\n\n${HELP}`);
        return 2;
    }
  } catch (error) {
    io.err(`Skrusty: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
