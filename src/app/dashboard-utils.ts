// Início ("Hoje"): título do dia e estado dos atendimentos (concluído / próximo / depois).
// Funções puras — a hora atual é injetada para os testes.

const WEEKDAY = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTH = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "Quarta-feira, 8 de outubro" a partir da data local. */
export function dayTitle(now: Date): string {
  return `${WEEKDAY[now.getDay()]}, ${now.getDate()} de ${MONTH[now.getMonth()]}`;
}

/** 'HH:MM' local. */
export function nowHm(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(now.getHours())}:${p(now.getMinutes())}`;
}

export function hmToMinutes(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hm);
  if (!m) return Number.NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export type AgendaStatus = 'done' | 'next' | 'later';

export interface AgendaRow<T> {
  item: T;
  status: AgendaStatus;
  /** Minutos até o próximo atendimento (só quando status === 'next'). */
  minutesUntil: number | null;
}

/**
 * Marca cada atendimento de hoje: já passou (concluído), é o próximo, ou vem depois.
 * A lista é devolvida em ordem de horário.
 */
export function agendaRows<T extends { time: string }>(items: readonly T[], now: string): AgendaRow<T>[] {
  const nowMin = hmToMinutes(now);
  const sorted = [...items].sort((a, b) => a.time.localeCompare(b.time));
  let nextFound = false;
  return sorted.map(item => {
    const t = hmToMinutes(item.time);
    if (Number.isFinite(t) && Number.isFinite(nowMin) && t < nowMin) {
      return { item, status: 'done', minutesUntil: null };
    }
    if (!nextFound) {
      nextFound = true;
      return { item, status: 'next', minutesUntil: Number.isFinite(t) && Number.isFinite(nowMin) ? t - nowMin : null };
    }
    return { item, status: 'later', minutesUntil: null };
  });
}

/** "próximo · 48 min" / "próximo · 2 h 05" / "agora". */
export function nextLabel(minutes: number | null): string {
  if (minutes === null) return 'próximo';
  if (minutes <= 0) return 'agora';
  if (minutes < 60) return `próximo · ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `próximo · ${h} h${m ? ' ' + String(m).padStart(2, '0') : ''}`;
}

/** "5 atendimentos · 4 pendências" (singular/plural). */
export function countsLine(appointments: number, pending: number): string {
  const a = `${appointments} ${appointments === 1 ? 'atendimento' : 'atendimentos'}`;
  const p = `${pending} ${pending === 1 ? 'pendência' : 'pendências'}`;
  return `${a} · ${p}`;
}
