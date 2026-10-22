// How long you spend with your AI, from when you typed each prompt. A prompt
// counts the time until your next one in any session, up to PROMPT_MINUTES,
// so a break or a night away adds nothing and two sessions side by side are
// not counted twice.

/** The most one prompt counts for, the last one included. */
export const PROMPT_MINUTES = 30;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Hours from the times prompts were typed, in any order, or 0 with none. */
export function hoursSpent(times: readonly number[]): number {
  const cap = PROMPT_MINUTES * MINUTE_MS;
  const sorted = times.toSorted((left, right) => left - right);
  const spent = sorted.reduce((total, at, index) => {
    const next = sorted[index + 1];
    return total + (next === undefined ? cap : Math.min(next - at, cap));
  }, 0);
  return spent / HOUR_MS;
}
