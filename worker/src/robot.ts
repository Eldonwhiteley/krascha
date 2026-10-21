// Krascha himself, drawn from the same face the CLI prints: antenna, seamed
// dome, angry brows, red eyes, bolts for ears, a grille mouth and a neck.
// The shapes only carry classes, so the page can color and animate him with
// its theme and the tab icon can bring its own colors.

const SHAPES = `
<line class="line" x1="32" y1="4" x2="32" y2="12"/>
<circle class="eye antenna" cx="32" cy="5" r="3"/>
<rect class="line face" x="3" y="26" width="8" height="14" rx="2"/>
<rect class="line face" x="53" y="26" width="8" height="14" rx="2"/>
<rect class="line face" x="9" y="12" width="46" height="38" rx="13"/>
<line class="line" x1="32" y1="12" x2="32" y2="18"/>
<line class="line" x1="16" y1="21" x2="27" y2="26"/>
<line class="line" x1="48" y1="21" x2="37" y2="26"/>
<circle class="socket" cx="22" cy="31" r="6"/>
<circle class="socket" cx="42" cy="31" r="6"/>
<circle class="eye pupil" cx="22" cy="31" r="3.5"/>
<circle class="eye pupil" cx="42" cy="31" r="3.5"/>
<circle class="glint pupil" cx="23.2" cy="29.8" r="1.1"/>
<circle class="glint pupil" cx="43.2" cy="29.8" r="1.1"/>
<circle class="socket" cx="32" cy="38" r="1.4"/>
<rect class="line" x="20" y="41" width="24" height="5" rx="1.5"/>
<line class="line thin" x1="26" y1="41" x2="26" y2="46"/>
<line class="line thin" x1="32" y1="41" x2="32" y2="46"/>
<line class="line thin" x1="38" y1="41" x2="38" y2="46"/>
<rect class="line face" x="22" y="50" width="20" height="10" rx="2"/>
<line class="line thin" x1="27" y1="50" x2="27" y2="60"/>
<line class="line thin" x1="32" y1="50" x2="32" y2="60"/>
<line class="line thin" x1="37" y1="50" x2="37" y2="60"/>`;

/** Shared by both drawings, everything but the colors. */
const SHAPE_STYLE = `.line { fill: none; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.thin { stroke-width: 2; }`;

/**
 * The page's extras: a blurred glow over each eye, and a targeting laser from
 * his right eye long enough to sweep across the title next to him.
 */
function extras(className: string): { readonly glow: string; readonly laser: string } {
  return {
    glow: `
<circle class="glow pupil" cx="22" cy="31" r="4" filter="url(#${className}-blur)"/>
<circle class="glow pupil" cx="42" cy="31" r="4" filter="url(#${className}-blur)"/>`,
    laser: `
<g class="laser">
<polygon class="cone" points="42,30 42,32 360,40 360,22" filter="url(#${className}-blur)"/>
<line class="beam" x1="42" y1="31" x2="360" y2="31"/>
<circle class="spot" cx="360" cy="31" r="3" filter="url(#${className}-blur)"/>
<circle class="spot" cx="360" cy="31" r="1.5"/>
</g>`,
  };
}

/**
 * Krascha for the page, colored by its theme and hidden from screen readers
 * since the title names him. The rig takes the hover shake and the frame
 * takes the boot, so neither restarts the other.
 */
export function robotSvg(className: string): string {
  const { glow, laser } = extras(className);
  return `<svg class="${className}" viewBox="0 0 64 64" aria-hidden="true">
<defs><filter id="${className}-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter></defs>
<g class="rig"><g class="frame">${SHAPES}${glow}</g>${laser}</g></svg>`;
}

/**
 * The page CSS that colors {@link robotSvg}, scoped to its class. He boots up
 * when the page loads, then blinks, looks around for targets, sweeps the title
 * with his laser, glitches now and then and shakes when you poke him, unless
 * the visitor asked for less motion. His eyes glow either way.
 */
