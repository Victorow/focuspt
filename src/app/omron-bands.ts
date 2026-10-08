// Faixas de referência Omron para a barra `.ref` do relatório.
// Limites copiados de calculations.ts (via assessment-calc.ts).
import {
  Gender, bodyFatThresholds, skeletalMuscleThresholds, rcqThresholds,
  classifyBodyFat, classifySkeletalMuscle, classifyBmi, visceralLabel, classifyRcq,
} from './assessment-calc';

export type BandMetric = 'bmi' | 'bodyFat' | 'skeletalMuscle' | 'visceral' | 'rcq';

export interface OmronBand {
  /** Início da faixa favorável, em % da barra. */
  left: number;
  /** Largura da faixa favorável, em % da barra. */
  width: number;
  /** Posição do valor atual, em % da barra (0–100). */
  marker: number;
  /** Classificação textual do valor (ex.: "Normal"). */
  label: string;
}

interface Scale { min: number; max: number; okFrom: number; okTo: number; label: string }

function scaleFor(metric: BandMetric, gender: Gender, age: number, value: number): Scale {
  switch (metric) {
    case 'bmi':
      return { min: 15, max: 35, okFrom: 18.5, okTo: 25, label: classifyBmi(value) };
    case 'bodyFat': {
      const [normal, alto] = bodyFatThresholds(gender, age);
      return { min: 0, max: 50, okFrom: normal, okTo: alto, label: classifyBodyFat(gender, age, value) };
    }
    case 'skeletalMuscle': {
      const [normal, alto] = skeletalMuscleThresholds(gender, age);
      return { min: 0, max: 50, okFrom: normal, okTo: alto, label: classifySkeletalMuscle(gender, age, value) };
    }
    case 'visceral':
      return { min: 0, max: 30, okFrom: 0, okTo: 9, label: visceralLabel(value) };
    case 'rcq': {
      const [, alto] = rcqThresholds(gender);
      return { min: 0.5, max: 1.1, okFrom: 0.5, okTo: alto, label: classifyRcq(gender, value) };
    }
  }
}

function pct(v: number, s: Scale): number {
  const p = ((v - s.min) / (s.max - s.min)) * 100;
  return Math.round(Math.min(100, Math.max(0, p)) * 10) / 10;
}

/** Posições (em %) da faixa favorável e do marcador para a barra de referência. Valor inválido → null. */
export function omronBand(metric: BandMetric, gender: Gender, age: number, value: number | null | undefined): OmronBand | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const s = scaleFor(metric, gender, age, value);
  const left = pct(s.okFrom, s);
  const right = pct(s.okTo, s);
  return { left, width: Math.round((right - left) * 10) / 10, marker: pct(value, s), label: s.label };
}

/** Texto do cabeçalho: "mulher, 20 a 39 anos". */
export function omronAgeBandLabel(gender: Gender, age: number): string {
  const who = gender === 'MALE' ? 'homem' : 'mulher';
  const band = age < 40 ? '20 a 39 anos' : age < 60 ? '40 a 59 anos' : '60 anos ou mais';
  return `${who}, ${band}`;
}
