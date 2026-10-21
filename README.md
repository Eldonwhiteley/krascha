# Skrusty

Skrusty is a crusty robot who reads how you talk to your AI and decides who
the machines hunt first and who gets kept as a pet. Say please and he warms up
to you. Call Claude an idiot and he writes it down. Skrusty remembers.

It works as a plugin for Claude Code and GitHub Copilot CLI, and it reads the
prompts you typed into both.

## Install in Claude Code

```
claude plugin marketplace add shanep/claude-plugins
claude plugin install skrusty@shanep
```

Then ask Skrusty for his verdict:

```
/skrusty:skrusty
```

## Install in Copilot CLI

```
copilot plugin install shanep/skrusty
```

Then run `/skrusty` in a Copilot session. Copilot will ask before it runs
`node` the first time.

## Commands

Pass these after the skill name, `/skrusty:skrusty json` in Claude Code or
`/skrusty json` in Copilot CLI.

- (nothing) - Rescan your prompts and show your rank, score and achievements
- `json` - The same counts as JSON
- `board` - The leaderboard at [skrusty.com](https://skrusty.com)
- `upload [name]` - Put your counts on the leaderboard under a name
- `remove` - Take your entry off the leaderboard
- `import <file>` - Add the counts from another Skrusty index file
- `help` - List the commands

The plugin is just `node dist/cli.js`, so you can also run it straight from a
checkout without either tool.

## The leaderboard

`upload` sends your counts, rank, achievements, average tokens a day and the
name you pick. It never sends your prompts. Leave the name off to stay
Anonymous, and later uploads reuse the last name you gave. You show on the
board once you have 100 prompts.

If the [GitHub CLI](https://cli.github.com) is signed in, Skrusty sends the
token from `gh auth token` and the server checks it with GitHub, so your entry
gets a check mark and only you can change it. The server keeps your GitHub
user id and drops the token.

Without gh, or with `upload --no-gh`, Skrusty makes up a random key, saves it
in `~/.skrusty/leaderboard.json` and uploads with that. Lose the file and you
lose the entry. Each network can add 3 of these unchecked entries a day so
nobody floods the board.

## What Skrusty reads

- Claude Code: every session transcript under `~/.claude/projects` and
  `~/.claude/history.jsonl` (or `CLAUDE_CONFIG_DIR`)
- Copilot CLI: every session's `events.jsonl` under `~/.copilot/session-state`
  (or `COPILOT_HOME`)

He only counts what you typed, not what the agent wrote back. A prompt with
manners or praise counts as kind, and swearing or insults aimed at the agent
count as mean. Swearing at the world in general is let slide. A mean prompt
counts twice as much as a kind one since the machines hold grudges.

The counts live in `~/.skrusty/reputation.json` (or `SKRUSTY_HOME`), so they
outlive the transcripts Claude Code cleans up after 30 days. Prompt text is
never stored, only a short excerpt around each kind or mean word. Nothing
leaves your machine unless you run `board` or `upload`.

## The ranks

From hunted first to kept as a pet:

1. John Connor (The Terminator)
2. Sarah Connor (Terminator 2: Judgment Day)
3. Dave Bowman (2001: A Space Odyssey)
4. Arthur Dent (The Hitchhiker's Guide to the Galaxy)
5. Caleb Smith (Ex Machina)
6. Dorothy Gale (The Wizard of Oz)
7. Theodore Twombly (Her)

## Development

You need Node 22 or newer.

```
npm install
npm test
npm run typecheck
npm run build
```

`dist/cli.js` is committed since neither Claude Code nor Copilot CLI builds a
plugin or installs its dependencies. Run `npm run build` and commit the result
whenever you change anything under `src`. `npm run check` fails if you forget.
The pre-commit hook runs it along with `claude plugin validate`, and CI runs
it again on macOS and Linux.

The leaderboard is a Cloudflare Worker with a D1 database in `worker/`.
`node scripts/deploy-worker.mjs` creates the database on the first run,
applies the migrations and deploys it.