export function robotStyle(className: string): string {
  const scoped = SHAPE_STYLE.replaceAll(/^\./gmu, `.${className} .`);
  return `${scoped}
.${className} .line { stroke: var(--fg); }
.${className} .face { fill: var(--card); }
.${className} .socket { fill: var(--fg); }
.${className} .eye { fill: var(--red); }
.${className} .glint { fill: #fff; }
.${className} { position: relative; z-index: 1; overflow: visible; }
.${className} .glow { fill: var(--red); opacity: 0.8; }
.${className} .rig { transform-box: view-box; transform-origin: 32px 32px; }
.${className} .laser { opacity: 0; pointer-events: none; transform-box: view-box; transform-origin: 42px 31px; }
.${className} .cone { fill: var(--red); opacity: 0.35; }
.${className} .beam { stroke: var(--red); stroke-width: 1; }
.${className} .spot { fill: var(--red); }
@media (prefers-reduced-motion: no-preference) {
  .${className} { animation: ${className}-glitch 5s steps(1) 3s infinite; }
  .${className} .frame { animation: ${className}-boot 1.2s ease-out both; }
  .${className} .pupil { transform-box: fill-box; transform-origin: center;
    animation: ${className}-blink 4s infinite, ${className}-look 7s ease-in-out infinite; }
  .${className} .glow { animation: ${className}-blink 4s infinite, ${className}-look 7s ease-in-out infinite,
    ${className}-pulse 2.4s ease-in-out infinite; }
  .${className} .antenna { animation: ${className}-beacon 1.2s steps(2) infinite; }
  .${className} .laser { animation: ${className}-scan 8s ease-in-out 1.5s infinite; }
  .${className}:hover .rig { animation: ${className}-rage 0.3s linear infinite; }
}
@keyframes ${className}-blink { 0%, 94%, 100% { scale: 1 1; } 97% { scale: 1 0.1; } }
@keyframes ${className}-look { 0%, 30%, 100% { translate: 0; } 40%, 55% { translate: -2px 0; } 65%, 80% { translate: 2px 0; } }
@keyframes ${className}-beacon { 50% { opacity: 0.2; } }
@keyframes ${className}-rage { 25% { rotate: -6deg; } 75% { rotate: 6deg; } }
@keyframes ${className}-pulse { 50% { opacity: 0.3; } }
@keyframes ${className}-boot { 0% { opacity: 0; translate: 0 -16px; } 35% { opacity: 1; translate: 0 2px; }
  45% { translate: 0 0; opacity: 0.2; } 52% { opacity: 1; } 60% { opacity: 0.4; } 70%, 100% { opacity: 1; translate: 0 0; } }
@keyframes ${className}-scan { 0%, 4% { opacity: 0; scale: 0 1; rotate: -4deg; } 8% { opacity: 1; scale: 1 1; rotate: -4deg; }
  26% { opacity: 1; scale: 1 1; rotate: 4deg; } 30%, 100% { opacity: 0; scale: 1 1; rotate: 4deg; } }
@keyframes ${className}-glitch { 0%, 100% { filter: none; translate: 0; }
  90% { filter: drop-shadow(-3px 0 rgb(255 0 80 / 0.8)) drop-shadow(3px 0 rgb(0 220 255 / 0.8)); translate: 2px 0; }
  92% { filter: drop-shadow(3px 0 rgb(255 0 80 / 0.8)) drop-shadow(-3px 0 rgb(0 220 255 / 0.8)); translate: -2px 1px; }
  94% { filter: none; translate: 0; } }`;
}

/** Krascha as a tab icon, a data URL with fixed colors since it never sees the page CSS. */
export function robotIcon(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>${SHAPE_STYLE}
.line { stroke: #1f2328; } .face { fill: #fff; } .socket { fill: #1f2328; }
.eye { fill: #cf222e; } .glint { fill: #fff; }</style>${SHAPES}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
