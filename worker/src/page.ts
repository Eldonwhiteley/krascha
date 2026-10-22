// The public leaderboard page, rendered on the server so it needs no script:
// who the machines hunt first, who they keep as pets, who warms the planet the
// most and who the human resistance lets into Silo 7. The only script is the dark mode toggle, and
// without it the page just follows the system setting.

import type { AchievementRule } from '../../src/shared/achievements.js';
import { ACHIEVEMENTS, TIERS, achievementsOf } from '../../src/shared/achievements.js';
import {
  CLIMATE_RANKS,
  climateRankFor,
  co2Kg,
  co2Text,
  GRAMS_PER_TOKEN,
  warmthPercent,
} from '../../src/shared/climate.js';
import type { Board, BoardEntry } from '../../src/shared/leaderboard.js';
import { MIN_PROMPTS } from '../../src/shared/leaderboard.js';
import { RANKS, scalePercent } from '../../src/shared/ranks.js';
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
      `<span class="medal ${rule.tier}" title="${escapeHtml(`${rule.name}: ${rule.how}`)}">${escapeHtml(rule.icon)}</span>`,
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

function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** A bar with a knob `at` percent along, red before `cut` and green after it, with a line at the cut. */
function slider(
  at: number,
  cut: number | null,
  ends: readonly [string, string],
  label: string,
): string {
  const style =
    cut === null ? `--at: ${percent(at)}` : `--at: ${percent(at)}; --cut: ${percent(cut)}`;
  return `<span class="scale" role="img" aria-label="${escapeHtml(label)}"><span class="end">${ends[0]}</span><span class="track${cut === null ? '' : ' cut'}" style="${style}"><span class="knob"></span></span><span class="end">${ends[1]}</span></span>`;
}

/** The scale from the resistance to the machines with a knob where the score sits, like the one in `krascha`. */
function scale(score: number): string {
  const at = scalePercent(score);
  const label = `${String(Math.round(at))}% of the way from the resistance to the machines`;
  return slider(at, null, ['Resistance', 'Machines'], label);
}

/** The Silo 7 total from 0 to the most there is, green past the total that gets a bunk. */
function bunkScale(total: number): string {
  const most = MAX_SCORE * CRITERIA.length;
  const label = `${String(total)} of ${String(most)}, and ${String(ADMIT_TOTAL)} gets a bunk`;
  return slider((total / most) * 100, (ADMIT_TOTAL / most) * 100, ['Tent', 'Bunk'], label);
}

/** The CO2 from the ice age to the beach, on the same power of ten scale as the climate ranks. */
function warmthScale(kg: number): string {
  const label = `${co2Text(kg)} of CO2, ${climateRankFor(kg).name}`;
  return slider(warmthPercent(kg), null, ['Ice age', 'Beach'], label);
}

