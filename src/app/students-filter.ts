// Lista de alunos: busca, filtros segmentados e rótulos das colunas.
// Funções puras — "hoje" é injetado para os testes.

import { REASSESSMENT_DAYS, VISCERAL_HIGH_LEVEL } from './attention-utils';
import { daysBetween, formatBr } from './date-utils';

export type StudentFilter = 'all' | 'overdue' | 'visceral' | 'lgpd';

export const STUDENT_FILTERS: readonly { id: StudentFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'overdue', label: 'Reavaliação vencida' },
  { id: 'visceral', label: 'Visceral alto' },
  { id: 'lgpd', label: 'LGPD pendente' },
];

export interface FilterableStudent {
  name: string;
  goal?: string | null;
  phone_number?: string | null;
  last_assessment_date: string | null;
  lgpd_consent_status: 'PENDING' | 'ACCEPTED' | string;
  last_visceral_level: number | null;
}

/** Sem avaliação ou última há MAIS de `thresholdDays` dias. */
export function isOverdue(s: FilterableStudent, today: string, thresholdDays = REASSESSMENT_DAYS): boolean {
  const days = s.last_assessment_date ? daysBetween(s.last_assessment_date, today) : null;
  return days === null || days > thresholdDays;
}

export function isVisceralHigh(s: FilterableStudent): boolean {
  const n = Number(s.last_visceral_level);
  return s.last_visceral_level !== null && s.last_visceral_level !== undefined && Number.isFinite(n) && n >= VISCERAL_HIGH_LEVEL;
}

export function isLgpdPending(s: FilterableStudent): boolean {
  return s.lgpd_consent_status !== 'ACCEPTED';
}

export function matchesFilter(s: FilterableStudent, filter: StudentFilter, today: string): boolean {
  switch (filter) {
    case 'overdue': return isOverdue(s, today);
    case 'visceral': return isVisceralHigh(s);
    case 'lgpd': return isLgpdPending(s);
    default: return true;
  }
}

/** Busca por nome, objetivo ou telefone (sem distinção de maiúsculas). */
export function matchesQuery(s: FilterableStudent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return s.name.toLowerCase().includes(q)
    || (s.goal ?? '').toLowerCase().includes(q)
    || (s.phone_number ?? '').includes(q);
}

export function filterStudents<T extends FilterableStudent>(
  list: readonly T[],
  opts: { query: string; filter: StudentFilter },
  today: string,
): T[] {
  return list.filter(s => matchesFilter(s, opts.filter, today) && matchesQuery(s, opts.query));
}

/** Contagem por filtro, para o rótulo dos botões ("Todos · 24"). Ignora a busca. */
export function countByFilter(list: readonly FilterableStudent[], today: string): Record<StudentFilter, number> {
  return {
    all: list.length,
    overdue: list.filter(s => isOverdue(s, today)).length,
    visceral: list.filter(isVisceralHigh).length,
    lgpd: list.filter(isLgpdPending).length,
  };
}

export interface LastAssessmentLabel {
  /** 'DD/MM/AAAA' ou '—'. */
  date: string;
  /** '5 dias', '1 dia', 'hoje' ou 'sem avaliação'. */
  ago: string;
  overdue: boolean;
}

export function lastAssessmentLabel(date: string | null, today: string, thresholdDays = REASSESSMENT_DAYS): LastAssessmentLabel {
  const days = date ? daysBetween(date, today) : null;
  if (days === null) return { date: '—', ago: 'sem avaliação', overdue: true };
  const ago = days <= 0 ? 'hoje' : days === 1 ? '1 dia' : `${days} dias`;
  return { date: formatBr(date!, true), ago, overdue: days > thresholdDays };
}

/** Número com vírgula decimal ('49,2'); nulo → '—'. */
export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(digits).replace('.', ',');
}

/** 'F · 37' / 'M · 45'. */
export function sexAge(gender: 'MALE' | 'FEMALE' | string, age: number | null | undefined): string {
  const g = gender === 'MALE' ? 'M' : gender === 'FEMALE' ? 'F' : '';
  const a = age !== null && age !== undefined && Number.isFinite(age) ? String(age) : '';
  return [g, a].filter(Boolean).join(' · ');
}
