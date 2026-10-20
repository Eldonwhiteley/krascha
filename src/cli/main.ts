// The skrusty command. With no arguments it rescans your prompts and prints
// Skrusty's verdict. Every command takes its surroundings as arguments, so
// tests can run it against a fake home folder.

import path from 'node:path';

import type { FetchFunction } from '../leaderboard/client.js';
import { fetchBoard } from '../leaderboard/client.js';
import { loadSaved } from '../leaderboard/saved.js';
import { scanInto } from '../reputation/scan.js';
import type { ScanResult } from '../reputation/scan.js';
import { loadIndex, mergeIndex, readIndex, saveIndex } from '../reputation/store.js';
import { summarize } from '../reputation/summarize.js';
import { averageTokensPerDay } from '../reputation/tokens.js';
import { unlockedIds } from '../shared/achievements.js';
import type { Board, BoardEntry } from '../shared/leaderboard.js';
import { LEADERBOARD_URL } from '../shared/leaderboard.js';
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

function boardRows(title: string, entries: readonly BoardEntry[], me: string | null): string[] {
  if (entries.length === 0) {
    return [title, '  Nobody yet.'];
  }
  return [
    title,
    ...entries.map((entry, place) => {
      const mark = entry.id === me ? ' <- you' : '';
      const score = entry.score.toFixed(2).padStart(5);
      return `  ${String(place + 1).padStart(2)}. ${score}  ${entry.name} (${entry.rank})${mark}`;
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
  const base = io.env['SKRUSTY_LEADERBOARD_URL'] ?? LEADERBOARD_URL;
  io.out(renderBoard(await fetchBoard(io.fetch, base, entryId), entryId));
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