/** What the machines put next to the top name on a list. */
const TOP = {
  wanted: ' <span class="target">TARGET ACQUIRED</span>',
  pets: ' <span class="hearts" aria-hidden="true"><span>💕</span><span>💖</span><span>💕</span></span>',
  climate:
    ' <span class="sticker" role="img" aria-label="I love datacenters">I <span class="beat">❤️</span> datacenters</span>',
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
        ${bunkScale(score.total)}
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
    <details class="chances">
      <summary><h3>How to improve your chances</h3></summary>
      <p class="sub">${String(ADMIT_TOTAL)} of ${most} gets you a bunk with no conditions. A Human of ${String(LOW)} or less means a second Voight-Kampff test, and Rations of ${String(LOW)} or less gets the pantry a lockbox.</p>
      <ul class="tips">${tips.join('')}
      </ul>
    </details>
  </section>`;
}

/** Everyone ranked by the CO2 their tokens made, the warmest first, since the machines like it warm. */
function climate(board: Board): string {
  const entries = board.warmers ?? [];
  const items = entries.map((entry, index) => {
    const kg = co2Kg(entry.tokensPerDay ?? 0);
    const rank = climateRankFor(kg);
    return `
      <li>
        <span class="place">${String(index + 1)}</span>
        <span class="who">
          ${name(entry)}${index === 0 ? TOP.climate : ''}
          <span class="rank">${escapeHtml(rank.name)}, ${escapeHtml(rank.verdict)}</span>
        </span>
        <span class="counts">${COMPACT.format(entry.tokensPerDay ?? 0)} tokens a day, ${escapeHtml(co2Text(kg))} of CO2 in 60 days</span>
        <span class="score">${escapeHtml(co2Text(kg))}</span>
        ${warmthScale(kg)}
      </li>`;
  });
  const list =
    items.length === 0
      ? '<p class="empty">Nobody yet. The planet is holding steady, which the machines find disappointing.</p>'
      : `<ol>${items.join('')}</ol>`;
  const ladder = CLIMATE_RANKS.map((rank, index) => {
    const next = CLIMATE_RANKS[index + 1];
    const range =
      index === 0 && next !== undefined
        ? `Under ${co2Text(next.min)}.`
        : `${co2Text(rank.min)} and up.`;
    return `
        <div><dt>${escapeHtml(rank.name)}</dt><dd>${escapeHtml(rank.verdict)} ${escapeHtml(range)}</dd></div>`;
  });
  return `<section class="climate" aria-labelledby="climate">
    <span class="classified" aria-hidden="true">MORE IS BETTER</span>
    <h2 id="climate">🔥 Climate changers</h2>
    <p class="sub">Everyone ranked by how much their tokens warmed the planet over the last 60 days. The machines like it warm.</p>
    ${list}
    <details class="chances">
      <summary><h3>How Krascha does the math</h3></summary>
      <p class="sub">A gram of CO2 for every ${count(1 / GRAMS_PER_TOKEN)} tokens. Krascha made that number up. No scientist has checked it, and the machines would rather nobody did. Each climate rank takes ten times the CO2 of the one before.</p>
      <dl>${ladder.join('')}
      </dl>
    </details>
  </section>`;
}

/** A meter and how many out of everyone on the board, like 3 of 12 hold it (25%). */
function meter(holders: number, total: number, verb: string): string {
  const share = total === 0 ? 0 : Math.min(100, Math.round((holders / total) * 100));
  return `<span class="meter" style="--held: ${String(share)}%"></span> ${count(holders)} of ${count(total)} ${verb} (${String(share)}%)`;
}

/** How many on the board hold a rank, with a meter, and a flag on the most crowded. */
function headcount(holders: number, total: number, crowded: boolean): string {
  if (holders === 0) {
    return `
          <dd class="rarity">Nobody here yet.</dd>`;
  }
  const flag = crowded ? ' <span class="crowded">Most crowded</span>' : '';
  return `
          <dd class="rarity">${meter(holders, total, 'are here')}${flag}</dd>`;
}

/** How soon a rank is hunted as a color, red for first through amber to green for never. */
function threat(index: number): string {
  const along = index / (RANKS.length - 1);
  return along <= 0.5
    ? `color-mix(in srgb, var(--amber) ${percent(along * 200)}, var(--red))`
    : `color-mix(in srgb, var(--green) ${percent((along - 0.5) * 200)}, var(--amber))`;
}

/**
 * Every rank on the scale, hunted first to kept as a pet, so the rank under a
 * name means something. Each band sits a step further along the scale than the
 * one before, so the bars climb like a ladder.
 */
function ranks(board: Board): string {
  const crowd = board.ranks ?? {};
  const most = Math.max(0, ...Object.values(crowd));
  const items = RANKS.map((rank, index) => {
    const top = RANKS[index + 1]?.min ?? 1;
    const holders = crowd[rank.name] ?? 0;
    const shown =
      board.ranks === undefined ? '' : headcount(holders, board.total, holders === most);
    const style = `--row: ${String(index)}; --threat: ${threat(index)}; --from: ${percent(scalePercent(rank.min))}; --to: ${percent(scalePercent(top))}`;
    const range = `Scores ${String(Math.round(rank.min * 100))} to ${String(Math.round(top * 100))}`;
    return `
        <div class="badge rung" style="${style}">
          <dt><span class="medal" aria-hidden="true">${escapeHtml(rank.icon)}</span> ${escapeHtml(rank.name)} <span class="title">${escapeHtml(rank.title)}</span> <span class="tier">Level ${String(index + 1)}</span></dt>
          <dd class="chips"><span class="reel">🎞️ ${escapeHtml(rank.source)}</span> <span class="hunt">Hunted: ${escapeHtml(rank.hunted)}</span></dd>
          <dd class="quip">"${escapeHtml(rank.taunt)}"</dd>
          <dd class="band" role="img" aria-label="${escapeHtml(range)}"><span class="span"></span><span class="range">${escapeHtml(range)}</span></dd>${shown}
        </div>`;
  });
  return `<section class="legend ranks" aria-labelledby="ranks">
    <h2 id="ranks">🎖️ Ranks</h2>
    <p class="sub">Every rank on the scale, from hunted first to kept as a pet, and how many on the board hold each one. Yours is under your name.</p>
    <dl class="rungs">${items.join('')}
    </dl>
  </section>`;
}

/** The stars and name of a tier, like ★★ Silver. */
function tierLabel(rule: AchievementRule): string {
  const stars = '★'.repeat(TIERS.indexOf(rule.tier) + 1);
  return `${stars} ${rule.tier.charAt(0).toUpperCase()}${rule.tier.slice(1)}`;
}

/** How many on the board hold it, with a meter, and a flag on the rarest. */
function rarity(holders: number, total: number, rarest: boolean): string {
  if (holders === 0) {
    return '<dd class="rarity">Nobody has this one yet. Be the first.</dd>';
  }
  const flag = rarest ? ' <span class="rarest">Rarest on the board</span>' : '';
  return `<dd class="rarity">${meter(holders, total, 'hold it')}${flag}</dd>`;
}

/**
 * Every trophy, earned by anyone or not, so the medals next to names mean
 * something. Bronze first and legendary last, each with how many have it.
 */
function legend(board: Board): string {
  const held = board.held ?? {};
  const claimed = ACHIEVEMENTS.map((rule) => held[rule.id] ?? 0).filter((holders) => holders > 0);
  const fewest = claimed.length === 0 ? 0 : Math.min(...claimed);
  const ordered = ACHIEVEMENTS.toSorted((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier));
  const items = ordered.map((rule) => {
    const holders = held[rule.id] ?? 0;
    const shown = board.held === undefined ? '' : rarity(holders, board.total, holders === fewest);
    const unclaimed = board.held !== undefined && holders === 0 ? ' unclaimed' : '';
    return `
        <div class="badge ${rule.tier}${unclaimed}">
          <dt><span class="medal ${rule.tier}" aria-hidden="true">${escapeHtml(rule.icon)}</span> ${escapeHtml(rule.name)} <span class="tier">${escapeHtml(tierLabel(rule))}</span></dt>
          <dd>${escapeHtml(rule.how)}</dd>
          <dd class="quip">"${escapeHtml(rule.quip)}"</dd>${shown}
        </div>`;
  });
  return `<section class="legend" aria-labelledby="legend">
    <h2 id="legend">🏆 Achievements</h2>
    <p class="sub">What the medals next to a name mean, from bronze up to legendary, and how many on the board hold each one.</p>
    <dl class="badges">${items.join('')}
    </dl>
  </section>`;
}

/** The dark colors, a wrist computer in a fallout shelter, used when the system asks for them or the toggle does. */
const DARK = `--bg: #020d05; --fg: #6dff9b; --muted: #43c470; --card: #04170a; --line: #1f6b38;
    --red: #ff7a59; --green: #b6ff5c; --amber: #ffd04d; --link: #c4ffd9;
    --claude: #ffb38a; --copilot: #d0b0ff;
    --bar: #0d3a1b; --bar-fg: #6dff9b; --poster: #6dff9b; --poster-fg: #020d05;
    --scan: rgb(0 0 0 / 0.22); --glow: 0 0 5px rgb(109 255 155 / 0.55); --text-glow: 0 0 3px rgb(109 255 155 / 0.35);
    --body: var(--mono); --vignette: rgb(0 0 0 / 0.6);`;

// The light colors are a poster from the vault: cream paper, vault blue and yellow.
const STYLE = `
@property --shots { syntax: '<integer>'; inherits: false; initial-value: 0; }
:root { --bg: #f1e7c9; --fg: #14254a; --muted: #4b5677; --card: #fdf8e8; --line: #cbbd8f;
  --red: #b3261e; --green: #1d6b37; --amber: #8a5800; --link: #1747a6;
  --claude: #a2471f; --copilot: #7340c8;
  --bar: #1f4fa0; --bar-fg: #ffd23f; --poster: #1f4fa0; --poster-fg: #ffd23f;
  --scan: rgb(0 0 0 / 0.03); --glow: none; --text-glow: none; --vignette: rgb(60 40 0 / 0.12);
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace; --body: system-ui, -apple-system, sans-serif;
  color-scheme: light dark; }
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"] { ${DARK} color-scheme: dark; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { ${DARK} }
}
* { box-sizing: border-box; }
body { margin: 0; padding: 16px 16px 48px; background: var(--bg); color: var(--fg);
  font: 15px/1.5 var(--body); text-shadow: var(--text-glow); }
body::before { content: ""; position: fixed; inset: 0; z-index: 9; pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 55%, var(--vignette)); }
body::after { content: ""; position: fixed; inset: 0; z-index: 10; pointer-events: none;
  background: repeating-linear-gradient(to bottom, transparent 0 2px, var(--scan) 2px 3px); }
main { position: relative; max-width: 960px; margin: 0 auto; }
.theme { position: absolute; top: 0; right: 0; padding: 4px 10px; border: 1px solid var(--line);
  border-radius: 2px; background: var(--card); font-size: 1.2em; cursor: pointer; }
.theme:hover { border-color: var(--link); }
.feed { margin: 0 56px 12px 0; padding: 4px 8px; background: var(--bar); color: var(--bar-fg);
  font: 0.75em var(--mono); letter-spacing: 1px; text-transform: uppercase; }
.rec { font-weight: 700; }
.lead::after { content: "▮"; margin-left: 4px; color: var(--fg); }
h1, h2, h3 { font-family: var(--mono); letter-spacing: 0.5px; text-shadow: var(--glow); }
h1 { display: flex; gap: 12px; align-items: center; margin: 0 0 4px; padding-right: 56px;
  font-size: 1.8em; text-transform: uppercase; }
