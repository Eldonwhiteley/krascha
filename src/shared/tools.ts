// The agents Krascha reads, by the names the board shows. A prompt's id says
// which one it was typed into, so the CLI can tell the board what you use
// without sending anything else.

export const TOOLS = [
  { id: 'claude', name: 'Claude Code' },
  { id: 'copilot', name: 'Copilot CLI' },
] as const;

export type ToolId = (typeof TOOLS)[number]['id'];

/** Copilot CLI prompt ids start with this. Claude Code's start with t: or h:. */
export const COPILOT_PREFIX = 'c:';

export function toolOf(promptId: string): ToolId {
  return promptId.startsWith(COPILOT_PREFIX) ? 'copilot' : 'claude';
}

/** The ids Krascha knows, once each and in list order, so a retired or made up one just stops showing. */
export function knownTools(ids: readonly string[]): ToolId[] {
  return TOOLS.filter((tool) => ids.includes(tool.id)).map((tool) => tool.id);
}

/** "Claude Code", "Copilot CLI" or "Claude Code and Copilot CLI". Empty for an upload that did not say. */
export function toolNames(ids: readonly string[]): string {
  const known = new Set<string>(knownTools(ids));
  return TOOLS.filter((tool) => known.has(tool.id))
    .map((tool) => tool.name)
    .join(' and ');
}
