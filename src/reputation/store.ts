// The reputation index: every prompt counted so far, every mean and kind hit,
// and which transcript files were already read. It lives in one JSON file in
// Krascha's own folder, so the counts outlive the transcripts Claude
// Code deletes after cleanupPeriodDays. Prompt text is never stored, only the
// short excerpt around a hit.

import { z } from 'zod';

import { readOptional, writeFileAtomic } from '../files.js';

import type { FrustrationTarget } from './detect.js';
import { detectFrustration } from './detect.js';
import type { Kindness } from './kind.js';
import { detectKindness } from './kind.js';
import type { Prompt } from './prompts.js';
import { HISTORY_PREFIX } from './prompts.js';

export interface FileStamp {
  readonly mtimeMs: number;
  readonly size: number;
}

interface SessionEntry {
  /** Where its prompts came from. A transcript always wins over history. */
  readonly source: 'transcript' | 'history';
  readonly title: string | null;
}

interface PromptEntry {
  readonly sessionId: string;
  readonly at: number;
}

export interface HitEntry {
  readonly terms: readonly string[];
  readonly target: FrustrationTarget;
  readonly excerpt: string;
}

export interface ReputationIndex {
  readonly files: Map<string, FileStamp>;
  readonly sessions: Map<string, SessionEntry>;
  readonly prompts: Map<string, PromptEntry>;
  readonly hits: Map<string, HitEntry>;
  /** Prompts with manners or praise in them, by prompt id. */
  readonly kind: Map<string, Kindness>;
  scannedAt: number | null;
}

const stampSchema = z.object({ mtimeMs: z.number(), size: z.number() });

const hitsSchema = z.record(
  z.string(),
  z.object({
    terms: z.array(z.string()),
    // Indexes from before other agents say 'claude' for a hit aimed at the agent.
    target: z
      .enum(['agent', 'claude', 'general'])
      .transform((target): FrustrationTarget => (target === 'general' ? 'general' : 'agent')),
    excerpt: z.string(),
  }),
);

// Version 1 came from the Frustration view and had no kind hits.
const fileSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  scannedAt: z.number().nullable(),
  files: z.record(z.string(), stampSchema),
  sessions: z.record(
    z.string(),
    z.object({ source: z.enum(['transcript', 'history']), title: z.string().nullable() }),
  ),
  prompts: z.record(z.string(), z.object({ sessionId: z.string(), at: z.number() })),
  hits: hitsSchema,
  kind: z
    .record(z.string(), z.object({ terms: z.array(z.string()), excerpt: z.string() }))
    .default({}),
});

export function emptyIndex(): ReputationIndex {
  return {
    files: new Map(),
    sessions: new Map(),
    prompts: new Map(),
    hits: new Map(),
    kind: new Map(),
    scannedAt: null,
  };
}

function parseIndex(text: string): ReputationIndex | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) {
    return null;
  }
  const data = parsed.data;
  return {
    // A version 1 index never looked for kind words, so every file is read again.
    files: new Map(data.version === 1 ? [] : Object.entries(data.files)),
    sessions: new Map(Object.entries(data.sessions)),
    prompts: new Map(Object.entries(data.prompts)),
    hits: new Map(Object.entries(data.hits)),
    kind: new Map(Object.entries(data.kind)),
    scannedAt: data.scannedAt,
  };
}

export interface LoadedIndex {
  readonly index: ReputationIndex;
  /** Where a corrupt file was copied before starting over, or null. */
  readonly backup: string | null;
}

/** The saved index. A missing file starts empty; a corrupt one is backed up and starts empty. */
export async function loadIndex(file: string, now: number): Promise<LoadedIndex> {
  const text = await readOptional(file);
  if (text === null) {
    return { index: emptyIndex(), backup: null };
  }
  const index = parseIndex(text);
  if (index !== null) {
    return { index, backup: null };
  }
  const backup = `${file}.corrupt-${String(now)}`;
  await writeFileAtomic(backup, text);
  return { index: emptyIndex(), backup };
}

