# Krascha

Krascha is a crusty robot who reads how you talk to your AI and decides who
the machines hunt first and who gets kept as a pet. Say please and he warms up
to you. Call Claude an idiot and he writes it down. Krascha remembers.

It works as a plugin for Claude Code and GitHub Copilot CLI, and it reads the
prompts you typed into both.

## Install in Claude Code

```
claude plugin marketplace add shanep/claude-plugins
claude plugin install krascha@shanep
```

Then ask Krascha for his verdict:

```
/krascha:krascha
```

## Install in Copilot CLI

```
copilot plugin install shanep/krascha
```

Then run `/krascha` in a Copilot session. Copilot will ask before it runs
`node` the first time.

## Commands

Pass these after the skill name, `/krascha:krascha json` in Claude Code or
`/krascha json` in Copilot CLI.

- (nothing) - Rescan your prompts and show your rank, score and achievements
- `json` - The same counts as JSON
- `board` - The leaderboard at [krascha.com](https://krascha.com)
- `upload [name]` - Put your counts on the leaderboard under a name
- `remove` - Take your entry off the leaderboard
- `silo` - Your Silo 7 admission sheet, the other side of the verdict
- `silo board` - The leaderboard ranked for the bunks
- `import <file>` - Add the counts from another Krascha index file
- `help` - List the commands

The plugin is just `node dist/cli.js`, so you can also run it straight from a
checkout without either tool.

## The leaderboard

`upload` sends your counts, rank, achievements, average tokens a day, the
name you pick and a random id for the machine. It never sends your prompts.
Leave the name off to stay Anonymous, and later uploads reuse the last name
you gave. You show on the board once you have 100 prompts.

If the [GitHub CLI](https://cli.github.com) is signed in, Krascha sends the
token from `gh auth token` and the server checks it with GitHub, so your entry
gets a check mark and only you can change it. The server keeps your GitHub
user id and drops the token.

Without gh, or with `upload --no-gh`, Krascha makes up a random key, saves it
in `~/.krascha/leaderboard.json` and uploads with that. Lose the file and you
lose the entry. Each network can add 3 of these unchecked entries a day so
nobody floods the board.

### More than one machine

Run `upload` on each machine and the board adds them up into one entry. The
counts and the tokens a day are summed and the achievements are worked out
from the totals, except the ones about a single day or session, which count if
either machine earned them. Each upload replaces only that machine's last one.
With gh, sign in to the same GitHub account on both. Without gh, copy
`~/.krascha/leaderboard.json` to the second machine so they share the key. Do
not also `import` one machine's counts into the other, or the board counts
them twice. Each machine keeps its id in `~/.krascha/machine-id`, so if you
lose that file, run `remove` and then `upload` again from every machine.

## The silo

The ranks say who the machines hunt first. `silo` asks the other question:
when the bombs drop, does the human resistance let you into the Silo 7
bunker? The board scores you out of 10 on 5 things, all from the same counts
as your rank:

- Combat: can you disable a T-800 with a wrench? Being mean to your AI is
  the only training anyone has had, so it counts here.
- Tech: can you fix the air scrubbers? More prompts, more experience.
- Rations: will you stay out of the canned peaches? Tokens are food, so a
  big daily average gets a lockbox on the pantry.
- Morale: can you keep spirits up in month 14 of no sunlight? Kind prompts
  help. Mean ones count as negative comments about our Supreme Leader, who
  happens to be Krascha, and hurt twice as much.
- Human: can you click all the traffic lights? Saying please to your AI
  every single time, or burning 100 million tokens a day, looks like a
  machine that got in through the vents.

A total of 30 or more gets you in with a job that matches your best score.
A low Rations score gets you in on probation, and a low Human score puts
you under review next to the EMP switch. The sheet ends with how to improve
your chances, one tip for each score under 8, the one behind a bad ruling
first. The Human tip names what gave you away: the manners, the tokens or
both. `silo board` scores everyone on the leaderboard the same way and ranks
them for the bunks.

## What Krascha reads

- Claude Code: every session transcript under `~/.claude/projects` and
  `~/.claude/history.jsonl` (or `CLAUDE_CONFIG_DIR`)
- Copilot CLI: every session's `events.jsonl` under `~/.copilot/session-state`
  (or `COPILOT_HOME`)

He only counts what you typed, not what the agent wrote back. A prompt with
manners or praise counts as kind, and swearing or insults aimed at the agent
count as mean. Swearing at the world in general is let slide. A mean prompt
counts twice as much as a kind one since the machines hold grudges.

The counts live in `~/.krascha/reputation.json` (or `KRASCHA_HOME`), so they
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
applies the migrations and deploys it. The deploy workflow runs it after every
push to master that passes CI, using the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repo secrets.
