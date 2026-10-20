// Skrusty's face for each mood, in plain ASCII so it looks the same in every
// terminal and in the text a skill hands back to the agent.

import type { Mood } from '../shared/ranks.js';

interface Features {
  /** What sticks out of the top of his head. */
  readonly antenna: string;
  readonly brows: string;
  readonly eyes: string;
  readonly mouth: string;
}

const FEATURES: Readonly<Record<Mood, Features>> = {
  furious: { antenna: '\\|/', brows: '\\\\     //', eyes: '(@)   (@)', mouth: '[#######]' },
  angry: { antenna: ' | ', brows: ' \\     / ', eyes: ' O     O ', mouth: ' /-----\\ ' },
  suspicious: { antenna: ' | ', brows: ' _     _ ', eyes: ' -     O ', mouth: '  ~~~~~  ' },
  unsure: { antenna: ' ? ', brows: '  ~   ~  ', eyes: ' o     O ', mouth: '  -----  ' },
  pleased: { antenna: ' o ', brows: '         ', eyes: ' o     o ', mouth: '  \\___/  ' },
  happy: { antenna: ' * ', brows: '         ', eyes: ' ^     ^ ', mouth: ' \\_____/ ' },
  smitten: { antenna: '<3 ', brows: '         ', eyes: '<3    <3 ', mouth: ' \\_____/ ' },
};

/** The face as lines of equal width. */
export function faceFor(mood: Mood): string[] {
  const { antenna, brows, eyes, mouth } = FEATURES[mood];
  return [
    `      ${antenna}      `,
    '   .---+---.   ',
    '  /         \\  ',
    ` | ${brows} | `,
    ` | ${eyes} | `,
    `[|    ._.    |]`,
    ` | ${mouth} | `,
    '  \\_________/  ',
    '    |_|_|_|    ',
  ];
}
