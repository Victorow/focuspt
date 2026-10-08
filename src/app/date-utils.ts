// Datas de calendário como strings 'YYYY-MM-DD', sem fuso: nunca usar `new Date('YYYY-MM-DD')`
// (é interpretado como UTC e pode "voltar" um dia no Brasil). Contas de dias usam Date.UTC
// a partir das partes já separadas.

export interface Ymd { y: number; m: number; d: number; }

/** Lê 'YYYY-MM-DD' (aceita também um timestamp ISO; usa só a parte da data). Inválido → null. */
export function parseYmd(value: string | null | undefined): Ymd | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Rejeita datas impossíveis (ex.: 2026-02-30).
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatYmd(p: Ymd): string {
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

/** Data local de hoje (relógio do navegador) como 'YYYY-MM-DD'. */
export function todayYmd(now: Date = new Date()): string {
  return formatYmd({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
}

function toUtcMs(p: Ymd): number {
  return Date.UTC(p.y, p.m - 1, p.d);
}

const DAY_MS = 86_400_000;

/** Dias inteiros de `from` até `to` (positivo se `to` é depois). Datas inválidas → null. */
export function daysBetween(from: string, to: string): number | null {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return null;
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

/** Soma `n` dias (pode ser negativo) a uma data 'YYYY-MM-DD'. */
export function addDays(value: string, n: number): string {
  const p = parseYmd(value);
  if (!p) throw new Error(`Data inválida: ${value}`);
  const dt = new Date(toUtcMs(p) + n * DAY_MS);
  return formatYmd({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

/** Dia da semana (0 = domingo … 6 = sábado). */
export function weekdayOf(value: string): number {
  const p = parseYmd(value);
  if (!p) throw new Error(`Data inválida: ${value}`);
  return new Date(toUtcMs(p)).getUTCDay();
}

/** 'DD/MM' (ou 'DD/MM/AAAA' quando `withYear`). */
export function formatBr(value: string, withYear = false): string {
  const p = parseYmd(value);
  if (!p) return value;
  return withYear ? `${pad2(p.d)}/${pad2(p.m)}/${p.y}` : `${pad2(p.d)}/${pad2(p.m)}`;
}
