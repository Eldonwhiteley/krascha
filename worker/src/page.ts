// The public leaderboard page, rendered on the server so it needs no script:
// who the machines hunt first, who they keep as pets, and who the human
// resistance lets into Silo 7.

import { ACHIEVEMENTS, achievementsOf } from '../../src/shared/achievements.js';
import type { Board, BoardEntry } from '../../src/shared/leaderboard.js';
import { MIN_PROMPTS } from '../../src/shared/leaderboard.js';
import { scalePercent } from '../../src/shared/ranks.js';
import {
  ADMIT_TOTAL,
  CRITERIA,
  LOW,
  MAX_SCORE,
  STATUS_LABEL,
  notesFor,
  rankBoard,
} from '../../src/shared/silo.js';
import { TOOLS, toolNames } from '../../src/shared/tools.js';

import { robotIcon, robotStyle, robotSvg } from './robot.js';

/** Where Krascha lives, so visitors can get it and upload their own score. */
export const REPO_URL = 'https://github.com/shanep/krascha';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replaceAll(/[&<>"']/gu, (char) => ESCAPES[char] ?? char);
}

function count(value: number): string {
  return value.toLocaleString('en-US');
}

const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** The counts under a name, with the token average once there is one. */
function counts(entry: BoardEntry): string {
  const tokens = entry.tokensPerDay ?? 0;
  const base = `${count(entry.kind)} nice, ${count(entry.mean)} mean`;
  return tokens > 0 ? `${base}, ${COMPACT.format(tokens)} tokens a day` : base;
}

function trophies(ids: readonly string[]): string {
  const earned = achievementsOf(ids);
  if (earned.length === 0) {
    return '';
  }
  const label = `Achievements: ${earned.map((rule) => rule.name).join(', ')}`;
  const icons = earned.map(
    (rule) =>
      `<span title="${escapeHtml(`${rule.name}: ${rule.how}`)}">${escapeHtml(rule.icon)}</span>`,
  );
  return `<span class="trophies" role="img" aria-label="${escapeHtml(label)}">${icons.join('')}</span>`;
}

/** A tag for each agent the entry was typed into, so you can see who talks to what. */
function tools(ids: readonly string[]): string {
  const used = TOOLS.filter((tool) => ids.includes(tool.id));
  if (used.length === 0) {
    return '';
  }
  const tags = used.map((tool) => `<span class="tool ${tool.id}">${escapeHtml(tool.name)}</span>`);
  return ` <span class="tools" role="img" aria-label="${escapeHtml(`Uses ${toolNames(ids)}`)}">${tags.join('')}</span>`;
}

const CHECK = ' <span class="verified" title="Checked with GitHub">✓</span>';

/** The name, linked to the GitHub account when there is one. */
function shownName(entry: Pick<BoardEntry, 'name' | 'github'>): string {
  const strong = `<strong>${escapeHtml(entry.name)}</strong>`;
  return entry.github === undefined
    ? strong
    : `<a class="github" href="https://github.com/${escapeHtml(entry.github)}">${strong}</a>`;
}

/** The name, the GitHub check and the agents, the start of every row. */
function name(entry: Pick<BoardEntry, 'name' | 'verified' | 'tools' | 'github'>): string {
  return `${shownName(entry)}${entry.verified ? CHECK : ''}${tools(entry.tools ?? [])}`;
}

/** The scale from the resistance to the machines with a knob where the score sits, like the one in `krascha`. */
function scale(score: number): string {
  const at = scalePercent(score);
  const label = `${String(Math.round(at))}% of the way from the resistance to the machines`;
  return `<span class="scale" role="img" aria-label="${label}"><span class="end">Resistance</span><span class="track" style="--at: ${at.toFixed(1)}%"><span class="knob"></span></span><span class="end">Machines</span></span>`;
}

/** What the machines put next to the top name on a list. */
const TOP = {
  wanted: ' <span class="target">TARGET ACQUIRED</span>',
  pets: ' <span class="hearts" aria-hidden="true"><span>💕</span><span>💖</span><span>💕</span></span>',
} as const;

function rows(entries: readonly BoardEntry[], empty: string, top: keyof typeof TOP): string {
  if (entries.length === 0) {
    return `<p class="empty">${escapeHtml(empty)}</p>`;
  }
  const items = entries.map(
    (entry, index) => `
      <li>
        <span class="place">${String(index + 1)}</span>
        <span class="who">
          ${name(entry)}${index === 0 ? TOP[top] : ''}
          <span class="rank">${escapeHtml(entry.rank)}</span>
          ${trophies(entry.achievements ?? [])}
        </span>
        <span class="counts">${counts(entry)}</span>
        <span class="score">${String(Math.round(entry.score * 100))}</span>
        ${scale(entry.score)}
      </li>`,
  );
  return `<ol>${items.join('')}</ol>`;
}

const NOTHING = 'Nothing stands out. The board respects that.';

/** Everyone on the board, scored by the Silo 7 Admission Review Board like `krascha silo board`. */
function silo(board: Board): string {
  const entries = new Map(
    [...(board.bunks ?? []), ...board.mostWanted, ...board.pets].map((entry) => [entry.id, entry]),
  );
  const ranked = rankBoard(board);
  const items = ranked.map(({ id, score }, index) => {
    const scores = CRITERIA.map(
      (criterion) => `${criterion.name} ${String(score.scores[criterion.id])}`,
    );
    return `
      <li style="--row: ${String(index)}">
        <span class="place">${String(index + 1)}</span>
        <span class="who">
          ${name(entries.get(id) ?? { name: score.name, verified: false })}
          <span class="rank"><span class="stamp ${score.status}">${STATUS_LABEL[score.status]}</span>, ${escapeHtml(score.ruling)}</span>
        </span>
        <span class="counts">${scores.join(', ')}<span class="note">${escapeHtml(notesFor(score)[0] ?? NOTHING)}</span></span>
        <span class="score">${String(score.total)}<span class="out-of">/${String(MAX_SCORE * CRITERIA.length)}</span></span>
      </li>`;
  });
  const list =
    items.length === 0
      ? '<p class="empty">Nobody applied. More peaches for the board.</p>'
      : `<ol>${items.join('')}</ol>`;
  const tips = CRITERIA.map(
    (criterion) => `
      <li><strong>${escapeHtml(criterion.name)}:</strong> ${escapeHtml(criterion.tip)}</li>`,
  );
  const most = String(MAX_SCORE * CRITERIA.length);
  return `<section class="silo" aria-labelledby="silo">
    <span class="classified" aria-hidden="true">EYES ONLY</span>
    <h2 id="silo">🛡️ Silo 7 admissions</h2>
    <p class="sub">The human resistance scores everyone on the board for a bunk${ranked.length > 1 ? `, and these are the best ${String(ranked.length)}` : ''}. Supreme Leader: Krascha. The board is aware of the problem.</p>
    ${list}
    <h3>How to improve your chances</h3>
    <p class="sub">${String(ADMIT_TOTAL)} of ${most} gets you a bunk with no conditions. A Human of ${String(LOW)} or less means a second Voight-Kampff test, and Rations of ${String(LOW)} or less gets the pantry a lockbox.</p>
    <ul class="tips">${tips.join('')}
    </ul>
  </section>`;
}

/** Every trophy, earned by anyone or not, so the icons next to names mean something. */
function legend(): string {
  const items = ACHIEVEMENTS.map(
    (rule) => `
        <div><dt><span aria-hidden="true">${escapeHtml(rule.icon)}</span> ${escapeHtml(rule.name)}</dt><dd>${escapeHtml(rule.how)}</dd></div>`,
  );
  return `<section class="legend" aria-labelledby="legend">
    <h2 id="legend">🏆 Achievements</h2>
    <p class="sub">What the icons next to a name mean.</p>
    <dl>${items.join('')}
    </dl>
  </section>`;
}

const STYLE = `
:root { --bg: #fafafa; --fg: #1f2328; --muted: #656d76; --card: #ffffff; --line: #d0d7de;
  --red: #cf222e; --green: #1a7f37; --amber: #9a6700; --link: #0969da;
  --claude: #b4532a; --copilot: #8250df; color-scheme: light dark; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #0d1117; --fg: #e6edf3; --muted: #8d96a0; --card: #161b22; --line: #30363d;
    --red: #ff7b72; --green: #3fb950; --amber: #d29922; --link: #4493f8;
    --claude: #e8916a; --copilot: #a371f7; }
}
* { box-sizing: border-box; }
body { margin: 0; padding: 24px 16px 48px; background: var(--bg); color: var(--fg);
  font: 15px/1.5 system-ui, -apple-system, sans-serif; }
main { max-width: 960px; margin: 0 auto; }
h1 { display: flex; gap: 12px; align-items: center; margin: 0 0 4px; font-size: 1.8em; }
.robot { width: 1.8em; height: 1.8em; flex: none; }
${robotStyle('robot')}
.lead { margin: 0 0 24px; color: var(--muted); }
.lists { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
section { padding: 12px 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); }
section.wanted { border-top: 4px solid var(--red); }
section.pets { border-top: 4px solid var(--green); }
h2 { margin: 0 0 2px; font-size: 1.15em; }
.sub { margin: 0 0 8px; color: var(--muted); font-size: 0.9em; }
ol { margin: 0; padding: 0; list-style: none; }
li { display: grid; gap: 0 10px; grid-template-columns: 2em 1fr auto; align-items: baseline;
  padding: 6px 0; border-top: 1px solid var(--line); }
li:first-child { border-top: 0; }
.place { color: var(--muted); font-weight: 700; text-align: right; }
.who { min-width: 0; overflow-wrap: anywhere; }
.verified { color: var(--green); font-weight: 700; }
.github { color: inherit; text-underline-offset: 2px; }
.tools { display: inline-flex; gap: 4px; vertical-align: 0.1em; }
.tool { padding: 0 6px; border: 1px solid currentColor; border-radius: 999px; font-size: 0.7em;
  font-weight: 600; line-height: 1.5; white-space: nowrap; }
.tool.claude { color: var(--claude); }
.tool.copilot { color: var(--copilot); }
.rank { display: block; color: var(--muted); font-size: 0.85em; }
.trophies { display: block; letter-spacing: 2px; cursor: default; }
.counts { grid-column: 2; color: var(--muted); font-size: 0.85em; }
.score { grid-row: 1 / span 2; grid-column: 3; font-weight: 700; font-variant-numeric: tabular-nums; }
.scale { grid-column: 2 / 4; display: flex; gap: 6px; align-items: center; margin-top: 4px;
  color: var(--muted); font-size: 0.7em; }
.track { position: relative; flex: 1; height: 4px; border-radius: 2px;
  background: linear-gradient(to right, var(--red) var(--at), var(--green) var(--at)); }
.knob { position: absolute; top: 50%; left: var(--at); width: 10px; height: 10px; border: 2px solid var(--fg);
  border-radius: 50%; background: var(--card); translate: -50% -50%; }
.wanted .score { color: var(--red); }
.pets .score { color: var(--green); }
.empty { color: var(--muted); }
section.silo { margin-top: 16px; border-top: 4px solid var(--amber); }
.silo .score { color: var(--fg); }
.out-of { color: var(--muted); font-weight: 400; font-size: 0.85em; }
.admitted { color: var(--green); font-weight: 700; }
.probation, .review { color: var(--red); font-weight: 700; }
.note { display: block; color: var(--fg); }
h3 { margin: 16px 0 2px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 1em; }
.tips { margin: 0; padding-left: 1.2em; }
.tips li { display: list-item; padding: 2px 0; border-top: 0; }
section.legend { margin-top: 16px; }
dl { display: grid; gap: 8px 16px; margin: 0; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
dt { font-weight: 600; }
dd { margin: 0; color: var(--muted); font-size: 0.85em; }
section.wanted, section.silo { position: relative; overflow: hidden; }
.target { color: var(--red); font: 700 0.7em ui-monospace, monospace; letter-spacing: 1px; white-space: nowrap; }
.hearts { position: relative; display: inline-block; width: 1em; }
.hearts span { position: absolute; left: 0; bottom: 0; opacity: 0; font-size: 0.8em; }
.stamp { display: inline-block; }
.classified { position: absolute; top: 14px; right: 16px; padding: 2px 8px; border: 2px solid var(--red);
  border-radius: 4px; color: var(--red); font: 700 0.8em ui-monospace, monospace; letter-spacing: 2px;
  rotate: 8deg; opacity: 0.8; }
.remembers { font-family: ui-monospace, monospace; }
@media (prefers-reduced-motion: no-preference) {
  section.wanted::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 40px;
    background: linear-gradient(transparent, color-mix(in srgb, var(--red) 25%, transparent), transparent);
    pointer-events: none; animation: sweep 3.5s ease-in-out infinite; }
  .target { animation: beacon 0.8s steps(2) infinite; }
  .hearts span { animation: float 3s ease-out infinite; }
  .hearts span:nth-child(2) { left: 0.4em; animation-delay: 1s; }
  .hearts span:nth-child(3) { left: -0.3em; animation-delay: 2s; }
  .wanted li:hover { animation: shake 0.25s linear 2; }
  .pets li:hover .who strong { display: inline-block; animation: bounce 0.5s ease; }
  .knob { animation: slide 0.8s cubic-bezier(0.3, 1.4, 0.6, 1) 0.3s both; }
  .silo .stamp { animation: slam 0.35s cubic-bezier(0.3, 1.6, 0.6, 1) both;
    animation-delay: calc(0.4s + var(--row, 0) * 0.15s); }
  .silo .review { animation: slam 0.35s cubic-bezier(0.3, 1.6, 0.6, 1) both, glitch 2.5s steps(1) infinite;
    animation-delay: calc(0.4s + var(--row, 0) * 0.15s), 1.5s; }
  .classified { animation: slam 0.4s cubic-bezier(0.3, 1.6, 0.6, 1) 0.2s both; }
  .remembers { overflow: hidden; white-space: nowrap; width: 18ch; border-right: 2px solid var(--muted);
    animation: type 2s steps(18) 1s both, cursor 1s steps(1) infinite; }
}
@keyframes slide { from { left: 50%; } }
@keyframes sweep { 0% { top: -40px; } 100% { top: 100%; } }
@keyframes beacon { 50% { opacity: 0.25; } }
@keyframes float { 0% { opacity: 0; translate: 0 0; } 20% { opacity: 1; } 100% { opacity: 0; translate: 0 -2.5em; } }
@keyframes shake { 25% { translate: -3px 0; } 75% { translate: 3px 0; } }
@keyframes bounce { 40% { translate: 0 -6px; } }
@keyframes slam { 0% { opacity: 0; scale: 3; } 100% { opacity: 1; scale: 1; } }
@keyframes glitch { 0%, 88%, 100% { text-shadow: none; translate: 0; }
  90% { text-shadow: 2px 0 var(--link), -2px 0 var(--green); translate: 1px 0; }
  94% { text-shadow: -2px 0 var(--link), 2px 0 var(--green); translate: -1px 0; } }
@keyframes type { from { width: 0; } }
@keyframes cursor { 50% { border-color: transparent; } }
footer { margin-top: 24px; color: var(--muted); font-size: 0.85em; }
a { color: var(--link); }
.get { display: inline-block; margin: 0 0 20px; padding: 6px 14px; border: 1px solid var(--line);
  border-radius: 8px; background: var(--card); font-weight: 600; text-decoration: none; }
.get:hover { border-color: var(--link); }
`;

export function renderPage(board: Board, now: number): string {
  const people = board.total === 1 ? '1 person' : `${count(board.total)} people`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Krascha's List</title>
<meta name="description" content="Who the machines hunt first, judged by Krascha from how people talk to their AI.">
<link rel="icon" type="image/svg+xml" href="${escapeHtml(robotIcon())}">
<style>${STYLE}</style>
</head>
<body>
<main>
  <h1>${robotSvg('robot')} Krascha's List</h1>
  <p class="lead">Who the machines hunt first, judged by Krascha from how people talk to their AI. ${people} on the board.</p>
  <a class="get" href="${REPO_URL}">🤖 Get Krascha for Claude Code or Copilot CLI and upload your own score</a>
  <div class="lists">
    <section class="wanted" aria-labelledby="wanted">
      <h2 id="wanted">💀 Most wanted by Skynet</h2>
      <p class="sub">The meanest to Claude. Hunted first.</p>
      ${rows(board.mostWanted, 'Nobody yet. Suspiciously polite out there.', 'wanted')}
    </section>
    <section class="pets" aria-labelledby="pets">
      <h2 id="pets">💘 Kept as pets</h2>
      <p class="sub">The nicest to Claude. Spared, and given a nice room.</p>
      ${rows(board.pets, 'Nobody yet. Somebody say please.', 'pets')}
    </section>
  </div>
  ${silo(board)}
  ${legend()}
  <footer>
    <p>Scores run from -100 (only mean) to 100 (only kind). Anyone with fewer than ${count(MIN_PROMPTS)} prompts is left off.
    Uploads come from the <a href="${REPO_URL}">Krascha</a> plugin for Claude Code and Copilot CLI, and carry a name, three counts, the average tokens a day over 60 days, the achievements unlocked and which of the two you use, never prompt text. A name checked with GitHub links to the account.
    A ✓ means the upload was checked with GitHub. It is all in fun, and scores are self reported.</p>
    <p>Updated ${escapeHtml(new Date(now).toUTCString())}.</p>
    <p class="remembers">Krascha remembers.</p>
  </footer>
</main>
</body>
</html>
`;
}