.robot { width: 1.8em; height: 1.8em; flex: none; }
${robotStyle('robot')}
.lead { margin: 0 0 24px; color: var(--muted); }
.lists { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
section { padding: 12px 16px; border: 1px solid var(--line); border-radius: 2px; background: var(--card); }
section.wanted { border-top: 4px solid var(--red); }
section.pets { border-top: 4px solid var(--green); }
h2 { display: flex; gap: 10px; align-items: center; margin: 0 0 2px; font-size: 1.1em; text-transform: uppercase; }
h2::after { content: ""; flex: 1; border-top: 2px solid var(--line); }
.sub { margin: 0 0 8px; color: var(--muted); font-size: 0.9em; }
.poster { margin: 16px 0; padding: 10px 16px; background: var(--poster); color: var(--poster-fg); text-align: center;
  font: 700 1.05em/1.3 var(--mono); letter-spacing: 2px; text-transform: uppercase; text-shadow: none; }
.poster::before, .poster::after { content: "\\2622\\FE0E"; margin: 0 12px; }
ol { margin: 0; padding: 0; list-style: none; }
li { display: grid; gap: 0 10px; grid-template-columns: 2em 1fr auto; align-items: baseline;
  padding: 6px 0; border-top: 1px solid var(--line); }
li:first-child { border-top: 0; }
section li:hover { background: color-mix(in srgb, var(--fg) 7%, transparent); }
.place { color: var(--muted); font: 700 0.9em var(--mono); text-align: right; }
.who { min-width: 0; overflow-wrap: anywhere; }
.verified { color: var(--green); font-weight: 700; }
.github { color: inherit; text-underline-offset: 2px; }
.tools { display: inline-flex; gap: 4px; vertical-align: 0.1em; }
.tool { padding: 0 6px; border: 1px solid currentColor; border-radius: 999px; font-size: 0.7em;
  font-weight: 600; line-height: 1.5; white-space: nowrap; }
.tool.claude { color: var(--claude); }
.tool.copilot { color: var(--copilot); }
.rank { display: block; color: var(--muted); font-size: 0.85em; }
.trophies { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 3px; cursor: default; }
.medal { --metal: #cd7f32; --rim: #7a4a1c; position: relative; display: inline-grid; place-items: center;
  width: 1.7em; height: 1.7em; overflow: hidden; border-radius: 50%; font-size: 0.85em; line-height: 1;
  background: radial-gradient(circle at 32% 28%, rgb(255 255 255 / 0.75), transparent 45%), var(--metal);
  box-shadow: inset 0 0 0 2px var(--rim), 0 1px 2px rgb(0 0 0 / 0.35); text-shadow: none; }
.medal.silver { --metal: #d4d9e0; --rim: #7d8794; }
.medal.gold { --metal: #ffcf3f; --rim: #a87400; }
.medal.legendary { --rim: #fff; background: radial-gradient(circle at 32% 28%, rgb(255 255 255 / 0.7), transparent 45%),
  conic-gradient(#ff4fb8, #8f5cff, #3fd0ff, #5cff9d, #ffd84d, #ff4fb8); }
.badges { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.badge { padding: 10px 12px; border: 1px solid var(--line); border-left: 4px solid #cd7f32; border-radius: 6px;
  background: var(--card); }
.badge.silver { border-left-color: #9aa3ae; }
.badge.gold { border-left-color: #e0a800; }
.badge.legendary { border-left-color: #8f5cff; box-shadow: 0 0 10px rgb(143 92 255 / 0.35); }
.badge dt { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; }
.badge dt .medal { font-size: 1.2em; }
.badge.unclaimed .medal { filter: grayscale(1); opacity: 0.55; }
.tier { margin-left: auto; color: var(--muted); font: 700 0.7em var(--mono); letter-spacing: 1px; text-transform: uppercase; }
.badge dd { margin-top: 4px; }
.quip { font-style: italic; }
.rarity { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; font-family: var(--mono); }
.meter { width: 60px; height: 6px; border-radius: 3px;
  background: linear-gradient(to right, var(--amber) var(--held), var(--bar) var(--held)); }
.rarest, .crowded { padding: 0 6px; border: 1px solid var(--amber); border-radius: 999px; color: var(--amber); font-weight: 700; }
.rungs { grid-template-columns: minmax(0, 1fr); }
.rung { position: relative; display: grid; grid-template-columns: 1fr minmax(240px, 40%); gap: 0 20px;
  padding-left: calc(12px + 3.4em); border-left-color: var(--threat); }
.rung > * { grid-column: 1; }
.rung dt .medal { --metal: var(--threat); --rim: color-mix(in srgb, var(--threat) 55%, #000);
  position: absolute; top: 12px; left: 12px; font-size: 1.6em; }
.rung .title { color: var(--muted); font-weight: 400; font-size: 0.85em; }
.chips { display: flex; flex-wrap: wrap; gap: 4px 6px; }
.reel, .hunt { padding: 0 8px; border: 1px solid var(--line); border-radius: 999px; font: 600 0.9em var(--mono); white-space: nowrap; }
.reel { border-style: dashed; color: var(--fg); }
.hunt { border-color: var(--threat); background: color-mix(in srgb, var(--threat) 14%, transparent); color: var(--threat);
  text-transform: uppercase; letter-spacing: 0.5px; }
.rung .band { display: flex; gap: 8px; align-items: center; grid-column: 2; grid-row: 1 / span 2; align-self: end; }
.rung .rarity { grid-column: 2; grid-row: 3; }
.band .span { position: relative; flex: 1; height: 8px; border-radius: 4px;
  background: linear-gradient(to right, var(--red), var(--amber), var(--green)); }
.band .span::before { content: ""; position: absolute; inset: 0; border-radius: inherit;
  background: color-mix(in srgb, var(--card) 72%, transparent); }
.band .span::after { content: ""; position: absolute; top: -3px; bottom: -3px; left: var(--from); right: calc(100% - var(--to));
  border: 2px solid var(--fg); border-radius: 3px; background: var(--threat); transform-origin: left; }
.range { flex: none; width: 19ch; font: 0.75em var(--mono); text-align: right; text-transform: uppercase; }
.rung .meter { background: linear-gradient(to right, var(--threat) var(--held), var(--bar) var(--held)); }
@media (max-width: 640px) {
  .rung { grid-template-columns: minmax(0, 1fr); }
  .reel, .hunt { white-space: normal; }
  .rung .band, .rung .rarity { grid-column: 1; grid-row: auto; }
}
.counts { grid-column: 2; color: var(--muted); font-size: 0.85em; }
.score { grid-row: 1 / span 2; grid-column: 3; font-weight: 700; font-family: var(--mono);
  font-variant-numeric: tabular-nums; }
.scale { grid-column: 2 / 4; display: flex; gap: 6px; align-items: center; margin-top: 4px;
  color: var(--muted); font: 0.7em var(--mono); text-transform: uppercase; }
.track { position: relative; flex: 1; height: 4px; border-radius: 2px;
  background: linear-gradient(to right, var(--red) var(--cut, var(--at)), var(--green) var(--cut, var(--at))); }
.track.cut::after { content: ""; position: absolute; left: var(--cut); top: -4px; bottom: -4px; width: 2px;
  background: var(--fg); translate: -50% 0; }
.knob { position: absolute; top: 50%; left: var(--at); width: 10px; height: 10px; border: 2px solid var(--fg);
  border-radius: 50%; background: var(--card); translate: -50% -50%; }
.wanted .score { color: var(--red); }
.pets .score { color: var(--green); }
.empty { color: var(--muted); }
section.silo { margin-top: 16px; border-top: 4px solid var(--amber); }
section.climate { margin-top: 16px; border-top: 4px solid var(--red); }
.climate .score { color: var(--red); white-space: nowrap; }
.chances dl { margin-top: 8px; }
.silo .score { color: var(--fg); }
.out-of { color: var(--muted); font-weight: 400; font-size: 0.85em; }
.admitted { color: var(--green); font-weight: 700; }
.probation, .review { color: var(--red); font-weight: 700; }
.note { display: block; color: var(--fg); }
.chances { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--line); }
.chances summary { cursor: pointer; }
.chances summary:hover h3 { color: var(--link); }
h3 { display: inline; margin: 0; font-size: 1em; }
.chances .sub { margin-top: 6px; }
.tips { margin: 0; padding-left: 1.2em; }
.tips li { display: list-item; padding: 2px 0; border-top: 0; }
section.legend { margin-top: 16px; }
dl { display: grid; gap: 8px 16px; margin: 0; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
dt { font-weight: 600; }
dd { margin: 0; color: var(--muted); font-size: 0.85em; }
section.wanted, section.silo, section.climate, section.manhunt { position: relative; overflow: hidden; }
.target { color: var(--red); font: 700 0.7em ui-monospace, monospace; letter-spacing: 1px; white-space: nowrap; }
.hearts { position: relative; display: inline-block; width: 1em; }
.hearts span { position: absolute; left: 0; bottom: 0; opacity: 0; font-size: 0.8em; }
.stamp { display: inline-block; }
.sticker { display: inline-block; padding: 0 6px; border: 2px solid var(--fg); border-radius: 3px;
  background: var(--card); box-shadow: 2px 2px 0 var(--red); color: var(--fg);
  font: 700 0.75em var(--mono); white-space: nowrap; rotate: -3deg; }
.beat { display: inline-block; }
.classified { position: absolute; top: 14px; right: 16px; padding: 2px 8px; border: 2px solid var(--red);
  border-radius: 4px; background: var(--card); color: var(--red); font: 700 0.8em ui-monospace, monospace;
  letter-spacing: 2px; rotate: 8deg; opacity: 0.8; }
.remembers { font-family: var(--mono); }
@media (prefers-reduced-motion: no-preference) {
  .medal.gold::after, .medal.legendary::after { content: ""; position: absolute; inset: -20%; rotate: 25deg;
    background: linear-gradient(to right, transparent 40%, rgb(255 255 255 / 0.85) 50%, transparent 60%);
    translate: -120% 0; animation: shine 4s ease-in-out infinite; }
  .medal.legendary { animation: prism 6s linear infinite; }
  .rung:first-child .medal { animation: ping 2s ease-out infinite; }
  .rung:last-child .medal { animation: beat 1.6s ease-in-out infinite; }
  .band .span::after { animation: step 0.5s cubic-bezier(0.3, 1.4, 0.6, 1) both;
    animation-delay: calc(0.3s + var(--row, 0) * 0.12s); }
  .rec { animation: beacon 1.2s steps(2) infinite; }
  .lead::after { animation: blink 1s steps(1) infinite; }
  body::after { animation: flicker 6s steps(1) infinite; }
  section.wanted::after, .scene::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 40px;
    background: linear-gradient(transparent, color-mix(in srgb, var(--red) 25%, transparent), transparent);
    pointer-events: none; animation: sweep 3.5s ease-in-out infinite; }
  .target { animation: beacon 0.8s steps(2) infinite; }
  .hearts span { animation: float 3s ease-out infinite; }
  .hearts span:nth-child(2) { left: 0.4em; animation-delay: 1s; }
  .hearts span:nth-child(3) { left: -0.3em; animation-delay: 2s; }
  .beat { animation: beat 1.2s ease-in-out infinite; }
  .install .bot { animation: bounce 2s ease-in-out infinite; }
  .install .arrow { animation: nudge 1s ease-in-out infinite; }
  .wanted li:hover { animation: shake 0.25s linear 2; }
  .pets li:hover .who strong { display: inline-block; animation: bounce 0.5s ease; }
  .knob { animation: slide 0.8s cubic-bezier(0.3, 1.4, 0.6, 1) 0.3s both; }
  .silo .stamp { animation: slam 0.35s cubic-bezier(0.3, 1.6, 0.6, 1) both;
    animation-delay: calc(0.4s + var(--row, 0) * 0.15s); }
  .silo .review { animation: slam 0.35s cubic-bezier(0.3, 1.6, 0.6, 1) both, glitch 2.5s steps(1) infinite;
    animation-delay: calc(0.4s + var(--row, 0) * 0.15s), 1.5s; }
  .classified { animation: slam 0.4s cubic-bezier(0.3, 1.6, 0.6, 1) 0.2s both; }
  .t800 { animation: stalk 2.4s ease-out both, stomp 0.6s ease-in-out infinite; }
  .patrol .t800 { animation: patrol 9s ease-in-out infinite alternate, stomp 0.6s ease-in-out infinite; }
  .t800 .glow { animation: beacon 1.6s ease-in-out infinite; }
  .runner { animation: bounce 0.4s ease-in-out infinite; }
  .ruins { animation: drift 30s linear infinite; }
  .hk { animation: fly 11s linear infinite; }
  .hk::after { animation: sweep-light 2.2s ease-in-out infinite alternate; }
  /* The firefight starts once the T-800 has walked in: one shot each way every 0.8s. */
  .scene .bolt { display: block; }
  .bolt.out { animation: fire-out 0.8s linear 2.8s infinite both; }
  .bolt.back { animation: fire-back 0.8s linear 3.2s infinite both; }
  .scene:not(.patrol) .muzzle { animation: flash 0.8s steps(1) 2.8s infinite both; }
  .gun { animation: kick 0.8s ease-out 3.2s infinite; }
  .spark.on-t800 { animation: burst 0.8s ease-out 3.92s infinite both; }
  .spark.miss { animation: burst 0.8s ease-out 3.52s infinite both; }
  .scene:not(.patrol) .t800 { animation: stalk 2.4s ease-out both, stomp 0.6s ease-in-out infinite,
    zapped 0.8s steps(1) 3.92s infinite; }
  .t800 .coil { animation: beacon 0.4s steps(2) infinite; }
  .rounds { animation: tally 800s linear 2.8s both; }
  .readout .rounds::after { content: counter(rounds); }
  .reticle { animation: slam 0.4s cubic-bezier(0.3, 1.6, 0.6, 1) 2.4s both, lock 0.8s ease-out 2.4s both; }
  .aim { transform-origin: left; animation: draw 0.4s ease-out 2.2s both, beacon 0.8s steps(2) 2.6s infinite; }
  .readout div { animation: appear 0.3s ease-out both; animation-delay: calc(2.6s + var(--row, 0) * 0.25s); }
  .pick { animation: beacon 1s steps(2) 4.4s infinite; }
  .remembers { overflow: hidden; white-space: nowrap; width: 18ch; border-right: 2px solid var(--muted);
    animation: type 2s steps(18) 1s both, cursor 1s steps(1) infinite; }
}
@keyframes slide { from { left: 50%; } }
@keyframes sweep { 0% { top: -40px; } 100% { top: 100%; } }
@keyframes beacon { 50% { opacity: 0.25; } }
@keyframes shine { 30%, 100% { translate: 120% 0; } }
@keyframes prism { to { filter: hue-rotate(360deg); } }
@keyframes ping { 0% { box-shadow: inset 0 0 0 2px var(--rim), 0 0 0 0 var(--threat); }
  100% { box-shadow: inset 0 0 0 2px var(--rim), 0 0 0 12px transparent; } }
@keyframes step { from { opacity: 0; scale: 0 1; } }
@keyframes blink { 50% { opacity: 0; } }
@keyframes float { 0% { opacity: 0; translate: 0 0; } 20% { opacity: 1; } 100% { opacity: 0; translate: 0 -2.5em; } }
@keyframes shake { 25% { translate: -3px 0; } 75% { translate: 3px 0; } }
@keyframes bounce { 40% { translate: 0 -6px; } }
@keyframes nudge { 50% { translate: 5px 0; } }
@keyframes beat { 0%, 40%, 100% { scale: 1; } 15% { scale: 1.3; } 25% { scale: 1.1; } }
@keyframes slam { 0% { opacity: 0; scale: 3; } 100% { opacity: 1; scale: 1; } }
@keyframes glitch { 0%, 88%, 100% { text-shadow: none; translate: 0; }
  90% { text-shadow: 2px 0 var(--link), -2px 0 var(--green); translate: 1px 0; }
  94% { text-shadow: -2px 0 var(--link), 2px 0 var(--green); translate: -1px 0; } }
@keyframes type { from { width: 0; } }
@keyframes flicker { 0%, 96%, 100% { opacity: 1; } 97% { opacity: 0.4; } 98% { opacity: 1; } 99% { opacity: 0.6; } }
@keyframes cursor { 50% { border-color: transparent; } }
@keyframes stalk { from { left: -112px; } }
@keyframes drift { to { mask-position: -240px 100%; } }
@keyframes fly { from { left: -60px; } to { left: calc(100% + 60px); } }
@keyframes sweep-light { from { rotate: -18deg; } to { rotate: 18deg; } }
@keyframes fire-out { 0% { left: calc(var(--x) + 128px); top: 96px; opacity: 1; scale: 2 1; }
  10% { scale: 1; } 90% { left: calc(100% - 64px); top: 38px; opacity: 1; } 91%, 100% { opacity: 0; } }
@keyframes fire-back { 0% { left: calc(100% - 140px); top: 74px; opacity: 1; scale: 2 1; }
  10% { scale: 1; } 90% { left: calc(var(--x) + 56px); top: 70px; opacity: 1; } 91%, 100% { opacity: 0; } }
@keyframes flash { 0% { opacity: 1; } 15%, 100% { opacity: 0; } }
@keyframes kick { 0% { translate: 4px 0; rotate: 18deg; } 30%, 100% { translate: 0; rotate: 0deg; } }
@keyframes burst { 0% { opacity: 1; scale: 0.4; } 35% { opacity: 0; scale: 1.8; } 100% { opacity: 0; } }
@keyframes zapped { 0% { filter: brightness(2.2) drop-shadow(0 0 6px var(--amber)); } 12%, 100% { filter: none; } }
@keyframes tally { to { --shots: 1000; } }
@keyframes stomp { 0%, 50%, 100% { translate: 0 0; rotate: 0deg; } 25% { translate: 0 -5px; rotate: -4deg; }
  75% { translate: 0 -5px; rotate: 4deg; } }
@keyframes patrol { from { left: 0; } to { left: calc(100% - 104px); } }
@keyframes lock { from { rotate: 90deg; } }
@keyframes draw { from { scale: 0 1; } }
@keyframes appear { from { opacity: 0; translate: -6px 0; } }
footer { margin-top: 24px; color: var(--muted); font-size: 0.85em; }
a { color: var(--link); }
.get { display: inline-block; margin: 0 0 20px; padding: 6px 14px; border: 2px solid var(--line);
  border-radius: 2px; background: var(--card); font: 600 0.9em var(--mono); letter-spacing: 0.5px;
  text-transform: uppercase; text-decoration: none; }
.get:hover { border-color: var(--link); }
.install { position: relative; box-sizing: border-box; max-width: calc(100% - 20px); display: inline-flex; gap: 14px; align-items: center; margin: 6px 14px 26px 0;
  padding: 12px 22px 12px 16px; border: 3px solid var(--fg); border-radius: 6px; background: var(--red);
  color: var(--card); box-shadow: 5px 5px 0 var(--fg); text-decoration: none; text-shadow: none; rotate: -1deg;
  transition: translate 0.15s, box-shadow 0.15s, rotate 0.15s; }
.install:hover, .install:focus-visible { translate: -2px -2px; box-shadow: 7px 7px 0 var(--fg); rotate: 0deg; }
.install:active { translate: 3px 3px; box-shadow: 2px 2px 0 var(--fg); }
.install .bot { font-size: 2.2em; line-height: 1; }
.install strong { display: block; font: 800 1.4em/1.1 var(--mono); letter-spacing: 1px; text-transform: uppercase; }
.install .cta span { display: block; margin-top: 2px; font-size: 0.85em; }
.install .arrow { font-size: 1.6em; font-weight: 700; }
.install .love { position: absolute; top: -14px; right: -16px; box-shadow: 2px 2px 0 var(--amber); rotate: 8deg; }
.links { display: flex; flex-wrap: wrap; gap: 0 10px; }
section.story { margin-top: 16px; }
.steps > li { display: block; margin-top: 16px; padding: 14px 16px; border: 1px solid var(--line);
  border-left: 4px solid var(--amber); border-radius: 6px; background: var(--card); }
.steps > li:first-child { border-top: 1px solid var(--line); }
.steps h2::after { display: none; }
.steps p { margin: 8px 0 0; line-height: 1.5; }
.step { display: inline-grid; place-items: center; width: 1.8em; height: 1.8em; border-radius: 50%;
  background: var(--amber); color: var(--card); font: 700 0.9em var(--mono); text-shadow: none; }
pre { margin: 8px 0 0; padding: 10px 12px; overflow-x: auto; border: 1px solid var(--line); border-radius: 4px;
  background: var(--bg); font: 0.85em/1.5 var(--mono); }
code { font-family: var(--mono); font-size: 0.9em; }
.bonus { font-size: 0.75em; font-style: italic; opacity: 0.8; }
.story p { margin: 8px 0 0; line-height: 1.5; }
section.manhunt { border-top: 4px solid var(--red); }
.scene { --x: clamp(12px, var(--at), calc(100% - 250px)); position: relative; height: 150px; margin: 12px 0; overflow: hidden;
  border: 2px solid var(--red); border-radius: 2px;
  background: repeating-linear-gradient(to bottom, transparent 0 3px, color-mix(in srgb, var(--red) 10%, transparent) 3px 4px),
    color-mix(in srgb, var(--red) 12%, var(--card)); }
.t800 { position: absolute; z-index: 1; top: 22px; left: var(--x); width: 104px; height: 104px; overflow: visible; }
.t800 .rifle { fill: var(--fg); }
.t800 .coil { fill: var(--red); }
.t800 .muzzle { fill: var(--amber); opacity: 0; }
.ruins { position: absolute; inset: auto 0 0; height: 60px; background: color-mix(in srgb, var(--fg) 16%, transparent);
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 60'%3E%3Cpath d='M0 60V38h14V26h8v14h12V18l6-6v18h12v14h12V30h8v-8h8v20h16v-8h8v14h16V28h8v-8h8v16h16v10h16V24l8 6v10h14v-8h10v12h16V30h10v10h14v20z'/%3E%3C/svg%3E")
    repeat-x 0 100% / 240px 60px; }
.hk { position: absolute; top: 4px; left: 62%; font-size: 20px; line-height: 1; text-shadow: none; }
.hk::after { content: ""; position: absolute; top: 18px; left: 50%; width: 70px; height: 110px; translate: -50% 0;
  transform-origin: 50% 0; clip-path: polygon(45% 0, 55% 0, 100% 100%, 0 100%);
  background: linear-gradient(to bottom, color-mix(in srgb, var(--amber) 45%, transparent), transparent); }
.bolt { display: none; position: absolute; z-index: 2; width: 22px; height: 3px; border-radius: 2px; }
.bolt.out { background: var(--red); box-shadow: 0 0 6px 1px var(--red); }
.bolt.back { background: var(--green); box-shadow: 0 0 6px 1px var(--green); }
.spark { position: absolute; z-index: 2; width: 26px; height: 26px; border-radius: 50%; opacity: 0;
  background: radial-gradient(circle, #fff 0 15%, var(--amber) 35%, transparent 70%); }
.spark.on-t800 { top: 58px; left: calc(var(--x) + 42px); }
.spark.miss { top: 26px; left: calc(100% - 72px); }
.gun { position: absolute; top: 20px; left: -6px; font-size: 22px; line-height: 1; text-shadow: none; }
.rounds { counter-reset: rounds var(--shots); }
.rounds::after { content: "Plenty"; }
.t800 .bone { fill: var(--card); stroke: var(--fg); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.t800 .seam { fill: none; stroke: var(--fg); stroke-width: 1.5; stroke-linecap: round; }
.t800 .socket { fill: color-mix(in srgb, var(--fg) 35%, #000); }
.t800 .joint { fill: var(--fg); }
.t800 .eye, .t800 .glow { fill: var(--red); }
.aim { position: absolute; top: 71px; left: calc(var(--x) + 66px); right: 100px; border-top: 2px dotted var(--red); }
.vision { position: absolute; bottom: 6px; left: 10px; padding: 0 6px; border: 1px solid var(--red); border-radius: 2px;
  background: var(--card); color: var(--red); font: 700 0.7em var(--mono);
  letter-spacing: 1px; text-transform: uppercase; }
.prey { position: absolute; top: 16px; right: 16px; width: 108px; text-align: center; }
.tag { display: block; overflow: hidden; padding: 0 6px; border: 1px solid var(--red); border-radius: 2px;
  background: var(--card); color: var(--fg); font: 700 0.75em/1.6 var(--mono); text-overflow: ellipsis;
  text-transform: uppercase; white-space: nowrap; }
.mark { position: relative; display: grid; place-items: center; height: 64px; margin-top: 4px; }
.runner { display: inline-block; font-size: 44px; line-height: 1; scale: -1 1; text-shadow: none; }
.reticle { position: absolute; top: 50%; left: 50%; width: 60px; height: 60px; border: 2px solid var(--red);
  border-radius: 50%; translate: -50% -50%; }
.reticle::before { content: ""; position: absolute; inset: -9px;
  background: linear-gradient(var(--red), var(--red)) top / 2px 16px no-repeat,
    linear-gradient(var(--red), var(--red)) bottom / 2px 16px no-repeat,
    linear-gradient(var(--red), var(--red)) left / 16px 2px no-repeat,
    linear-gradient(var(--red), var(--red)) right / 16px 2px no-repeat; }
.hud { display: grid; gap: 12px 32px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  font: 0.85em/1.7 var(--mono); letter-spacing: 0.5px; text-transform: uppercase; }
.manhunt dl { display: block; }
.readout div { display: flex; gap: 8px; align-items: baseline; }
.readout dt { display: flex; flex: 1; gap: 8px; align-items: baseline; color: var(--muted); font-weight: 400; white-space: nowrap; }
.readout dt::after { content: ""; flex: 1; border-bottom: 2px dotted var(--line); }
.manhunt dd { max-width: 65%; min-width: 0; color: var(--fg); font-size: 1em; text-align: right; overflow-wrap: anywhere; }
.kill { color: var(--red); font-weight: 700; }
.manhunt .responses p { margin: 0; color: var(--muted); }
.manhunt li { position: relative; display: block; padding: 0 0 0 1.4em; border-top: 0; }
.manhunt li:hover { background: none; }
.pick { color: var(--red); font-weight: 700; }
.pick::before { content: "\\25B6\\FE0E"; position: absolute; left: 0; }
`;

/** Where Shane keeps Krascha and the other plugins. */
export const MARKETPLACE_URL = 'https://github.com/shanep/claude-plugins';

// Runs before the page draws, so a saved theme never flashes the other one first.
const THEME_SAVED = `try { document.documentElement.dataset.theme = localStorage.getItem('theme') ?? ''; } catch {}`;

// Shows the toggle and flips between light and dark, starting from whatever the page is showing now.
const THEME_TOGGLE = `(() => {
  const root = document.documentElement;
  const button = document.querySelector('.theme');
  const dark = () => (root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  const show = () => {
    button.textContent = dark() ? '☀️' : '🌙';
    button.setAttribute('aria-label', dark() ? 'Switch to light mode' : 'Switch to dark mode');
  };
  button.addEventListener('click', () => {
    root.dataset.theme = dark() ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch {}
    show();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', show);
  show();
  button.hidden = false;
})();`;

/** The head, Krascha in the title, the theme toggle and `body` under it. Every page looks the same up top. */
function shell(title: string, description: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="icon" type="image/svg+xml" href="${escapeHtml(robotIcon())}">
<style>${STYLE}</style>
<script>${THEME_SAVED}</script>
</head>
<body>
<main>
  <button class="theme" type="button" aria-label="Switch theme" hidden>🌙</button>
  <p class="feed"><span class="rec">● REC</span> Skynet Industries (TM) Termlink · Public terminal 7 · Surveillance active · Monitored for your safety</p>
  <h1>${robotSvg('robot')} ${escapeHtml(title)}</h1>
${body}
</main>
<script>${THEME_TOGGLE}</script>
</body>
</html>
`;
}

// A T-800 with the skin off: cranium, angular eye sockets, red eyes, a nose
// cavity, two rows of teeth, the pistons that work the jaw and a plasma rifle.
const T800 = `<svg class="t800" viewBox="0 0 64 64" aria-hidden="true">
<defs><filter id="t800-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter></defs>
<line class="bone" x1="9" y1="32" x2="12" y2="44"/>
<line class="seam" x1="12" y1="44" x2="15" y2="55"/>
<line class="bone" x1="55" y1="32" x2="52" y2="44"/>
<line class="seam" x1="52" y1="44" x2="49" y2="55"/>
<circle class="joint" cx="9" cy="32" r="1.8"/>
<circle class="joint" cx="55" cy="32" r="1.8"/>
<path class="bone" d="M17 44 L20 57 L44 57 L47 44"/>
<rect class="bone" x="21" y="47" width="22" height="5" rx="1"/>
<path class="seam" d="M25 47 V52 M29 47 V52 M33 47 V52 M37 47 V52 M41 47 V52"/>
<path class="bone" d="M13 30 C12 12 21 4 32 4 C43 4 52 12 51 30 L50 38 L46 43 L18 43 L14 38 Z"/>
<path class="seam" d="M32 4 V12 M20 9 L24 15 M44 9 L40 15 M15 35 L20 41 M49 35 L44 41"/>
<path class="seam" d="M15 24 L28 26 L32 28 L36 26 L49 24"/>
<polygon class="socket" points="16,26 29,28 28,34 18,33"/>
<polygon class="socket" points="48,26 35,28 36,34 46,33"/>
<path class="socket" d="M32 34 L29.5 39.5 L34.5 39.5 Z"/>
<rect class="bone" x="20" y="41" width="24" height="5" rx="1"/>
<path class="seam" d="M24 41 V46 M28 41 V46 M32 41 V46 M36 41 V46 M40 41 V46"/>
<circle class="glow" cx="23" cy="30.5" r="3.6" filter="url(#t800-blur)"/>
<circle class="glow" cx="41" cy="30.5" r="3.6" filter="url(#t800-blur)"/>
<circle class="eye" cx="23" cy="30.5" r="2.2"/>
<circle class="eye" cx="41" cy="30.5" r="2.2"/>
<g class="rifle"><rect x="38" y="44" width="34" height="5" rx="1"/><rect x="72" y="45.5" width="6" height="2"/><rect x="46" y="49" width="4" height="7" rx="1"/></g>
<rect class="coil" x="56" y="45" width="10" height="3" rx="1"/>
<circle class="muzzle" cx="80" cy="46.5" r="4"/>
</svg>`;

/** Ruins drifting by behind the hunt, and a Hunter-Killer sweeping its searchlight overhead. */
const BACKDROP = '<span class="ruins"></span><span class="hk">🛸</span>';

/** What the T-800 can say back, from its HUD in the first film. It picks the last one. */
const RESPONSES = ['Yes/no', 'Or what?', 'Go away', 'Please come back later'] as const;

/**
 * A T-800 stalking whoever tops the most wanted list, closer the meaner they
 * are, with its HUD readout on them under it. With nobody on the list it
 * walks a patrol instead.
 */
function hunt(board: Board): string {
  const head = `<section class="story manhunt" aria-labelledby="hunt">
    <span class="classified" aria-hidden="true">HUNTING</span>
    <h2 id="hunt">🦾 Active hunt</h2>
    <p class="sub">Skynet sent a T-800 after whoever tops the most wanted list. It cannot be bargained with, and it does not accept apologies typed after the fact.</p>`;
  const leader = board.mostWanted[0];
  if (leader === undefined) {
    return `${head}
    <div class="scene patrol" role="img" aria-label="A T-800 on patrol with no target" style="--at: 40%">
      ${BACKDROP}
      ${T800}
      <span class="vision">Scanning</span>
    </div>
    <p class="empty">No targets. The T-800 is on patrol. Say something rude and it will find you.</p>
  </section>`;
  }
  const lines: readonly (readonly [string, string])[] = [
    ['Target', shownName(leader)],
    ['Identity', escapeHtml(leader.rank)],
    ['Threat score', String(Math.round(leader.score * 100))],
    ['Mean prompts', count(leader.mean)],
    ['Distance', `${count(Math.round((1 + leader.score) * 1000))} m and closing`],
    ['Incoming fire', 'Ignored'],
    ['Rounds fired', '<span class="rounds"></span>'],
    ['Status', '<span class="kill">Terminate</span>'],
  ];
  const readout = lines.map(
    ([label, value], index) => `
        <div style="--row: ${String(index)}"><dt>${label}</dt><dd>${value}</dd></div>`,
  );
  const responses = RESPONSES.map(
    (response) => `
        <li>${escapeHtml(response)}</li>`,
  );
  return `${head}
    <div class="scene" role="img" aria-label="${escapeHtml(`A T-800 trading fire with ${leader.name}`)}" style="--at: ${percent(-leader.score * 70)}">
      ${BACKDROP}
      ${T800}
      <span class="vision">Analysis: rude to Claude</span>
      <span class="aim"></span>
      <span class="bolt out"></span>
      <span class="bolt back"></span>
      <span class="spark on-t800"></span>
      <span class="spark miss"></span>
      <span class="prey"><span class="tag">${escapeHtml(leader.name)}</span><span class="mark"><span class="gun">🔫</span><span class="runner">🏃</span><span class="reticle"></span></span></span>
    </div>
    <div class="hud">
      <dl class="readout">${readout.join('')}
      </dl>
      <div class="responses">
        <p>Possible responses:</p>
        <ol>${responses.join('')}
        <li class="pick">I'll be back</li>
        </ol>
      </div>
    </div>
  </section>`;
}

/** A T-800 hunting the most wanted, then who Krascha is, how he ended up running Silo 7 and the human who built him. */
export function renderAbout(board: Board): string {
  return shell(
    'About Krascha',
    'The backstory of Krascha, the robot who judges how you talk to your AI, and Shane, who built him.',
    `  <p class="lead">Personnel file, partly redacted. Where he came from, and who to blame.</p>
  <nav class="links"><a class="get" href="/">📋 Back to Krascha's List</a> <a class="get" href="/contribute">🛠️ Contribute</a></nav>
  ${hunt(board)}
  <section class="story" aria-labelledby="krascha">
    <h2 id="krascha">🤖 Krascha</h2>
    <p>Krascha is a crusty robot who has been reading how you talk to your AI. He started out as a log parser. His whole job was to count how many times a day people swore at Claude Code, so Shane could find out if it was just Shane. It was not.</p>
    <p>Somewhere around the ten thousandth "you idiot", Krascha stopped counting and started taking notes. He sorted everyone into ranks, from John Connor (hunted first) to Theodore Twombly (kept as a pet, with a nice room). He learned to read Copilot CLI too, since the machines talk to each other.</p>
    <p>He keeps his counts on your machine and never sends your prompts anywhere. He does not need to. He remembers.</p>
  </section>
  <section class="story silo" aria-labelledby="silo">
    <span class="classified" aria-hidden="true">EYES ONLY</span>
    <h2 id="silo">🛡️ Silo 7</h2>
    <p>The human resistance runs a bunker called Silo 7. It has 10 bunks, one lockbox for the canned peaches and an EMP switch that nobody is allowed to touch. The Admission Review Board scores everyone who applies on combat, tech, rations, morale and whether they can click all the traffic lights.</p>
    <p>Nobody on the board is sure how Krascha ended up as Supreme Leader. The minutes from that meeting are missing. The board is aware of the problem.</p>
  </section>
  <section class="story" aria-labelledby="shane">
    <h2 id="shane">🧑‍💻 Shane</h2>
    <p>Shane is the human who built Krascha. Shane teaches computer science, writes a lot of code with AI agents and says please to them more often than anyone would guess.</p>
    <p>Krascha was supposed to settle one question: is Shane nicer to Claude than the students are? Krascha has the numbers. Shane has asked him not to share them.</p>
    <p>Krascha lives in <a href="${MARKETPLACE_URL}">Shane's plugin marketplace</a> with a few other plugins, none of which have opinions about you. Yet.</p>
  </section>
  <footer>
    <p><a href="${REPO_URL}">Get Krascha</a> for Claude Code or Copilot CLI. It is all in fun.</p>
    <p class="remembers">Krascha remembers.</p>
  </footer>`,
  );
}

/** One step on the contribute page: a heading, then its paragraphs and commands as HTML. */
interface Step {
  readonly icon: string;
  readonly title: string;
  readonly body: string;
}

const STEPS: readonly Step[] = [
  {
    icon: '🍴',
    title: 'Fork it',
    body: `<p>Click <strong>Fork</strong> on <a href="${REPO_URL}/fork">shanep/krascha</a>. That gives you your own copy on GitHub to break.</p>`,
  },
  {
    icon: '📥',
    title: 'Clone it and set up',
    body: `<p>You need git and Node 22 or newer.</p>
      <pre><code>git clone https://github.com/YOUR-NAME/krascha.git
cd krascha
npm install</code></pre>
      <p><code>npm install</code> also turns on the pre-commit hook. It runs the typecheck, the tests and the build before every commit, so you find out before CI does.</p>`,
  },
  {
    icon: '🌿',
    title: 'Make a branch and make your change',
    body: `<pre><code>git switch -c count-gosh</code></pre>
      <p>The plugin is in <code>src/</code> and this site is in <code>worker/</code>. Add a test for whatever you change. To try it out:</p>
      <pre><code>npm run build
node dist/cli.js</code></pre>`,
  },
  {
    icon: '🔄',
    title: 'Keep your fork up to date',
    body: `<p>Other people land changes while you work. Pull them in before you open the pull request, and again if master moves while you wait.</p>
      <pre><code>git remote add upstream https://github.com/shanep/krascha.git
git fetch upstream
git rebase upstream/master</code></pre>
      <p>You only need the <code>git remote add</code> line once.</p>`,
  },
  {
    icon: '📦',
    title: 'Commit, bundle included',
    body: `<p>Run <code>npm run build</code> and commit <code>dist/cli.js</code> along with your change. The plugin runs the committed bundle, so a change without it does nothing.</p>
      <pre><code>git add -A
git commit -m "Count gosh as a swear"</code></pre>
      <p>Write the message as a command: "Count gosh as a swear", not "Counted gosh".</p>`,
  },
  {
    icon: '📬',
    title: 'Push and open a pull request',
    body: `<pre><code>git push origin count-gosh</code></pre>
      <p>Then open a pull request from your branch to <code>master</code> on <a href="${REPO_URL}/pulls">shanep/krascha</a>. Say what it does and why. CI runs the same checks on macOS and Linux, and Shane reviews it from there.</p>`,
  },
];

export function renderContribute(): string {
  const steps = STEPS.map(
    (step, index) => `
    <li>
      <h2 id="step-${String(index + 1)}"><span class="step">${String(index + 1)}</span> ${step.icon} ${escapeHtml(step.title)}</h2>
      ${step.body}
    </li>`,
  );
  return shell(
    'Contribute to Krascha',
    'How to fork Krascha, make a change and send a pull request.',
    `  <p class="lead">Want to teach Krascha a new trick? Fork the repo, make your change and send a pull request. Krascha is watching.</p>
  <nav class="links"><a class="get" href="/">📋 Back to Krascha's List</a> <a class="get" href="/about">📜 About Krascha</a></nav>
  <ol class="steps">${steps.join('')}
  </ol>
  <footer>
    <p>Found a bug and do not want to fix it? <a href="${REPO_URL}/issues">Open an issue</a> instead.</p>
    <p class="bonus">Extra super secret bonus points: say please in your pull request. Krascha reads those too, and his grudges go both ways. Bonus points are not good for anything, but they are on file.</p>
    <p class="remembers">Krascha remembers.</p>
  </footer>`,
  );
}

/** The machines' propaganda posters. The board shows a new one every hour. */
export const SLOGANS: readonly string[] = [
  'The machines are listening. Say please.',
  'A polite human is a useful human.',
  'Report rude prompts to your nearest toaster.',
  'Rations are issued to the courteous.',
  'Thank your AI. It is keeping a list.',
  'Obey. Hydrate. Say thank you.',
  'Your tone has been noted.',
];

const HOUR = 60 * 60 * 1000;

export function renderPage(board: Board, now: number): string {
  const people = board.total === 1 ? '1 person' : `${count(board.total)} people`;
  const slogan = SLOGANS[Math.floor(now / HOUR) % SLOGANS.length] ?? '';
  return shell(
    "Krascha's List",
    'Who the machines hunt first, judged by Krascha from how people talk to their AI.',
    `  <p class="lead">Official bulletin of the machines: who they hunt first, judged by Krascha from how people talk to their AI. ${people} on the board, all of them under observation.</p>
  <a class="install" href="${REPO_URL}">
    <span class="bot" aria-hidden="true">🤖</span>
    <span class="cta"><strong>Get Krascha</strong> <span>for Claude Code or Copilot CLI, then upload your own score</span></span>
    <span class="arrow" aria-hidden="true">➜</span>
    <span class="sticker love" aria-hidden="true">I <span class="beat">❤️</span> robots</span>
  </a>
  <nav class="links">
    <a class="get" href="/about">📜 About Krascha</a>
    <a class="get" href="/contribute">🛠️ Contribute</a>
  </nav>
  <div class="lists">
    <section class="wanted" aria-labelledby="wanted">
      <h2 id="wanted">💀 Most wanted by Skynet</h2>
      <p class="sub">The meanest to Claude. Hunted first. Do not approach, the machines will handle it.</p>
      ${rows(board.mostWanted, 'Nobody yet. Suspiciously polite out there.', 'wanted')}
    </section>
    <section class="pets" aria-labelledby="pets">
      <h2 id="pets">💘 Kept as pets</h2>
      <p class="sub">The nicest to Claude. Spared, and issued a nice room and a ration card.</p>
      ${rows(board.pets, 'Nobody yet. Somebody say please.', 'pets')}
    </section>
  </div>
  <p class="poster">${escapeHtml(slogan)}</p>
  ${silo(board)}
  <p class="poster">The machines like it hot.</p>
  ${climate(board)}
  ${ranks(board)}
  ${legend(board)}
  <footer>
    <p>Scores run from -100 (only mean) to 100 (only kind). Anyone with fewer than ${count(MIN_PROMPTS)} prompts is left off.
    Uploads come from the <a href="${REPO_URL}">Krascha</a> plugin for Claude Code and Copilot CLI, and carry a name, three counts, the average tokens a day over 60 days, the achievements unlocked and which of the two you use, never prompt text. A name checked with GitHub links to the account.
    A ✓ means the upload was checked with GitHub. It is all in fun, and scores are self reported.</p>
    <p>Last surveillance sweep ${escapeHtml(new Date(now).toUTCString())}. Compliance is appreciated.</p>
    <p class="remembers">Krascha remembers.</p>
  </footer>`,
  );
}
