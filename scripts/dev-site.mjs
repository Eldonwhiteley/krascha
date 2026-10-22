// Runs krascha.com on this machine, for working on the pages. It bundles the
// Worker with esbuild, rebuilds it on every save under worker/src or src, and
// answers each request with the Worker's own handle(), so the routes match the
// real site. The store is swapped for one that only reads a board: the live
// one from krascha.com, or a JSON file with --board. Nothing touches D1, so
// uploads and removals fail and likes count up without being saved. An open
// page reloads itself after each rebuild.
//
//   npm run site
//   npm run site -- --board worker/fixtures/board.json
//   npm run site -- --board worker/fixtures/empty-board.json --port 3000

import { context, formatMessages } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = path.join(ROOT, 'worker', 'src', 'worker.ts');
const STORE = path.join(ROOT, 'worker', 'src', 'store.ts');
const LIVE_BOARD = 'https://krascha.com/api/board';
const HOST = '127.0.0.1';
const RELOAD_PATH = '/_dev/reload';
const RELOAD_SCRIPT = `<script>new EventSource('${RELOAD_PATH}').onmessage = () => location.reload();</script>`;
// The bundled store reads the board through this, since each rebuild is a new module.
const BOARD_HOOK = '__kraschaDevBoard';

const { values } = parseArgs({
  options: {
    board: { type: 'string' },
    port: { type: 'string', default: '8787' },
  },
});

/** One line to the terminal. */
function say(line) {
  process.stdout.write(`${line}\n`);
}

async function liveBoard() {
  const response = await fetch(LIVE_BOARD);
  if (!response.ok) {
    throw new Error(`${LIVE_BOARD} answered ${String(response.status)}. Try --board worker/fixtures/board.json.`);
  }
  return response.json();
}

// npm runs scripts from the repo root, so a relative --board is taken from where npm was run.
const boardFile =
  values.board === undefined ? null : path.resolve(process.env.INIT_CWD ?? process.cwd(), values.board);
globalThis[BOARD_HOOK] =
  boardFile === null ? liveBoard : async () => JSON.parse(await readFile(boardFile, 'utf8'));

// Everything else in the store is the real thing, and fails on the database below.
const STUB_STORE = `
export * from ${JSON.stringify(STORE)};
const board = () => globalThis.${BOARD_HOOK}();
export async function readBoard() {
  return board();
}
export async function likeEntry(_database, { entry }) {
  const { mostWanted, pets } = await board();
  const found = [...mostWanted, ...pets].find((listed) => listed.id === entry);
  return found === undefined ? null : (found.likes ?? 0) + 1;
}
`;

const stubStore = {
  name: 'stub-store',
  setup(build) {
    build.onResolve({ filter: /^\.\/store\.js$/ }, (args) =>
      args.importer === WORKER ? { path: 'store', namespace: 'stub-store' } : undefined,
    );
    build.onLoad({ filter: /.*/, namespace: 'stub-store' }, () => ({
      contents: STUB_STORE,
      resolveDir: ROOT,
      loader: 'js',
    }));
  },
};

const env = {
  DB: {
    prepare() {
      throw new Error('The local site has no database, so it only reads the board.');
    },
  },
};
const deps = {
  fetch: async (url, init) => fetch(url, init),
  now: () => Date.now(),
  newId: () => crypto.randomUUID(),
};

let handle = null;
let failure = null;
let builds = 0;
const watchers = new Set();
let firstBuild;
const ready = new Promise((resolve) => {
  firstBuild = resolve;
});

const reload = {
  name: 'reload',
  setup(build) {
    build.onEnd(async (result) => {
      builds += 1;
      if (result.errors.length > 0) {
        failure = (await formatMessages(result.errors, { kind: 'error' })).join('\n');
        say(failure);
      } else {
        const code = Buffer.from(result.outputFiles[0].text).toString('base64');
        ({ handle } = await import(`data:text/javascript;base64,${code}`));
        failure = null;
        if (builds > 1) {
          say(`Rebuilt at ${new Date().toLocaleTimeString()}.`);
        }
      }
      for (const watcher of watchers) {
        watcher.write('data: reload\n\n');
      }
      firstBuild();
    });
  },
};

const builder = await context({
  entryPoints: [WORKER],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  write: false,
  outfile: 'site.js',
  logLevel: 'silent',
  plugins: [stubStore, reload],
});
await builder.watch();
await ready;

async function body(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks);
}

async function answer(request, response) {
  if (request.url === RELOAD_PATH) {
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
    watchers.add(response);
    request.on('close', () => watchers.delete(response));
    return;
  }
  if (failure !== null) {
    response.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<pre>${failure.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>${RELOAD_SCRIPT}`);
    return;
  }
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? HOST}`);
  const sent = await body(request);
  const served = await handle(
    new Request(url, {
      method: request.method,
      headers: Object.entries(request.headers).filter(([, value]) => typeof value === 'string'),
      ...(sent === undefined ? {} : { body: sent }),
    }),
    env,
    deps,
  );
  const headers = Object.fromEntries(served.headers);
  // The real site lets browsers keep a page for a minute, which would hide edits here.
  headers['cache-control'] = 'no-store';
  let page = Buffer.from(await served.arrayBuffer());
  if ((headers['content-type'] ?? '').startsWith('text/html')) {
    page = Buffer.from(page.toString('utf8').replace('</body>', `${RELOAD_SCRIPT}\n</body>`));
    delete headers['content-length'];
  }
  response.writeHead(served.status, headers);
  response.end(page);
}

const server = createServer((request, response) => {
  answer(request, response).catch((error) => {
    say(String(error?.stack ?? error));
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(String(error?.message ?? error));
  });
});
server.on('error', (error) => {
  say(error.code === 'EADDRINUSE' ? `Port ${values.port} is taken. Try --port.` : String(error));
  process.exit(1);
});
server.listen(Number(values.port), HOST, () => {
  say(`Krascha's List is running at http://${HOST}:${values.port}`);
  say(`The board comes from ${boardFile ?? LIVE_BOARD}. Pages reload when you save. Ctrl-C stops it.`);
});
