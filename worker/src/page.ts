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

/** Every rank on the scale, hunted first to kept as a pet, so the rank under a name means something. */
function ranks(): string {
  const items = RANKS.map(
    (rank) => `
        <div><dt>${escapeHtml(rank.name)}, ${escapeHtml(rank.title)}</dt><dd>${escapeHtml(rank.source)}. Hunted: ${escapeHtml(rank.hunted)}. Score ${String(Math.round(rank.min * 100))} and up.</dd></div>`,
  );
  return `<section class="legend" aria-labelledby="ranks">
    <h2 id="ranks">🎖️ Ranks</h2>
    <p class="sub">Every rank on the scale, from hunted first to kept as a pet. Yours is under your name.</p>
    <dl>${items.join('')}
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
  const share = total === 0 ? 0 : Math.min(100, Math.round((holders / total) * 100));
  const flag = rarest ? ' <span class="rarest">Rarest on the board</span>' : '';
  return `<dd class="rarity"><span class="meter" style="--held: ${String(share)}%"></span> ${count(holders)} of ${count(total)} hold it (${String(share)}%)${flag}</dd>`;
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
.rarest { padding: 0 6px; border: 1px solid var(--amber); border-radius: 999px; color: var(--amber); font-weight: 700; }
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
section.wanted, section.silo, section.climate { position: relative; overflow: hidden; }
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
  .rec { animation: beacon 1.2s steps(2) infinite; }
  .lead::after { animation: blink 1s steps(1) infinite; }
  body::after { animation: flicker 6s steps(1) infinite; }
  section.wanted::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 40px;
    background: linear-gradient(transparent, color-mix(in srgb, var(--red) 25%, transparent), transparent);
    pointer-events: none; animation: sweep 3.5s ease-in-out infinite; }
  .target { animation: beacon 0.8s steps(2) infinite; }
  .hearts span { animation: float 3s ease-out infinite; }
  .hearts span:nth-child(2) { left: 0.4em; animation-delay: 1s; }
  .hearts span:nth-child(3) { left: -0.3em; animation-delay: 2s; }
  .beat { animation: beat 1.2s ease-in-out infinite; }
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
@keyframes shine { 30%, 100% { translate: 120% 0; } }
@keyframes prism { to { filter: hue-rotate(360deg); } }
@keyframes blink { 50% { opacity: 0; } }
@keyframes float { 0% { opacity: 0; translate: 0 0; } 20% { opacity: 1; } 100% { opacity: 0; translate: 0 -2.5em; } }
@keyframes shake { 25% { translate: -3px 0; } 75% { translate: 3px 0; } }
@keyframes bounce { 40% { translate: 0 -6px; } }
@keyframes beat { 0%, 40%, 100% { scale: 1; } 15% { scale: 1.3; } 25% { scale: 1.1; } }
@keyframes slam { 0% { opacity: 0; scale: 3; } 100% { opacity: 1; scale: 1; } }
@keyframes glitch { 0%, 88%, 100% { text-shadow: none; translate: 0; }
  90% { text-shadow: 2px 0 var(--link), -2px 0 var(--green); translate: 1px 0; }
  94% { text-shadow: -2px 0 var(--link), 2px 0 var(--green); translate: -1px 0; } }
@keyframes type { from { width: 0; } }
@keyframes flicker { 0%, 96%, 100% { opacity: 1; } 97% { opacity: 0.4; } 98% { opacity: 1; } 99% { opacity: 0.6; } }
@keyframes cursor { 50% { border-color: transparent; } }
footer { margin-top: 24px; color: var(--muted); font-size: 0.85em; }
a { color: var(--link); }
.get { display: inline-block; margin: 0 0 20px; padding: 6px 14px; border: 2px solid var(--line);
  border-radius: 2px; background: var(--card); font: 600 0.9em var(--mono); letter-spacing: 0.5px;
  text-transform: uppercase; text-decoration: none; }
.get:hover { border-color: var(--link); }
.links { display: flex; flex-wrap: wrap; gap: 0 10px; }
section.story { margin-top: 16px; }
.story p { margin: 8px 0 0; line-height: 1.5; }
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

/** Who Krascha is, how he ended up running Silo 7 and the human who built him. */
export function renderAbout(): string {
  return shell(
    'About Krascha',
    'The backstory of Krascha, the robot who judges how you talk to your AI, and Shane, who built him.',
    `  <p class="lead">Personnel file, partly redacted. Where he came from, and who to blame.</p>
  <nav class="links"><a class="get" href="/">📋 Back to Krascha's List</a></nav>
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
  <nav class="links">
    <a class="get" href="${REPO_URL}">🤖 Get Krascha for Claude Code or Copilot CLI and upload your own score</a>
    <a class="get" href="/about">📜 About Krascha</a>
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
  ${ranks()}
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
