// The prompts a person typed to Copilot Chat in VS Code. VS Code keeps a chat
// opened in a folder under <user>/workspaceStorage/<workspace>/chatSessions and
// one opened in an empty window under <user>/globalStorage/emptyWindowChatSessions.
// An older chat is a .json file holding the whole session. A newer one is a
// .jsonl log: the first line (kind 0) is the session as it started, and every
// line after sets (kind 1) or appends to (kind 2) the value at the path k.
// What the person typed is a request's message.text. Checked against VS Code
// 1.143.1.

import path from 'node:path';

import { z } from 'zod';

import { readAllLines, readOptional } from '../files.js';
import type { Prompt } from '../reputation/prompts.js';
import { typedText } from '../reputation/prompts.js';
import { COPILOT_PREFIX } from '../shared/tools.js';

import { shortTitle } from './claude.js';
import { listDir, stampOf } from './listing.js';
import type { PromptFile, PromptFileRead, UserPrompts } from './types.js';

/** The VS Code builds that ship Copilot Chat, by the folder each keeps its settings in. */
const EDITIONS = ['Code', 'Code - Insiders'] as const;

/** Each VS Code build's User folder, where it keeps its chats. */
export function vscodeDirs(home: string, env: NodeJS.ProcessEnv, platform: string): string[] {
  const config =
    platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support')
      : (env['XDG_CONFIG_HOME'] ?? path.join(home, '.config'));
  return EDITIONS.map((edition) => path.join(config, edition, 'User'));
}

const requestSchema = z.object({
  requestId: z.string().min(1),
  timestamp: z.number().optional(),
  message: z.object({ text: z.string() }),
});

const sessionSchema = z.object({
  customTitle: z.string().nullish(),
  requests: z.array(z.unknown()).catch([]),
});

const changeSchema = z.object({
  kind: z.number(),
  k: z.array(z.union([z.string(), z.number()])).optional(),
  v: z.unknown(),
});

function parseJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return null;
  }
}

function vscodePrompt(request: unknown, file: PromptFile): Prompt | null {
  const parsed = requestSchema.safeParse(request);
  const record = parsed.success ? parsed.data : null;
  const text = record === null ? null : typedText(record.message.text);
  if (record === null || text === null || text.startsWith('/')) {
    return null;
  }
  return {
    id: `${COPILOT_PREFIX}${record.requestId}`,
    sessionId: file.sessionId ?? '',
    at: record.timestamp ?? file.stamp?.mtimeMs ?? 0,
    text,
  };
}

/** The requests and title in a .jsonl log, from its first line and every request appended after. */
async function fromLog(file: string): Promise<{ requests: unknown[]; title: string | null }> {
  const requests: unknown[] = [];
  let title: string | null = null;
  for await (const line of readAllLines(file)) {
    // Most lines are the agent's answer streaming in, so skip them unparsed.
    const wanted =
      line.startsWith('{"kind":0') ||
      line.includes('"k":["requests"]') ||
      line.includes('"k":["customTitle"]');
    const parsed = wanted ? changeSchema.safeParse(parseJson(line)) : null;
    if (parsed?.success !== true) {
      continue;
    }
    const { kind, k, v } = parsed.data;
    const key = k?.join('.');
    if (kind === 0) {
      const session = sessionSchema.safeParse(v);
      if (session.success) {
        requests.push(...session.data.requests);
        title = session.data.customTitle ?? title;
      }
    } else if (kind === 2 && key === 'requests' && Array.isArray(v)) {
      requests.push(...z.array(z.unknown()).parse(v));
    } else if (kind === 1 && key === 'customTitle' && typeof v === 'string') {
      title = v;
    }
  }
  return { requests, title };
}

async function fromSession(file: string): Promise<{ requests: unknown[]; title: string | null }> {
  const session = sessionSchema.safeParse(parseJson((await readOptional(file)) ?? ''));
  return session.success
    ? { requests: session.data.requests, title: session.data.customTitle ?? null }
    : { requests: [], title: null };
}

async function read(file: PromptFile): Promise<PromptFileRead> {
  const { requests, title } = file.path.endsWith('.jsonl')
    ? await fromLog(file.path)
    : await fromSession(file.path);
  const prompts: Prompt[] = [];
  for (const request of requests) {
    const prompt = vscodePrompt(request, file);
    if (prompt !== null) {
      prompts.push(prompt);
    }
  }
  const trimmed = title?.trim() ?? '';
  return { prompts, title: trimmed === '' ? null : shortTitle(trimmed) };
}

/** Every chat file in one folder, named <session-id>.json or .jsonl. */
async function chats(dir: string): Promise<PromptFile[]> {
  const files: PromptFile[] = [];
  for (const entry of await listDir(dir)) {
    const ext = path.extname(entry.name);
    if (!entry.isFile() || (ext !== '.json' && ext !== '.jsonl')) {
      continue;
    }
    const file = path.join(dir, entry.name);
    const stamp = await stampOf(file);
    if (stamp !== null) {
      files.push({
        path: file,
        stamp,
        kind: 'transcript',
        sessionId: entry.name.slice(0, -ext.length),
      });
    }
  }
  return files;
}

export function vscodeUserPrompts(userDirs: readonly string[]): UserPrompts {
  return {
    files: async (): Promise<PromptFile[]> => {
      const files: PromptFile[] = [];
      for (const userDir of userDirs) {
        const workspaces = path.join(userDir, 'workspaceStorage');
        for (const workspace of await listDir(workspaces)) {
          if (workspace.isDirectory()) {
            files.push(...(await chats(path.join(workspaces, workspace.name, 'chatSessions'))));
          }
        }
        files.push(
          ...(await chats(path.join(userDir, 'globalStorage', 'emptyWindowChatSessions'))),
        );
      }
      return files;
    },
    read,
  };
}
