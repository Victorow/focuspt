// Funções puras de apoio ao formulário de avaliação — testáveis sem DOM/Angular.

/** Dobras em mm raramente são < 6; valores abaixo disso quase sempre foram digitados em cm. */
export function shouldConvertCmToMm(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 6;
}

/** Converte cm → mm (×10), arredondando a 1 casa. */
export function cmToMm(value: number): number {
  return Math.round(value * 10 * 10) / 10;
}

export interface FieldRange { min?: number; max?: number; gtZero?: boolean; }

/** Faixas válidas alinhadas com os CHECK constraints do banco. */
export const FIELD_RANGES: Record<string, FieldRange> = {
  // bioimpedância
  weightKg: { gtZero: true },
  bodyFatPercentage: { min: 0.1, max: 80 },
  skeletalMusclePercentage: { min: 0.1, max: 80 },
  restingMetabolismKcal: { gtZero: true },
  bodyAge: { min: 10, max: 100 },
  visceralFatLevel: { min: 1, max: 30 },
  waterPercentage: { min: 0, max: 100 },
};

/** Texto de ajuda com a faixa permitida de um campo (para o modal de validação). */
export function fieldRangeHint(key: string): string {
  const r = FIELD_RANGES[key];
  if (!r) return 'Obrigatório, maior que zero';
  if (r.gtZero) return 'Maior que zero';
  if (r.min !== undefined && r.max !== undefined) return `Entre ${r.min} e ${r.max}`;
  if (r.min !== undefined) return `Mínimo ${r.min}`;
  if (r.max !== undefined) return `Máximo ${r.max}`;
  return 'Obrigatório';
}

/** Converte valor de campo numérico opcional do form: vazio/0/inválido → undefined (NULL no banco). */
export function toOptionalNumber(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = +value;
  return n ? n : undefined;
}

/** Converte select tri-estado ('', 'true', 'false') em boolean opcional. */
export function toOptionalBoolean(value: string | null | undefined): boolean | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return value === 'true';
}

/**
 * Tom visual da classificação do % de gordura (bioimpedância Omron: Baixo/Normal/Alto/Muito Alto).
 * 'Baixo' não é "excelente" → tom de alerta; Normal → bom; Alto → alerta; Muito Alto → ruim.
 */
export function fatClassificationTone(label: string | null | undefined): 'good' | 'warn' | 'bad' | 'neutral' {
  switch ((label ?? '').trim().toLowerCase()) {
    case 'normal': return 'good';
    case 'baixo':
    case 'alto': return 'warn';
    case 'muito alto': return 'bad';
    default: return 'neutral';
  }
}
