---
name: krascha
description: Krascha's verdict on how you talk to your AI, with your rank, score and achievements.
argument-hint: "[json | board | rap [count] | trend [days] | upload [name] [--no-gh] | remove | silo [board] | import <file> | help]"
allowed-tools: Bash(node *)
disable-model-invocation: true
---

!`node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" $ARGUMENTS`

If the line above is still a command and not its output, run Krascha yourself with the shell: `node "<plugin root>/dist/cli.js" <arguments>`. The plugin root is two folders up from this skill's base directory, and the arguments are whatever the user typed after the skill's name.

Show Krascha's output to the user exactly as printed, in a plain code block, and add nothing before or after it.
