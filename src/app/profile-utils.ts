// Funções puras do perfil do aluno: sentido de melhora por métrica, faixas de referência
// Omron (barra .ref) e idade. Formatação (formatNum/formatDelta/deltaClass) vem de assessment-utils.
//
// Os limites Omron são uma CÓPIA de supabase/functions/_shared/calculations.ts
// (o front não importa de supabase/). Se mudar lá, mude aqui.

import { omronBand, BandMetric } from './omron-bands';
import type { Direction } from './assessment-utils';
import { parseYmd } from './date-utils';

export type Gender = 'MALE' | 'FEMALE';

// =============================================
// VARIAÇÃO
// =============================================

/** atual − anterior, arredondado a `digits` casas; faltando um dos lados → null. */
export function diff(current: number | null | undefined, previous: number | null | undefined, digits = 1): number | null {
  if (
    current === null || current === undefined || !Number.isFinite(current) ||
    previous === null || previous === undefined || !Number.isFinite(previous)
  ) {
    return null;
  }
  return Number((current - previous).toFixed(digits));
}

// =============================================
// SENTIDO DE MELHORA POR MÉTRICA
// =============================================

export type MetricKey =
  | 'weight' | 'bmi' | 'fat' | 'muscle' | 'visceral' | 'leanMass' | 'fatMass' | 'metabolism' | 'bodyAge' | 'water'
  | 'neck' | 'shoulder' | 'chest' | 'waist' | 'abdomen' | 'hip' | 'bust' | 'rcq'
  | 'skinfoldSum' | 'skinfoldFat';

export const METRIC_IMPROVE: Record<MetricKey, Direction> = {
  weight: 'neutral', bmi: 'neutral', fat: 'down', muscle: 'up', visceral: 'down',
  leanMass: 'up', fatMass: 'down', metabolism: 'neutral', bodyAge: 'down', water: 'neutral',
  neck: 'neutral', shoulder: 'neutral', chest: 'neutral', waist: 'down', abdomen: 'down',
  hip: 'neutral', bust: 'neutral', rcq: 'down',
  skinfoldSum: 'down', skinfoldFat: 'down',
};

// =============================================
// FAIXAS OMRON (cópia de calculations.ts)
// =============================================

export type OmronClass = 'Baixo' | 'Normal' | 'Alto' | 'Muito Alto';

function byThresholds(value: number, [normal, alto, muitoAlto]: number[]): OmronClass {
  if (value < normal) return 'Baixo';
  if (value < alto) return 'Normal';
  if (value < muitoAlto) return 'Alto';
  return 'Muito Alto';
}

/** [normal, alto, muitoAlto] do % de gordura — manual Omron HBF-514C. */
export function fatThresholds(gender: Gender, age: number): number[] {
  return gender === 'MALE'
    ? age < 40 ? [8, 20, 25] : age < 60 ? [11, 22, 28] : [13, 25, 30]
    : age < 40 ? [21, 33, 39] : age < 60 ? [23, 34, 40] : [24, 36, 42];
}

/** [normal, alto, muitoAlto] do % de músculo esquelético — manual Omron HBF-514C. */
export function muscleThresholds(gender: Gender, age: number): number[] {
  return gender === 'MALE'
    ? age < 40 ? [33.3, 39.4, 44.1] : age < 60 ? [33.1, 39.2, 43.9] : [32.9, 39.0, 43.7]
    : age < 40 ? [24.3, 30.4, 35.4] : age < 60 ? [24.1, 30.2, 35.2] : [23.9, 30.0, 35.0];
}

export const BMI_THRESHOLDS = [18.5, 25, 30];
/** Nível visceral: ≤ 9 normal, ≤ 14 alto, acima muito alto. */
export const VISCERAL_THRESHOLDS = [1, 10, 15];

export function rcqThresholds(gender: Gender): number[] {
  return gender === 'MALE' ? [0.83, 0.88, 0.95] : [0.71, 0.77, 0.82];
}

export type RefMetric = 'bmi' | 'fat' | 'muscle' | 'visceral' | 'rcq';

/** Rótulo curto (minúsculo) da classificação Omron para legendas: "normal", "alto"… */
export function omronLabel(metric: RefMetric, gender: Gender, age: number, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  let cls: string;
  switch (metric) {
    case 'bmi': cls = byThresholds(value, BMI_THRESHOLDS); break;
    case 'fat': cls = byThresholds(value, fatThresholds(gender, age)); break;
    case 'muscle': cls = byThresholds(value, muscleThresholds(gender, age)); break;
    case 'visceral': cls = byThresholds(value, VISCERAL_THRESHOLDS); break;
    case 'rcq': {
      const t = rcqThresholds(gender);
      cls = value < t[0] ? 'Baixo' : value < t[1] ? 'Moderado' : value < t[2] ? 'Alto' : 'Muito Alto';
      break;
    }
  }
  return cls.toLowerCase();
}

export interface RefBar {
  left: number;   // início da faixa favorável, em %
  width: number;  // largura da faixa favorável, em %
  mark: number;   // posição do valor atual, em %
}

const BAND_METRIC: Record<RefMetric, BandMetric> = {
  bmi: 'bmi', fat: 'bodyFat', muscle: 'skeletalMuscle', visceral: 'visceral', rcq: 'rcq',
};

/**
 * Posições (em %) da barra de referência: faixa "Normal" da Omron destacada e marcador do valor.
 * Delegado a omronBand() para que perfil e relatório usem exatamente a mesma escala.
 * Valor ausente → null (não desenha a barra).
 */
export function refBar(metric: RefMetric, gender: Gender, age: number, value: number | null | undefined): RefBar | null {
  const b = omronBand(BAND_METRIC[metric], gender, age, value);
  return b ? { left: b.left, width: b.width, mark: b.marker } : null;
}

// =============================================
// IDADE E ANAMNESE
// =============================================

/** Idade em anos completos na data de referência ('YYYY-MM-DD'); inválido → null. */
export function ageAt(birthDate: string | null | undefined, refDate: string): number | null {
  const b = parseYmd(birthDate);
  const r = parseYmd(refDate);
  if (!b || !r) return null;
  let age = r.y - b.y;
  if (r.m < b.m || (r.m === b.m && r.d < b.d)) age--;
  return age;
}

export interface AnamnesisFlags {
  cardiac_condition?: boolean | null;
  joint_pain?: boolean | null;
  chest_pain_during_exercise?: boolean | null;
}

/** Respostas "sim" da anamnese que viram etiquetas de atenção no perfil. */
export function anamnesisTags(a: AnamnesisFlags | null | undefined): string[] {
  if (!a) return [];
  const out: string[] = [];
  if (a.cardiac_condition) out.push('Problema cardíaco');
  if (a.joint_pain) out.push('Dor articular');
  if (a.chest_pain_during_exercise) out.push('Dor no peito ao esforço');
  return out;
}
