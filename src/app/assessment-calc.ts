// Espelho das fórmulas de supabase/functions/_shared/calculations.ts para
// PRÉVIA no navegador (etapa Revisão e relatório). A fonte da verdade continua
// sendo a Edge Function: o que vai para o banco é calculado lá. Qualquer
// alteração nas fórmulas precisa ser replicada aqui (há teste comparando os dois).

export type Gender = 'MALE' | 'FEMALE';
export type OmronClassification = 'Baixo' | 'Normal' | 'Alto' | 'Muito Alto';

export function calcBmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 100) / 100;
}

export function classifyBmi(bmi: number): string {
  if (bmi < 18.5) return 'Abaixo do peso';
  if (bmi < 25.0) return 'Peso normal';
  if (bmi < 30.0) return 'Sobrepeso';
  if (bmi < 35.0) return 'Obesidade Grau I';
  if (bmi < 40.0) return 'Obesidade Grau II';
  return 'Obesidade Grau III';
}

function classifyByThresholds(value: number, [normal, alto, muitoAlto]: number[]): OmronClassification {
  if (value < normal) return 'Baixo';
  if (value < alto) return 'Normal';
  if (value < muitoAlto) return 'Alto';
  return 'Muito Alto';
}

/** Limites [normal, alto, muitoAlto] do % de gordura — manual Omron HBF-514C. */
export function bodyFatThresholds(gender: Gender, age: number): number[] {
  return gender === 'MALE'
    ? age < 40 ? [8, 20, 25] : age < 60 ? [11, 22, 28] : [13, 25, 30]
    : age < 40 ? [21, 33, 39] : age < 60 ? [23, 34, 40] : [24, 36, 42];
}

export function classifyBodyFat(gender: Gender, age: number, fatPct: number): OmronClassification {
  return classifyByThresholds(fatPct, bodyFatThresholds(gender, age));
}

/** Limites [normal, alto, muitoAlto] do % de músculo esquelético — manual Omron HBF-514C. */
export function skeletalMuscleThresholds(gender: Gender, age: number): number[] {
  return gender === 'MALE'
    ? age < 40 ? [33.3, 39.4, 44.1] : age < 60 ? [33.1, 39.2, 43.9] : [32.9, 39.0, 43.7]
    : age < 40 ? [24.3, 30.4, 35.4] : age < 60 ? [24.1, 30.2, 35.2] : [23.9, 30.0, 35.0];
}

export function classifySkeletalMuscle(gender: Gender, age: number, musclePct: number): OmronClassification {
  return classifyByThresholds(musclePct, skeletalMuscleThresholds(gender, age));
}

export function classifyVisceral(level: number): 'NORMAL' | 'HIGH' | 'VERY_HIGH' {
  if (level <= 9) return 'NORMAL';
  if (level <= 14) return 'HIGH';
  return 'VERY_HIGH';
}

export function visceralLabel(level: number): string {
  switch (classifyVisceral(level)) {
    case 'NORMAL': return 'Normal';
    case 'HIGH': return 'Alto';
    default: return 'Muito Alto';
  }
}

/** Somatório das 7 dobras do Jackson & Pollock (bíceps e panturrilha ficam fora). */
export function calcSkinfoldsSum7(
  chest: number, midaxillary: number, triceps: number, subscapular: number,
  abdominal: number, suprailiac: number, midThigh: number,
): number {
  return chest + midaxillary + triceps + subscapular + abdominal + suprailiac + midThigh;
}

export function calcJacksonPollock7(
  gender: Gender, age: number,
  chest: number, midaxillary: number, triceps: number, subscapular: number,
  abdominal: number, suprailiac: number, midThigh: number,
): number {
  const sum7 = calcSkinfoldsSum7(chest, midaxillary, triceps, subscapular, abdominal, suprailiac, midThigh);
  const density = gender === 'MALE'
    ? 1.112 - (0.00043499 * sum7) + (0.00000055 * sum7 * sum7) - (0.00028826 * age)
    : 1.097 - (0.00046971 * sum7) + (0.00000056 * sum7 * sum7) - (0.00012828 * age);
  return Math.round(((495 / density) - 450) * 100) / 100;
}

export function calcRcq(waistCm: number, hipCm: number): number {
  return Math.round((waistCm / hipCm) * 10000) / 10000;
}

/** Limites [moderado, alto, muitoAlto] da RCQ. */
export function rcqThresholds(gender: Gender): number[] {
  return gender === 'MALE' ? [0.83, 0.88, 0.95] : [0.71, 0.77, 0.82];
}

export function classifyRcq(gender: Gender, rcq: number): string {
  const t = rcqThresholds(gender);
  if (rcq < t[0]) return 'Baixo';
  if (rcq < t[1]) return 'Moderado';
  if (rcq < t[2]) return 'Alto';
  return 'Muito Alto';
}

function parseYmd(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [NaN, NaN, NaN];
}

/** Idade em anos completos na data de referência (padrão: hoje). */
export function calcAge(birthDate: string, refDate?: string): number {
  const [by, bm, bd] = parseYmd(birthDate);
  let ry: number, rm: number, rd: number;
  if (refDate) {
    [ry, rm, rd] = parseYmd(refDate);
  } else {
    const today = new Date();
    [ry, rm, rd] = [today.getFullYear(), today.getMonth() + 1, today.getDate()];
  }
  let age = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) age--;
  return age;
}
