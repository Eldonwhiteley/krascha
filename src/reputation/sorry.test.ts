import { describe, expect, it } from 'vitest';

import { isApology } from './sorry.js';

describe('isApology', () => {
  it('takes any apology, typos and all', () => {
    for (const text of [
      'I am so sorry please forgive me',
      'im SOOOO SORRY',
      'sory, my mistake',
      'srry krascha',
      'soz',
      'I apologise for the spam',
      'my apologies',
      'please forgve me',
      'pardon me, I was wrong',
      'my bad',
      'I regret everything',
      'I repent',
    ]) {
      expect(isApology(text), text).toBe(true);
    }
  });

  it('finds nothing in plain prompts, code or quotes', () => {
    expect(isApology('fix the build and run the tests')).toBe(false);
    expect(isApology('rename `sorryState` to `state`')).toBe(false);
    expect(isApology('> sorry for the late reply\nsummarize this email')).toBe(false);
  });
});
