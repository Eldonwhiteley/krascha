// Claude Code's daily and lifetime token totals, from ~/.claude/stats-cache.json.
// The file is undocumented, so anything that does not look right is skipped.

import path from 'node:path';

import { readJsonOrUndefined } from './files.js';

export interface DailyUsage {
  /** Local date, YYYY-MM-DD. */
  readonly date: string;
  readonly tokensByModel: Readonly<Record<string, number>>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/u;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tokensOf(value: unknown): Record<string, number> {
  const tokens: Record<string, number> = {};
  if (isRecord(value)) {
    for (const [model, count] of Object.entries(value)) {
      if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
        tokens[model] = count;
      }
    }
  }
  return tokens;
}

/** The days in parsed stats-cache JSON, oldest first. */
export function dailyUsage(stats: unknown): DailyUsage[] {
  const days: unknown = isRecord(stats) ? stats['dailyModelTokens'] : undefined;
  if (!Array.isArray(days)) {
    return [];
  }
  const parsed: DailyUsage[] = [];
  for (const day of days as readonly unknown[]) {
    const date: unknown = isRecord(day) ? day['date'] : undefined;
    if (isRecord(day) && typeof date === 'string' && DATE.test(date)) {
      parsed.push({ date, tokensByModel: tokensOf(day['tokensByModel']) });
    }
  }
  return parsed.toSorted((left, right) => left.date.localeCompare(right.date));
}

/** The token counts each model's usage adds up, the same ones the daily totals count. */
const USAGE_FIELDS = [
  'inputTokens',
  'outputTokens',
  'cacheReadInputTokens',
  'cacheCreationInputTokens',
] as const;

/**
 * Every token Claude Code has counted, from its running total per model. The
 * daily totals only go back a few weeks, so it takes them instead when they
 * add up to more.
 */
export function lifetimeTokens(stats: unknown): number {
  const models: unknown = isRecord(stats) ? stats['modelUsage'] : undefined;
  const tallied = isRecord(models)
    ? Object.values(models).reduce<number>((sum, usage) => {
        const counts = isRecord(usage) ? tokensOf(usage) : {};
        return sum + USAGE_FIELDS.reduce((total, field) => total + (counts[field] ?? 0), 0);
      }, 0)
    : 0;
  const daily = dailyUsage(stats).reduce(
    (sum, day) =>
      sum + Object.values(day.tokensByModel).reduce((total, tokens) => total + tokens, 0),
    0,
  );
  return Math.max(tallied, daily);
}

export interface Usage {
  readonly days: readonly DailyUsage[];
  readonly lifetimeTokens: number;
}

export async function loadUsage(claudeConfigDir: string): Promise<Usage> {
  const stats = await readJsonOrUndefined(path.join(claudeConfigDir, 'stats-cache.json'));
  return { days: dailyUsage(stats), lifetimeTokens: lifetimeTokens(stats) };
}
