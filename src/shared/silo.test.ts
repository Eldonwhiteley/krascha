import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Applicant } from './silo.js';
import { CRITERIA, MAX_SCORE, byStanding, notesFor, scoreApplicant, tipsFor } from './silo.js';

const MILLION = 1_000_000;

describe('scoreApplicant', () => {
  it('admits a steady, polite regular and gives them their best job', () => {
    const score = scoreApplicant('Kyle', {
      prompts: 2000,
      kind: 50,
      mean: 10,
      tokensPerDay: MILLION,
    });
    expect(score.scores).toStrictEqual({ combat: 8, tech: 8, rations: 8, morale: 7, human: 10 });
    expect(score).toMatchObject({
      total: 41,
      status: 'admitted',
      ruling: 'Head of Robot Screening',
    });
  });

  it('puts a lockbox on a token maxxer and doubts they are human', () => {
    const score = scoreApplicant('Kyle', {
      prompts: 2000,
      kind: 50,
      mean: 10,
      tokensPerDay: 200 * MILLION,
    });
    expect(score.scores).toMatchObject({ rations: 2, human: 6 });
    expect(score).toMatchObject({ status: 'probation', ruling: 'ration lockbox installed' });
  });

  it('sends anyone who says please every time to the Voight-Kampff test', () => {
    const score = scoreApplicant('Theodore', { prompts: 1000, kind: 1000, mean: 0 });
    expect(score.scores).toMatchObject({ combat: 2, morale: 10, human: 3 });
    expect(score).toMatchObject({ status: 'review', ruling: 'see notes' });
  });

  it('takes insults to the Supreme Leader out of Morale and puts them into Combat', () => {
    const score = scoreApplicant('John', { prompts: 1000, kind: 0, mean: 100 });
    expect(score.scores).toMatchObject({ combat: 10, morale: 0 });
    expect(score.insults).toBe(100);
    expect(notesFor(score)[0]).toContain('negative comments about our Supreme Leader');
  });

  it('puts a newcomer on latrine rotation', () => {
    const score = scoreApplicant('New', { prompts: 0, kind: 0, mean: 0 });
    expect(score.scores).toStrictEqual({ combat: 2, tech: 0, rations: 10, morale: 5, human: 10 });
    expect(score).toMatchObject({ total: 27, status: 'probation' });
    expect(score.ruling).toContain('latrine');
  });

  it('keeps every score a whole number from 0 to 10 that adds up to the total', () => {
    const applicant = fc
      .record({
        kind: fc.nat(100_000),
        mean: fc.nat(100_000),
        extra: fc.nat(100_000),
        tokensPerDay: fc.nat(1_000_000_000_000),
      })
      .map(({ kind, mean, extra, tokensPerDay }) => ({
        prompts: kind + mean + extra,
        kind,
        mean,
        tokensPerDay,
      }));
    fc.assert(
      fc.property(applicant, (counts: Applicant) => {
        const score = scoreApplicant('Any', counts);
        const values = CRITERIA.map((criterion) => score.scores[criterion.id]);
        const valid = (value: number): boolean =>
          Number.isInteger(value) && value >= 0 && value <= MAX_SCORE;
        expect(values.every(valid)).toBe(true);
        expect(values.reduce((sum, value) => sum + value, 0)).toBe(score.total);
        expect(scoreApplicant('Any', counts)).toStrictEqual(score);
      }),
    );
  });
});

describe('notesFor', () => {
  it('lists the bad notes before the good ones and skips the middling scores', () => {
    const score = scoreApplicant('New', { prompts: 0, kind: 0, mean: 0 });
    const note = (id: string, tone: 'low' | 'high'): string | undefined =>
      CRITERIA.find((criterion) => criterion.id === id)?.[tone];
    expect(notesFor(score)).toStrictEqual([
      note('combat', 'low'),
      note('tech', 'low'),
      note('rations', 'high'),
      note('human', 'high'),
    ]);
  });

  it('puts the note behind the ruling first', () => {
    const theodore = scoreApplicant('Theodore', { prompts: 1500, kind: 1400, mean: 0 });
    expect(theodore.status).toBe('review');
    expect(notesFor(theodore)[0]).toContain('Voight-Kampff');
  });
});

describe('tipsFor', () => {
  const tip = (id: string): string | undefined =>
    CRITERIA.find((criterion) => criterion.id === id)?.tip;

  it('puts the tip behind the ruling first, then the lowest scores', () => {
    const maxxer = scoreApplicant('Sarah', {
      prompts: 2564,
      kind: 40,
      mean: 300,
      tokensPerDay: 250 * MILLION,
    });
    expect(maxxer.scores).toMatchObject({ rations: 2, morale: 1, human: 6 });
    expect(maxxer.tells).toStrictEqual(['hungry']);
    expect(tipsFor(maxxer)).toStrictEqual([
      tip('rations'),
      tip('morale'),
      'Stay under 100 million tokens a day. Real people stop to eat.',
    ]);
  });

  it('names only the tells that cost Human points', () => {
    const theodore = scoreApplicant('Theodore', { prompts: 1000, kind: 1000, mean: 0 });
    expect(theodore.tells).toStrictEqual(['polite']);
    expect(tipsFor(theodore)[0]).toMatch(/^Swear at your computer once in a while\. Saying please/u);
    const both = scoreApplicant('T-1000', {
      prompts: 1000,
      kind: 1000,
      mean: 0,
      tokensPerDay: 200 * MILLION,
    });
    expect(both.tells).toStrictEqual(['polite', 'hungry']);
    expect(tipsFor(both)[0]).toBe(tip('human'));
  });

  it('skips the scores already at HIGH', () => {
    const newcomer = scoreApplicant('New', { prompts: 0, kind: 0, mean: 0 });
    expect(tipsFor(newcomer)).toStrictEqual([tip('tech'), tip('combat'), tip('morale')]);
  });
});

describe('byStanding', () => {
  it('sorts the best total first and breaks a tie by name', () => {
    const newcomer = { prompts: 0, kind: 0, mean: 0 };
    const regular = { prompts: 2000, kind: 50, mean: 10, tokensPerDay: MILLION };
    const sorted = [
      scoreApplicant('Zed', newcomer),
      scoreApplicant('Ann', newcomer),
      scoreApplicant('Kyle', regular),
    ].toSorted(byStanding);
    expect(sorted.map((score) => score.name)).toStrictEqual(['Kyle', 'Ann', 'Zed']);
  });
});
