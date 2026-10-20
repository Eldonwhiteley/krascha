// Bundles the CLI and everything it imports into dist/cli.js. The plugin runs
// that one file with node, since neither Claude Code nor Copilot CLI builds a
// plugin or installs its dependencies.

import { build } from 'esbuild';

await build({
  entryPoints: ['src/cli/index.ts'],
  outfile: 'dist/cli.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: { js: '#!/usr/bin/env node' },
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
});
