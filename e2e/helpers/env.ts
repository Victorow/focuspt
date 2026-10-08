import path from 'node:path';

/** Prefixo de todo dado criado pela suíte — a limpeza apaga tudo que começa com ele. */
export const QA_PREFIX = 'QA Teste E2E';
export const QA_NAME = QA_PREFIX;

export const OUT_DIR = path.resolve(__dirname, '..', 'test-output');
export const STATE_FILE = path.join(OUT_DIR, 'state.json');
export const LEFTOVERS_FILE = path.join(OUT_DIR, 'qa-leftovers.json');

export function credentials(): { email: string; password: string } {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error('E2E_EMAIL / E2E_PASSWORD ausentes. Crie .env.e2e na raiz do projeto.');
  }
  return { email, password };
}

/** Data local (navegador/CI) em YYYY-MM-DD. */
export function ymd(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
}

/** Dados do aluno QA (conhecidos; os cálculos do relatório dependem deles). */
export const QA_STUDENT = {
  name: QA_NAME,
  birth_date: '1988-11-30',
  gender: 'FEMALE' as const,
  height_cm: 160,
  goal: 'Teste',
  phone_number: '12988443761',
  anamnesis: {
    cardiac_condition: false,
    joint_pain: true,
    chest_pain_during_exercise: false,
    recent_surgery_description: '',
    active_medications: '',
    notes: '',
  },
};

/** Entradas conhecidas da avaliação 1 (resultados esperados: IMC 19,2 · Σ7 148 · RCQ 0,72 · Normal/Normal). */
export const ASSESSMENT_1 = {
  weightKg: '49.2',
  bodyFatPercentage: '23.7',
  skeletalMusclePercentage: '31.0',
  restingMetabolismKcal: '1185',
  bodyAge: '27',
  visceralFatLevel: '3',
  waterPercentage: '55',
  neckCm: '30',
  shoulderCm: '93.5',
  chestCm: '81',
  waistCm: '64',
  abdomenCm: '71.5',
  hipCm: '89',
  rightArmRelaxedCm: '25.5',
  rightArmFlexedCm: '26',
  rightThighProximalCm: '49.5',
  rightCalfCm: '33',
  tricepsMm: '16',
  subscapularMm: '23',
  chestMm: '10',
  midaxillaryMm: '24',
  suprailiacMm: '24',
  abdominalMm: '22',
  midThighMm: '29',
};
