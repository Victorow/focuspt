// All anthropometric calculation logic — pure functions, easily testable

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

export type OmronClassification = 'Baixo' | 'Normal' | 'Alto' | 'Muito Alto';

// Classifica pelos limites [normal, alto, muitoAlto]: abaixo do 1º = Baixo, etc.
function classifyByThresholds(value: number, [normal, alto, muitoAlto]: number[]): OmronClassification {
  if (value < normal) return 'Baixo';
  if (value < alto) return 'Normal';
  if (value < muitoAlto) return 'Alto';
  return 'Muito Alto';
}

// % de gordura corporal — tabela do manual da Omron HBF-514C (Gallagher et al., 2000).
// Fonte: https://omronbrasil.com/wp-content/uploads/2023/07/balanca_HBF-514C-LA_ES_-PT_im-2.pdf
// Menores de 20 anos não constam na tabela: usam a faixa 20–39.
export function classifyBodyFat(gender: 'MALE' | 'FEMALE', age: number, fatPct: number): OmronClassification {
  const thresholds = gender === 'MALE'
    ? age < 40 ? [8, 20, 25] : age < 60 ? [11, 22, 28] : [13, 25, 30]
    : age < 40 ? [21, 33, 39] : age < 60 ? [23, 34, 40] : [24, 36, 42];
  return classifyByThresholds(fatPct, thresholds);
}

// % de músculo esquelético — tabela do manual da Omron HBF-514C (mesma fonte acima).
// Menores de 18 anos não constam na tabela: usam a faixa 18–39.
export function classifySkeletalMuscle(gender: 'MALE' | 'FEMALE', age: number, musclePct: number): OmronClassification {
  const thresholds = gender === 'MALE'
    ? age < 40 ? [33.3, 39.4, 44.1] : age < 60 ? [33.1, 39.2, 43.9] : [32.9, 39.0, 43.7]
    : age < 40 ? [24.3, 30.4, 35.4] : age < 60 ? [24.1, 30.2, 35.2] : [23.9, 30.0, 35.0];
  return classifyByThresholds(musclePct, thresholds);
}

export function classifyVisceral(level: number): 'NORMAL' | 'HIGH' | 'VERY_HIGH' {
  if (level <= 9) return 'NORMAL';
  if (level <= 14) return 'HIGH';
  return 'VERY_HIGH';
}

// Somatório das 7 dobras do protocolo Jackson & Pollock (bíceps e panturrilha NÃO entram)
export function calcSkinfoldsSum7(
  chest: number,
  midaxillary: number,
  triceps: number,
  subscapular: number,
  abdominal: number,
  suprailiac: number,
  midThigh: number
): number {
  return chest + midaxillary + triceps + subscapular + abdominal + suprailiac + midThigh;
}

// Jackson & Pollock 7-site formula
export function calcJacksonPollock7(
  gender: 'MALE' | 'FEMALE',
  age: number,
  chest: number,
  midaxillary: number,
  triceps: number,
  subscapular: number,
  abdominal: number,
  suprailiac: number,
  midThigh: number
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

export function classifyRcq(gender: 'MALE' | 'FEMALE', rcq: number): string {
  const thresholds = gender === 'MALE' ? [0.83, 0.88, 0.95] : [0.71, 0.77, 0.82];
  if (rcq < thresholds[0]) return 'Baixo';
  if (rcq < thresholds[1]) return 'Moderado';
  if (rcq < thresholds[2]) return 'Alto';
  return 'Muito Alto';
}

// Extrai [ano, mês, dia] de 'YYYY-MM-DD' (aceita sufixo de hora) sem passar por Date/UTC.
function parseYmd(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [NaN, NaN, NaN];
}

// Idade em anos completos na data de referência (padrão: hoje, no fuso local).
// Para avaliações, passar a data da avaliação — o JP7 usa a idade NAQUELA data.
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

// % de água corporal estimada pela hidratação da massa magra (≈ 73,2 % da massa livre de gordura).
// água% = (100 − gordura%) × 0,732 — é a fórmula usada pelas balanças de bioimpedância.
export function calcWaterPercentage(fatPct: number): number {
  return Math.round((100 - fatPct) * 0.732 * 10) / 10;
}
