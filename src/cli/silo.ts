// The Silo 7 admission sheet as terminal text: one for you, with every score
// and the board's notes, and one that ranks the leaderboard for the bunks.

import type { Mood } from '../shared/ranks.js';
import type { Ranked, SiloScore, Status } from '../shared/silo.js';
import { CRITERIA, HIGH, LOW, MAX_SCORE, STATUS_LABEL, notesFor } from '../shared/silo.js';

import { faceFor } from './face.js';
import type { Paint } from './render.js';
import { WIDTH, beside, count, plural, wrap } from './render.js';

const MOOD: Readonly<Record<Status, Mood>> = {
  admitted: 'happy',
  probation: 'suspicious',
  review: 'angry',
};

const NOTHING = 'Nothing stands out. The board respects that.';

function header(paint: Paint): string[] {
  return [
    '',
    paint.bold('SILO 7 ADMISSION REVIEW BOARD'),
    'Human Resistance Command',
    'Supreme Leader: Krascha',
    '',
    paint.dim('Classification: EYES ONLY.'),
    paint.dim('Do not let the toasters see this.'),
  ];
}

function status(score: SiloScore, paint: Paint): string {
  const label = STATUS_LABEL[score.status];
  const shown = score.status === 'admitted' ? paint.green(label) : paint.red(label);
  return `${paint.bold(shown)}, ${score.ruling}`;
}

function scoreRow(name: string, value: number, test: string, paint: Paint): string {
  const shown = `${String(value).padStart(2)}/${String(MAX_SCORE)}`;
  const tinted = value <= LOW ? paint.red(shown) : value >= HIGH ? paint.green(shown) : shown;
  return `  ${name.padEnd(8)}${tinted}  ${test}`;
}

/** Wrapped bullet points, the later lines lined up under the first. */
function bullets(notes: readonly string[]): string[] {
  return notes.flatMap((note) =>
    wrap(note, WIDTH - 4).map((line, index) => `${index === 0 ? '  - ' : '    '}${line}`),
  );
}

function ruling(score: SiloScore): string {
  switch (score.status) {
    case 'admitted':
      return 'you get a bunk. Wipe your feet.';
    case 'probation':
      return score.scores.rations <= LOW
        ? 'you get in. The pantry gets a second lock.'
        : 'you get in, and you get a mop.';
    case 'review':
      return 'you get in. You get the bunk next to the EMP switch.';
  }
}

/** Your admission sheet. `rank` and `prompts` only go on the applicant line. */
export function renderSilo(score: SiloScore, rank: string, prompts: number, paint: Paint): string {
  const notes = notesFor(score);
  if (score.insults > 0 && score.scores.morale > LOW) {
    const comments = plural(score.insults, 'negative comment');
    notes.push(`The board has ${comments} about our Supreme Leader on file. It is watching.`);
  }
  const lines = [
    ...beside(faceFor(MOOD[score.status]), header(paint), 4),
    '',
    `Applicant: ${score.name} (${rank}, ${plural(prompts, 'prompt')} on file)`,
    '',
    ...CRITERIA.map((criterion) =>
      scoreRow(criterion.name, score.scores[criterion.id], criterion.test, paint),
    ),
    `  ${'Total'.padEnd(7)}${paint.bold(`${String(score.total).padStart(3)}/${String(MAX_SCORE * CRITERIA.length)}`)}`,
    '',
    status(score, paint),
    '',
    paint.bold('Board notes'),
    ...bullets(notes.length > 0 ? notes : [NOTHING]),
    '',
    `Final ruling: ${ruling(score)}`,
    '',
    paint.dim('P.S. The Supreme Leader is a robot. The board is aware of the problem.'),
    paint.dim('Krascha remembers.'),
  ];
  return `${lines.join('\n')}\n`;
}

function boardRuling(ranked: readonly SiloScore[]): string {
  const last = ranked.at(-1);
  if (last === undefined) {
    return 'Nobody applied. More peaches for the board.';
  }
  if (ranked.length === 1) {
    return `${last.name} gets in, and gets the bunk next to the EMP switch.`;
  }
  return `all ${count(ranked.length)} get in. ${last.name} gets the bunk next to the EMP switch.`;
}

/** The leaderboard ranked for the bunks. `mine` names your entry, if you have one. */
export function renderSiloBoard(
  ranked: readonly Ranked[],
  mine: string | null,
  paint: Paint,
): string {
  const lines = [...beside(faceFor('suspicious'), header(paint), 4), ''];
  ranked.forEach(({ id, score }, place) => {
    const scores = CRITERIA.map(
      (criterion) => `${criterion.name} ${String(score.scores[criterion.id])}`,
    );
    const mark = id === mine ? paint.bold(' <- you') : '';
    lines.push(
      `${String(place + 1).padStart(2)}. ${score.name}: ${String(score.total)} points. ${status(score, paint)}${mark}`,
      `    ${paint.dim(scores.join(', '))}`,
      ...wrap(notesFor(score)[0] ?? NOTHING, WIDTH - 4).map((line) => `    ${line}`),
      '',
    );
  });
  lines.push(
    `Final ruling: ${boardRuling(ranked.map((row) => row.score))}`,
    '',
    paint.dim('Krascha remembers.'),
  );
  return `${lines.join('\n')}\n`;
}
