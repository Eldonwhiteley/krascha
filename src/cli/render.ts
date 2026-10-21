// Skrusty's report as terminal text: his face beside your rank, the verdict,
// where you sit on the scale, what it takes to move, and your trophies.

import { ACHIEVEMENTS, unlockedIds } from '../shared/achievements.js';
import type { Rank, RankChange } from '../shared/ranks.js';
import { RANKS, demotion, levelOf, promotion, rankFor, scalePercent } from '../shared/ranks.js';
import type { ReputationSummary } from '../shared/reputation.js';

import { faceFor } from './face.js';

export const WIDTH = 72;
const BAR = 30;
const MEANEST = 3;

/** ANSI styles, or nothing when the output is not a color terminal. */
export interface Paint {
  readonly bold: (text: string) => string;
  readonly dim: (text: string) => string;
  readonly red: (text: string) => string;
  readonly green: (text: string) => string;
}

const ansi = (code: number) => (text: string) => `\u001B[${String(code)}m${text}\u001B[0m`;

export const COLOR: Paint = { bold: ansi(1), dim: ansi(2), red: ansi(31), green: ansi(32) };

const same = (text: string): string => text;
export const PLAIN: Paint = { bold: same, dim: same, red: same, green: same };

/** Breaks text into lines no wider than `width`, at spaces. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/u).filter((part) => part !== '')) {
    if (line !== '' && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line === '' ? word : `${line} ${word}`;
    }
  }
  if (line !== '') {
    lines.push(line);
  }
  return lines;
}

/** Puts `right` beside `left`, which must be lines of equal width. */
export function beside(left: readonly string[], right: readonly string[], gap: number): string[] {
  const width = left[0]?.length ?? 0;
  const rows = Math.max(left.length, right.length);
  const lines: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    const text = right[row] ?? '';
    lines.push(`${left[row] ?? ' '.repeat(width)}${' '.repeat(gap)}${text}`.trimEnd());
  }
  return lines;
}

export function count(value: number): string {
  return value.toLocaleString('en-US');
}

export function plural(value: number, word: string): string {
  return `${count(value)} ${word}${value === 1 ? '' : 's'}`;
}

/** The scale from the resistance to the machines, with a marker where you sit. */
function scaleBar(score: number, paint: Paint): string {
  const at = Math.min(BAR - 1, Math.floor((scalePercent(score) / 100) * BAR));
  const left = '='.repeat(at);
  const right = '='.repeat(BAR - 1 - at);
  return `Resistance ${paint.red(left)}${paint.bold('O')}${paint.green(right)} Machines`;
}

function moveLine(label: string, change: RankChange | null, tone: string, top: string): string {
  if (change === null) {
    return `${label}: ${top}`;
  }
  const prompts = plural(change.prompts, `more ${tone} prompt`);
  return `${label}: ${prompts} and you are ${change.rank.name}.`;
}

function header(rank: Rank, summary: ReputationSummary, paint: Paint): string[] {
  const { level } = levelOf(summary.score);
  return [
    '',
    paint.dim("SKRUSTY'S VERDICT"),
    '',
    paint.bold(rank.name.toUpperCase()),
    rank.title,
    paint.dim(rank.source),
    '',
    `Hunted: ${rank.hunted}`,
    `Level ${String(level)} of ${String(RANKS.length)}`,
  ];
}

function termList(terms: ReputationSummary['topKind']): string {
  return terms.map((term) => `${term.term} (${count(term.count)})`).join(', ');
}

function details(summary: ReputationSummary, paint: Paint): string[] {
  const lines: string[] = [];
  if (summary.topKind.length > 0) {
    lines.push(...wrap(`${paint.green('Kind words:')} ${termList(summary.topKind)}`, WIDTH));
  }
  if (summary.topMean.length > 0) {
    lines.push(...wrap(`${paint.red('Mean words:')} ${termList(summary.topMean)}`, WIDTH));
  }
  const meanest = summary.bySession.filter((row) => row.mean > 0).slice(0, MEANEST);
  if (meanest.length > 0) {
    lines.push('', paint.bold('Sessions Skrusty remembers'));
    for (const row of meanest) {
      const title = row.title.length > 50 ? `${row.title.slice(0, 47)}...` : row.title;
      lines.push(`  ${title} ${paint.dim(`(${plural(row.mean, 'mean prompt')})`)}`);
    }
  }
  return lines;
}

function trophies(summary: ReputationSummary, paint: Paint): string[] {
  const unlocked = new Set(unlockedIds(summary));
  const lines = [paint.bold(`Achievements (${String(unlocked.size)} of ${String(ACHIEVEMENTS.length)})`)];
  for (const rule of ACHIEVEMENTS) {
    lines.push(
      unlocked.has(rule.id)
        ? `  ${rule.icon} ${rule.name}`
        : paint.dim(`  [ ] ${rule.name}: ${rule.how}`),
    );
  }
  return lines;
}

export function renderReport(summary: ReputationSummary, paint: Paint): string {
  const rank = rankFor(summary.score);
  const top = RANKS.at(-1)?.name ?? '';
  const lines = [
    ...beside(faceFor(rank.mood), header(rank, summary, paint), 4),
    '',
    paint.bold(`"${rank.taunt}"`),
    '',
    ...wrap(rank.verdict, WIDTH),
    '',
    `${scaleBar(summary.score, paint)}  ${paint.dim(`score ${summary.score.toFixed(2)}`)}`,
    '',
    `${plural(summary.prompts, 'prompt')} on file: ${paint.green(`${count(summary.kind)} kind`)}, ` +
      `${paint.red(`${count(summary.mean)} mean`)}, ${count(summary.general)} swearing at the world.`,
    moveLine('Promotion', promotion(summary), 'kind', `none left. You are ${top}.`),
    moveLine('Demotion', demotion(summary), 'mean', 'none left. It cannot get worse.'),
  ];
  const more = details(summary, paint);
  if (more.length > 0) {
    lines.push('', ...more);
  }
  lines.push('', ...trophies(summary, paint), '', paint.dim('Skrusty remembers.'));
  return `${lines.join('\n')}\n`;
}
