// The entry point esbuild bundles into dist/cli.js.

import os from 'node:os';

import { main } from './main.js';

const color = process.stdout.isTTY && process.env['NO_COLOR'] === undefined;

process.exitCode = await main(process.argv.slice(2), {
  home: os.homedir(),
  env: process.env,
  now: Date.now,
  fetch: async (url, init) => fetch(url, init),
  color,
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
});
