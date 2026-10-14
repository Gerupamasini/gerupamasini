import { describe, it, expect } from 'vitest';
import { SKILL_STEPS, SKILL_MAX, skillLevelFor, researchFor } from '../../src/systems/Encyclopedia';
import { warinessFor } from '../../src/creatures/Individual';
import type { IndividualRecord } from '../../src/creatures/Individual';

describe('道具の習熟度', () => {
  it('rises step by step with the catches made and tops out', () => {
    expect(skillLevelFor(0)).toBe(0);
    expect(skillLevelFor(SKILL_STEPS[0] - 1)).toBe(0);
    expect(skillLevelFor(SKILL_STEPS[0])).toBe(1);
    expect(skillLevelFor(SKILL_STEPS[2])).toBe(3);
    expect(skillLevelFor(SKILL_STEPS[SKILL_STEPS.length - 1])).toBe(SKILL_MAX);
    expect(skillLevelFor(1000)).toBe(SKILL_MAX);
  });
});

describe('大きい個体ほど警戒心が強い', () => {
  it('runs from 0.7 for the smallest to 1.3 for the largest', () => {
    expect(warinessFor(0)).toBeCloseTo(0.7);
    expect(warinessFor(50)).toBeCloseTo(1.0);
    expect(warinessFor(100)).toBeCloseTo(1.3);
    expect(warinessFor(250)).toBeCloseTo(1.3);
  });
});

describe('研究に回す', () => {
  it('gives a few points plus one per centimetre', () => {
    const rec = { length_mm: 104 } as IndividualRecord;
    expect(researchFor(rec)).toBe(15);
    expect(researchFor({ length_mm: 31 } as IndividualRecord)).toBe(8);
  });
});
