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

/** Krascha for the page, colored by its theme and hidden from screen readers since the title names him. */
export function robotSvg(className: string): string {
  return `<svg class="${className}" viewBox="0 0 64 64" aria-hidden="true">${SHAPES}</svg>`;
}

/**
 * The page CSS that colors {@link robotSvg}, scoped to its class. He blinks,
 * looks around for targets and shakes when you poke him, unless the visitor
 * asked for less motion.
 */
export function robotStyle(className: string): string {
  const scoped = SHAPE_STYLE.replaceAll(/^\./gmu, `.${className} .`);
  return `${scoped}
.${className} .line { stroke: var(--fg); }
.${className} .face { fill: var(--card); }
.${className} .socket { fill: var(--fg); }
.${className} .eye { fill: var(--red); }
.${className} .glint { fill: #fff; }
@media (prefers-reduced-motion: no-preference) {
  .${className} .pupil { transform-box: fill-box; transform-origin: center;
    animation: ${className}-blink 4s infinite, ${className}-look 7s ease-in-out infinite; }
  .${className} .antenna { animation: ${className}-beacon 1.2s steps(2) infinite; }
  .${className}:hover { animation: ${className}-rage 0.3s linear infinite; }
}
@keyframes ${className}-blink { 0%, 94%, 100% { scale: 1 1; } 97% { scale: 1 0.1; } }
@keyframes ${className}-look { 0%, 30%, 100% { translate: 0; } 40%, 55% { translate: -2px 0; } 65%, 80% { translate: 2px 0; } }
@keyframes ${className}-beacon { 50% { opacity: 0.2; } }
@keyframes ${className}-rage { 25% { rotate: -6deg; } 75% { rotate: 6deg; } }`;
}

/** Krascha as a tab icon, a data URL with fixed colors since it never sees the page CSS. */
export function robotIcon(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>${SHAPE_STYLE}
.line { stroke: #1f2328; } .face { fill: #fff; } .socket { fill: #1f2328; }
.eye { fill: #cf222e; } .glint { fill: #fff; }</style>${SHAPES}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
