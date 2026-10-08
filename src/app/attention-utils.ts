// "Pedem atenção" (dashboard): agrupa os alunos que precisam de alguma ação do personal.
// Funções puras — "hoje" é injetado para os testes.

import { daysBetween, formatBr, parseYmd } from './date-utils';

/** Reavaliação vence quando a última avaliação tem MAIS de 90 dias. */
export const REASSESSMENT_DAYS = 90;
/** Nível Omron de gordura visceral considerado alto (10–14 Alto, 15–30 Muito Alto). */
export const VISCERAL_HIGH_LEVEL = 10;

export interface AttentionStudent {
  id: string;
  name: string;
  last_assessment_date: string | null;
  lgpd_consent_status: 'PENDING' | 'ACCEPTED' | string;
  last_visceral_level: number | null;
}

export interface AttentionItem {
  studentId: string;
  name: string;
  /** Motivo curto, ex.: "Última em 22/06 · 107 dias". */
  reason: string;
  /** Link (segmentos do routerLink) para a ação mais útil. */
  link: string[];
}

export interface AttentionGroups {
  /** Sem avaliação ou última há mais de 90 dias. */
  overdue: AttentionItem[];
  /** Termo LGPD ainda não assinado. */
  lgpdPending: AttentionItem[];
  /** Última gordura visceral ≥ 10. */
  visceralHigh: AttentionItem[];
  /** Número de alunos distintos com pelo menos uma pendência. */
  studentsCount: number;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, 'pt-BR');
}

export function buildAttentionGroups(
  students: readonly AttentionStudent[],
  today: string,
  thresholdDays = REASSESSMENT_DAYS,
): AttentionGroups {
  const todayParts = parseYmd(today);
  const overdue: (AttentionItem & { days: number })[] = [];
  const lgpdPending: AttentionItem[] = [];
  const visceralHigh: (AttentionItem & { level: number })[] = [];

  for (const s of students) {
    // (a) Reavaliação vencida
    const days = s.last_assessment_date ? daysBetween(s.last_assessment_date, today) : null;
    if (days === null) {
      overdue.push({
        studentId: s.id, name: s.name, reason: 'Sem avaliação',
        link: ['/alunos', s.id, 'avaliacoes', 'nova'], days: Number.POSITIVE_INFINITY,
      });
    } else if (days > thresholdDays) {
      const last = parseYmd(s.last_assessment_date);
      const sameYear = !!last && !!todayParts && last.y === todayParts.y;
      overdue.push({
        studentId: s.id, name: s.name,
        reason: `Última em ${formatBr(s.last_assessment_date!, !sameYear)} · ${days} dias`,
        link: ['/alunos', s.id, 'avaliacoes', 'nova'], days,
      });
    }

    // (b) LGPD pendente
    if (s.lgpd_consent_status !== 'ACCEPTED') {
      lgpdPending.push({
        studentId: s.id, name: s.name, reason: 'Termo não assinado',
        link: ['/alunos', s.id, 'lgpd'],
      });
    }

    // (c) Gordura visceral alta
    const level = s.last_visceral_level;
    if (level !== null && level !== undefined && Number.isFinite(Number(level)) && Number(level) >= VISCERAL_HIGH_LEVEL) {
      const n = Number(level);
      visceralHigh.push({
        studentId: s.id, name: s.name,
        reason: `Nível ${n} · ${n >= 15 ? 'Muito Alto' : 'Alto'}`,
        link: ['/alunos', s.id], level: n,
      });
    }
  }

  // Mais atrasados primeiro (sem avaliação no topo); depois por nome.
  overdue.sort((a, b) => (b.days - a.days) || byName(a, b));
  lgpdPending.sort(byName);
  visceralHigh.sort((a, b) => (b.level - a.level) || byName(a, b));

  const strip = <T extends AttentionItem>({ studentId, name, reason, link }: T): AttentionItem =>
    ({ studentId, name, reason, link });

  const ids = new Set<string>([...overdue, ...lgpdPending, ...visceralHigh].map(i => i.studentId));

  return {
    overdue: overdue.map(strip),
    lgpdPending,
    visceralHigh: visceralHigh.map(strip),
    studentsCount: ids.size,
  };
}

/** Alunos com avaliação nos últimos `thresholdDays` dias (inclusive). */
export function countRecentlyAssessed(
  students: readonly AttentionStudent[],
  today: string,
  thresholdDays = REASSESSMENT_DAYS,
): number {
  return students.filter(s => {
    const days = s.last_assessment_date ? daysBetween(s.last_assessment_date, today) : null;
    return days !== null && days <= thresholdDays;
  }).length;
}
