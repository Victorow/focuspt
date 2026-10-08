// Agenda: contrato com a Edge Function `agenda` + utilitários de semana (puros, testáveis).

import { addDays, formatBr, weekdayOf } from './date-utils';

// =============================================
// CONTRATO DA API (único lugar a ajustar se a função mudar)
// =============================================
//   GET    agenda?from=YYYY-MM-DD&to=YYYY-MM-DD (máx. 92 dias) → [{ id, date, time, focus|null,
//          aluno_id, student_name, created_at }] (normalizeAgendaItem também aceita
//          studentName | aluno_name | alunos.name e `time` 'HH:MM:SS')
//   POST   agenda              { aluno_id (obrigatório), date, time, focus }
//   PUT    agenda/<id>         { id, aluno_id, date, time, focus }
//   DELETE agenda/<id>         (corpo { id } também enviado)
// O id vai no caminho (padrão de aluno-detail/fotos e da função em desenvolvimento) e também
// no corpo, para funcionar com qualquer uma das duas leituras do lado do servidor.
export const AGENDA_API = {
  fn: 'agenda',
  listParams: (from: string, to: string): Record<string, string> => ({ from, to }),
  itemPath: (id: string): string => `agenda/${encodeURIComponent(id)}`,
} as const;

export interface AgendaItem {
  id: string;
  aluno_id: string | null;
  studentName: string;
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM
  focus: string;
}

export interface AgendaPayload {
  aluno_id: string;          // obrigatório no POST (a função rejeita null)
  date: string;
  time: string;
  focus: string;
}

/** Converte a linha devolvida pela API para AgendaItem, tolerando variações de formato. */
export function normalizeAgendaItem(raw: unknown): AgendaItem {
  const r = (raw ?? {}) as Record<string, unknown>;
  const aluno = (r['alunos'] ?? r['aluno']) as { name?: string } | null | undefined;
  const name = (r['studentName'] as string | null | undefined)
    ?? (r['aluno_name'] as string | null | undefined)
    ?? (r['student_name'] as string | null | undefined)
    ?? aluno?.name
    ?? '';
  return {
    id: String(r['id'] ?? ''),
    aluno_id: (r['aluno_id'] as string | null | undefined) ?? null,
    studentName: name || 'Sem aluno',
    date: String(r['date'] ?? '').slice(0, 10),
    time: String(r['time'] ?? '').slice(0, 5),
    focus: (r['focus'] as string | null | undefined) ?? '',
  };
}

// =============================================
// SEMANA
// =============================================

/** Segunda-feira da semana de `date` (semana de segunda a domingo). */
export function weekStart(date: string): string {
  const dow = weekdayOf(date); // 0 = domingo
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(date, offset);
}

/** As 7 datas (segunda → domingo) a partir de `start`. */
export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAY_LONG = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

export function weekdayShort(date: string): string {
  return WEEKDAY_SHORT[weekdayOf(date)];
}

export function weekdayLong(date: string): string {
  return WEEKDAY_LONG[weekdayOf(date)];
}

/** Rótulo da semana, ex.: "06/10 – 12/10/2026". */
export function weekLabel(start: string): string {
  return `${formatBr(start)} – ${formatBr(addDays(start, 6), true)}`;
}

export interface AgendaDay {
  date: string;
  items: AgendaItem[];
}

/** Agrupa os itens pelos 7 dias da semana (dias vazios incluídos), ordenados por horário. */
export function groupByDay(items: readonly AgendaItem[], start: string): AgendaDay[] {
  return weekDays(start).map(date => ({
    date,
    items: items
      .filter(i => i.date === date)
      .sort((a, b) => a.time.localeCompare(b.time) || a.studentName.localeCompare(b.studentName, 'pt-BR')),
  }));
}
