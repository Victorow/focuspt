import { describe, it, expect } from 'vitest';
import * as front from '../app/assessment-calc';
import * as back from '../../supabase/functions/_shared/calculations';

// A prévia do navegador precisa dar o MESMO resultado da Edge Function.
describe('assessment-calc espelha calculations.ts', () => {
  it('IMC e classificação', () => {
    for (const [w, h] of [[70, 175], [88, 175], [49.2, 160], [120, 170]]) {
      expect(front.calcBmi(w, h)).toBe(back.calcBmi(w, h));
      expect(front.classifyBmi(front.calcBmi(w, h))).toBe(back.classifyBmi(back.calcBmi(w, h)));
    }
  });

  it('% gordura e músculo esquelético (Omron) para todas as faixas', () => {
    for (const g of ['MALE', 'FEMALE'] as const) {
      for (const age of [18, 25, 39, 40, 59, 60, 75]) {
        for (const v of [5, 10, 21, 23.7, 30.4, 33, 39, 45]) {
          expect(front.classifyBodyFat(g, age, v)).toBe(back.classifyBodyFat(g, age, v));
          expect(front.classifySkeletalMuscle(g, age, v)).toBe(back.classifySkeletalMuscle(g, age, v));
        }
      }
    }
  });

  it('gordura visceral', () => {
    for (const lvl of [1, 9, 10, 14, 15, 30]) expect(front.classifyVisceral(lvl)).toBe(back.classifyVisceral(lvl));
    expect(front.visceralLabel(3)).toBe('Normal');
    expect(front.visceralLabel(12)).toBe('Alto');
    expect(front.visceralLabel(20)).toBe('Muito Alto');
  });

  it('Jackson & Pollock 7 e somatório', () => {
    const folds: [number, number, number, number, number, number, number] = [10, 24, 16, 23, 22, 24, 29];
    expect(front.calcSkinfoldsSum7(...folds)).toBe(back.calcSkinfoldsSum7(...folds));
    expect(front.calcJacksonPollock7('FEMALE', 37, ...folds)).toBe(back.calcJacksonPollock7('FEMALE', 37, ...folds));
    expect(front.calcJacksonPollock7('MALE', 28, ...folds)).toBe(back.calcJacksonPollock7('MALE', 28, ...folds));
    expect(front.calcSkinfoldsSum7(...folds)).toBe(148);
  });

  it('RCQ e classificação', () => {
    expect(front.calcRcq(64, 89)).toBe(back.calcRcq(64, 89));
    for (const g of ['MALE', 'FEMALE'] as const) {
      for (const r of [0.6, 0.71, 0.77, 0.82, 0.83, 0.88, 0.95, 1.1]) expect(front.classifyRcq(g, r)).toBe(back.classifyRcq(g, r));
    }
  });

  it('idade na data', () => {
    expect(front.calcAge('1988-11-30', '2026-10-03')).toBe(back.calcAge('1988-11-30', '2026-10-03'));
    expect(front.calcAge('1988-11-30', '2026-10-03')).toBe(37);
    expect(front.calcAge('1988-11-30', '2026-11-30')).toBe(38);
  });

  it('expõe os limites usados pelas barras de referência', () => {
    expect(front.bodyFatThresholds('FEMALE', 37)).toEqual([21, 33, 39]);
    expect(front.skeletalMuscleThresholds('MALE', 45)).toEqual([33.1, 39.2, 43.9]);
    expect(front.rcqThresholds('FEMALE')).toEqual([0.71, 0.77, 0.82]);
  });
});

describe('assessment-calc espelha calculations.ts — água corporal', () => {
  it('calcWaterPercentage', () => {
    for (const f of [0.1, 10, 23.7, 30, 45.5, 80]) {
      expect(front.calcWaterPercentage(f)).toBe(back.calcWaterPercentage(f));
    }
  });
});
