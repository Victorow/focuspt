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

// =============================================
// Entrada decimal (vírgula ou ponto), formatação pt-BR e simetria
// =============================================

/** "49,2" | "49.2" | 49.2 → 49.2. Vazio ou inválido → null. */
export function parseDecimal(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = value.replace(/\s/g, '').replace(',', '.');
  if (s === '' || s === '-' || s === '.') return null;
  if (!/^-?\d*\.?\d+$|^-?\d+\.?\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** parseDecimal com regra "maior que zero" para opcionais: vazio/0 → undefined. */
export function parsePositive(value: string | number | null | undefined): number | undefined {
  const n = parseDecimal(value);
  return n !== null && n > 0 ? n : undefined;
}

/** Valor numérico → texto de campo ("49,2"). null/undefined → ''. */
export function toInputText(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(value).replace('.', ',');
}

/** Número com vírgula decimal e `digits` casas. null → '—'. */
export function formatNum(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(digits).replace('.', ',');
}

const MINUS = '\u2212';

/** Δ com sinal explícito: "+1,4", "−0,5", "0,0". null → '—'. */
export function formatDelta(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits).replace('.', ',');
  const sign = rounded > 0 ? '+' : MINUS;
  return sign + Math.abs(rounded).toFixed(digits).replace('.', ',');
}

export type Direction = 'down' | 'up' | 'neutral';

/**
 * Classe de cor do Δ: verde/vermelho dizem favorável/desfavorável, não subiu/desceu.
 * `good` = sentido favorável da medida ('down' para gordura, 'up' para músculo, 'neutral' sem juízo).
 */
export function deltaClass(delta: number | null | undefined, good: Direction): 'up' | 'dn' | 'nt' {
  if (delta === null || delta === undefined || !Number.isFinite(delta) || delta === 0 || good === 'neutral') return 'nt';
  const favorable = good === 'down' ? delta < 0 : delta > 0;
  return favorable ? 'dn' : 'up';
}

export interface Symmetry { text: string; cls: 'up' | 'dn' | 'nt' }

/** Simetria D/E: ≤0,5 cm simétrico; >1,5 cm pede conferência. */
export function symmetry(right: number | null | undefined, left: number | null | undefined): Symmetry {
  if (right === null || right === undefined || left === null || left === undefined) return { text: '—', cls: 'nt' };
  const diff = Math.round(Math.abs(right - left) * 10) / 10;
  if (diff <= 0.5) return { text: 'simétrico', cls: 'dn' };
  const side = right > left ? 'D' : 'E';
  const base = `${side} +${formatNum(diff)}`;
  return diff > 1.5 ? { text: `${base} · confira`, cls: 'up' } : { text: base, cls: 'nt' };
}

/** Variação de água corporal acima de 15 pontos entre avaliações é improvável — pede conferência. */
export const WATER_CHANGE_LIMIT = 15;

export function implausibleWaterChange(current: number | null | undefined, previous: number | null | undefined): boolean {
  if (current === null || current === undefined || previous === null || previous === undefined) return false;
  return Math.abs(current - previous) > WATER_CHANGE_LIMIT;
}

export type Trend = 'up' | 'down' | 'same';

/**
 * Direção do valor digitado em relação ao anterior, comparando no arredondamento em que o campo é exibido.
 * null quando falta um dos dois lados.
 */
export function trend(current: number | null | undefined, previous: number | null | undefined, digits = 1): Trend | null {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  const c = Number(current.toFixed(digits)), p = Number(previous.toFixed(digits));
  if (c > p) return 'up';
  if (c < p) return 'down';
  return 'same';
}

/** ↑ maior, ↓ menor, = igual. null → ''. */
export function trendSymbol(t: Trend | null): string {
  switch (t) {
    case 'up': return '↑';
    case 'down': return '↓';
    case 'same': return '=';
    default: return '';
  }
}