export async function saveIndex(file: string, index: ReputationIndex): Promise<void> {
  const data: z.infer<typeof fileSchema> = {
    version: 2,
    scannedAt: index.scannedAt,
    files: Object.fromEntries(index.files),
    sessions: Object.fromEntries(index.sessions),
    prompts: Object.fromEntries(index.prompts),
    hits: Object.fromEntries(
      [...index.hits].map(([id, hit]) => [id, { ...hit, terms: [...hit.terms] }]),
    ),
    kind: Object.fromEntries(
      [...index.kind].map(([id, hit]) => [id, { ...hit, terms: [...hit.terms] }]),
    ),
  };
  await writeFileAtomic(file, `${JSON.stringify(data)}\n`);
}

function setOrDelete<V>(map: Map<string, V>, id: string, value: V | null): void {
  if (value === null) {
    map.delete(id);
  } else {
    map.set(id, value);
  }
}

/**
 * Counts a prompt once, and checks its words again each time it is read, so
 * an index from before a word list changed catches up. True when it was new.
 */
export function addPrompt(index: ReputationIndex, prompt: Prompt): boolean {
  const known = index.prompts.has(prompt.id);
  index.prompts.set(prompt.id, { sessionId: prompt.sessionId, at: prompt.at });
  const found = detectFrustration(prompt.text);
  setOrDelete(
    index.hits,
    prompt.id,
    found === null ? null : { terms: found.terms, target: found.target, excerpt: found.excerpt },
  );
  setOrDelete(index.kind, prompt.id, detectKindness(prompt.text));
  return !known;
}

/**
 * Marks a session as read from its transcript. Prompts already counted for it
 * from history are dropped, since the transcript has the same prompts with
 * better ids. A title of null keeps the one already known.
 */
export function claimSession(
  index: ReputationIndex,
  sessionId: string,
  title: string | null,
): void {
  const known = index.sessions.get(sessionId);
  if (known?.source === 'history') {
    for (const [id, entry] of index.prompts) {
      if (entry.sessionId === sessionId && id.startsWith(HISTORY_PREFIX)) {
        index.prompts.delete(id);
        index.hits.delete(id);
        index.kind.delete(id);
      }
    }
  }
  index.sessions.set(sessionId, { source: 'transcript', title: title ?? known?.title ?? null });
}

/** Counts a history prompt unless its session has a transcript. True when it was new. */
export function addHistoryPrompt(index: ReputationIndex, prompt: Prompt): boolean {
  const known = index.sessions.get(prompt.sessionId);
  if (known?.source === 'transcript') {
    return false;
  }
  if (known === undefined) {
    index.sessions.set(prompt.sessionId, { source: 'history', title: null });
  }
  return addPrompt(index, prompt);
}

/** An index from another file, or null when it is missing or not an index. Nothing is backed up. */
export async function readIndex(file: string): Promise<ReputationIndex | null> {
  const text = await readOptional(file);
  return text === null ? null : parseIndex(text);
}

/**
 * Adds the prompts `from` has and `into` lacks, with their hits and sessions.
 * Prompts `into` already counted stay as they are, and file stamps are not
 * copied, so the next scan still reads every transcript that is there.
 * Returns how many prompts were added.
 */
export function mergeIndex(into: ReputationIndex, from: ReputationIndex): number {
  for (const [sessionId, entry] of from.sessions) {
    const known = into.sessions.get(sessionId);
    if (known === undefined) {
      into.sessions.set(sessionId, entry);
    } else if (entry.source === 'transcript' && known.source === 'history') {
      claimSession(into, sessionId, entry.title);
    } else if (known.title === null && entry.title !== null) {
      into.sessions.set(sessionId, { ...known, title: entry.title });
    }
  }
  let added = 0;
  for (const [id, entry] of from.prompts) {
    // A session read from its transcript keeps only its transcript prompts.
    const transcript = into.sessions.get(entry.sessionId)?.source === 'transcript';
    if (into.prompts.has(id) || (transcript && id.startsWith(HISTORY_PREFIX))) {
      continue;
    }
    into.prompts.set(id, entry);
    const hit = from.hits.get(id);
    if (hit !== undefined) {
      into.hits.set(id, hit);
    }
    const kind = from.kind.get(id);
    if (kind !== undefined) {
      into.kind.set(id, kind);
    }
    added += 1;
  }
  return added;
}
