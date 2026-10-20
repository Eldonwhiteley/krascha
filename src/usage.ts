// Claude Code's daily token totals, from ~/.claude/stats-cache.json. The file
// is undocumented, so anything that does not look right is skipped.

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

export async function loadDailyUsage(claudeConfigDir: string): Promise<DailyUsage[]> {
  return dailyUsage(await readJsonOrUndefined(path.join(claudeConfigDir, 'stats-cache.json')));
}
