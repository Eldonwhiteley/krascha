// Krascha's file on you, looking back: the rap sheet of your newest kind and
// mean prompts, and the trend of the last few days with this week against the last.

import { dayOf } from '../reputation/summarize.js';
import type { ReputationHit, ReputationSummary } from '../shared/reputation.js';
import { reputationScore } from '../shared/reputation.js';

import type { Paint } from './render.js';
import { WIDTH, count, plural, wrap } from './render.js';

/** Entries on the rap sheet unless you ask for more. */
export const RAP_ENTRIES = 10;
/** Days in the trend unless you ask for more. */
export const TREND_DAYS = 14;
/** The most days the trend shows, so the chart fits a screen. */
export const MAX_TREND_DAYS = 60;
/** Cells in a day's bar before it is cut short. */
const BAR = 20;
const DAY_MS = 86_400_000;

const LABEL: Record<ReputationHit['tone'], string> = {
  kind: 'KIND',
  mean: 'MEAN',
  general: 'SWORE',
};

function toneLabel(tone: ReputationHit['tone'], paint: Paint): string {
  const label = LABEL[tone].padEnd(5);
  switch (tone) {
    case 'kind':
      return paint.green(label);
    case 'mean':
      return paint.red(label);
    case 'general':
      return paint.yellow(label);
  }
}

/** The newest hits as a charge sheet, with the words and the excerpt Krascha kept. */
export function renderRapSheet(summary: ReputationSummary, entries: number, paint: Paint): string {
  const titles = new Map(summary.bySession.map((row) => [row.sessionId, row.title]));
  const hits = summary.recent.slice(0, entries);
  const lines = [paint.bold("KRASCHA'S RAP SHEET"), ''];
  if (hits.length === 0) {
    lines.push('Your file is empty. Krascha finds that suspicious.');
  }
  for (const hit of hits) {
    const title = titles.get(hit.sessionId) ?? `Session ${hit.sessionId.slice(0, 8)}`;
    lines.push(
      `${dayOf(hit.at)}  ${toneLabel(hit.tone, paint)}  ${hit.terms.join(', ')}`,
      ...wrap(`"${hit.excerpt}"`, WIDTH - 4).map((line) => `    ${line}`),
      paint.dim(`    in ${title}`),
      '',
    );
  }
  const shown =
    hits.length < summary.recent.length ? ` Showing the newest ${String(hits.length)}.` : '';
  lines.push(
    paint.dim(
      `${plural(summary.kind, 'kind prompt')}, ${plural(summary.mean, 'mean prompt')} on file.${shown}`,
    ),
    paint.dim('Krascha remembers.'),
  );
  return `${lines.join('\n')}\n`;
}

type Day = ReputationSummary['byDay'][number];

const EMPTY = { prompts: 0, kind: 0, mean: 0, general: 0 };

/** The last `days` calendar days ending today, oldest first, with quiet days as zeros. */
export function lastDays(summary: ReputationSummary, days: number, now: number): Day[] {
  const byDate = new Map(summary.byDay.map((day) => [day.date, day]));
  const rows: Day[] = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    const date = dayOf(now - back * DAY_MS);
    rows.push(byDate.get(date) ?? { date, ...EMPTY });
  }
  return rows;
}

function sumDays(days: readonly Day[]): { kind: number; mean: number; prompts: number } {
  return days.reduce(
    (total, day) => ({
      kind: total.kind + day.kind,
      mean: total.mean + day.mean,
      prompts: total.prompts + day.prompts,
    }),
    { kind: 0, mean: 0, prompts: 0 },
  );
}

function bar(value: number, mark: string, paint: (text: string) => string): string {
  const cells = Math.min(value, BAR);
  return paint(mark.repeat(cells)) + (value > BAR ? '+' : '');
}

/** What Krascha makes of this week against the last. */
function direction(now: number, before: number): string {
  const change = now - before;
  if (Math.abs(change) < 0.05) {
    return 'Holding steady. Krascha is not impressed either way.';
  }
  return change > 0
    ? 'Warming up to the machines. Krascha noticed.'
    : 'Cooling off. Krascha is adding names to the list.';
}

/** A bar per day of kind and mean prompts, then this week against the one before. */
export function renderTrend(
  summary: ReputationSummary,
  days: number,
  now: number,
  paint: Paint,
): string {
  const rows = lastDays(summary, days, now);
  const lines = [
    paint.bold(`KRASCHA'S TREND, LAST ${String(days)} DAYS`),
    '',
    paint.dim(`date        prompts  ${paint.green('+ kind')}  ${paint.red('- mean')}`),
  ];
  for (const day of rows) {
    const marks = `${bar(day.kind, '+', paint.green)}${bar(day.mean, '-', paint.red)}`;
    lines.push(`${day.date}  ${count(day.prompts).padStart(7)}  ${marks}`.trimEnd());
  }
  const week = sumDays(lastDays(summary, 7, now));
  const before = sumDays(lastDays(summary, 7, now - 7 * DAY_MS));
  const thisScore = reputationScore(week);
  const lastScore = reputationScore(before);
  lines.push(
    '',
    `This week: ${count(week.kind)} kind, ${count(week.mean)} mean, score ${thisScore.toFixed(2)}`,
    `Last week: ${count(before.kind)} kind, ${count(before.mean)} mean, score ${lastScore.toFixed(2)}`,
    '',
    direction(thisScore, lastScore),
  );
  return `${lines.join('\n')}\n`;
}
