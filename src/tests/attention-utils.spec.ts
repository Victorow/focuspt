import { describe, it, expect } from 'vitest';
import { buildAttentionGroups, countRecentlyAssessed, AttentionStudent } from '../app/attention-utils';
import { addDays, daysBetween, parseYmd, todayYmd, weekdayOf } from '../app/date-utils';

const TODAY = '2026-10-07';

function st(over: Partial<AttentionStudent> & { id: string }): AttentionStudent {
  return {
    name: over.id.toUpperCase(),
    last_assessment_date: TODAY,
    lgpd_consent_status: 'ACCEPTED',
    last_visceral_level: 5,
    ...over,
  };
}

describe('date-utils', () => {
  it('parseYmd aceita data pura e timestamp ISO; rejeita inválidas', () => {
    expect(parseYmd('2026-06-22')).toEqual({ y: 2026, m: 6, d: 22 });
    expect(parseYmd('2026-06-22T23:59:59-03:00')).toEqual({ y: 2026, m: 6, d: 22 });
    expect(parseYmd('2026-02-30')).toBeNull();
    expect(parseYmd('22/06/2026')).toBeNull();
    expect(parseYmd(null)).toBeNull();
    expect(parseYmd('')).toBeNull();
  });

  it('daysBetween conta dias de calendário (sem desvio de fuso)', () => {
    expect(daysBetween('2026-06-22', TODAY)).toBe(107);
    expect(daysBetween(TODAY, TODAY)).toBe(0);
    expect(daysBetween('2026-10-08', TODAY)).toBe(-1);
    expect(daysBetween('2023-12-31', '2024-03-01')).toBe(61); // ano bissexto
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysBetween('x', TODAY)).toBeNull();
  });

  it('addDays e weekdayOf', () => {
    expect(addDays('2026-10-07', 1)).toBe('2026-10-08');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(weekdayOf('2026-10-07')).toBe(3); // quarta-feira
  });

  it('todayYmd usa a data LOCAL', () => {
    expect(todayYmd(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(todayYmd(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });
});

describe('buildAttentionGroups', () => {
  it('lista vazia → nada pendente', () => {
    const g = buildAttentionGroups([], TODAY);
    expect(g).toEqual({ overdue: [], lgpdPending: [], visceralHigh: [], studentsCount: 0 });
  });

  it('aluno em dia não aparece em nenhum grupo', () => {
    const g = buildAttentionGroups([st({ id: 'ok', last_assessment_date: '2026-07-09' })], TODAY); // 90 dias
    expect(g.studentsCount).toBe(0);
  });

  it('reavaliação vencida: > 90 dias, com motivo e link para nova avaliação', () => {
    const g = buildAttentionGroups([
      st({ id: 'a', last_assessment_date: '2026-06-22' }), // 107 dias
      st({ id: 'b', last_assessment_date: '2026-07-08' }), // 91 dias
      st({ id: 'c', last_assessment_date: '2026-07-09' }), // 90 dias → em dia
    ], TODAY);
    expect(g.overdue.map(i => i.studentId)).toEqual(['a', 'b']);
    expect(g.overdue[0].reason).toBe('Última em 22/06 · 107 dias');
    expect(g.overdue[0].link).toEqual(['/alunos', 'a', 'avaliacoes', 'nova']);
    expect(g.overdue[1].reason).toBe('Última em 08/07 · 91 dias');
  });

  it('sem avaliação aparece primeiro como "Sem avaliação"; ano diferente mostra o ano', () => {
    const g = buildAttentionGroups([
      st({ id: 'old', last_assessment_date: '2025-12-20' }),
      st({ id: 'never', last_assessment_date: null }),
    ], TODAY);
    expect(g.overdue.map(i => i.studentId)).toEqual(['never', 'old']);
    expect(g.overdue[0].reason).toBe('Sem avaliação');
    expect(g.overdue[1].reason).toBe('Última em 20/12/2025 · 291 dias');
  });

  it('avaliação com data futura não conta como vencida', () => {
    const g = buildAttentionGroups([st({ id: 'f', last_assessment_date: '2026-10-20' })], TODAY);
    expect(g.overdue).toEqual([]);
  });

  it('termo LGPD pendente → link para a assinatura, ordenado por nome', () => {
    const g = buildAttentionGroups([
      st({ id: 'z', name: 'Zélia', lgpd_consent_status: 'PENDING' }),
      st({ id: 'a', name: 'Ana', lgpd_consent_status: 'PENDING' }),
      st({ id: 'ok', lgpd_consent_status: 'ACCEPTED' }),
    ], TODAY);
    expect(g.lgpdPending.map(i => i.name)).toEqual(['Ana', 'Zélia']);
    expect(g.lgpdPending[0].link).toEqual(['/alunos', 'a', 'lgpd']);
    expect(g.lgpdPending[0].reason).toBe('Termo não assinado');
  });

  it('gordura visceral ≥ 10 (Alto/Muito Alto), maior nível primeiro; null e 9 ficam de fora', () => {
    const g = buildAttentionGroups([
      st({ id: 'n9', last_visceral_level: 9 }),
      st({ id: 'n10', last_visceral_level: 10 }),
      st({ id: 'n16', last_visceral_level: 16 }),
      st({ id: 'none', last_visceral_level: null }),
    ], TODAY);
    expect(g.visceralHigh.map(i => i.studentId)).toEqual(['n16', 'n10']);
    expect(g.visceralHigh[0].reason).toBe('Nível 16 · Muito Alto');
    expect(g.visceralHigh[1].reason).toBe('Nível 10 · Alto');
    expect(g.visceralHigh[1].link).toEqual(['/alunos', 'n10']);
  });

  it('studentsCount conta alunos distintos', () => {
    const g = buildAttentionGroups([
      st({ id: 'x', last_assessment_date: null, lgpd_consent_status: 'PENDING', last_visceral_level: 12 }),
      st({ id: 'y', lgpd_consent_status: 'PENDING' }),
    ], TODAY);
    expect(g.overdue.length + g.lgpdPending.length + g.visceralHigh.length).toBe(4);
    expect(g.studentsCount).toBe(2);
  });

  it('respeita o limite de dias informado', () => {
    const g = buildAttentionGroups([st({ id: 'a', last_assessment_date: '2026-09-01' })], TODAY, 30);
    expect(g.overdue[0].reason).toBe('Última em 01/09 · 36 dias');
  });
});

describe('countRecentlyAssessed', () => {
  it('conta avaliações nos últimos 90 dias (inclusive)', () => {
    expect(countRecentlyAssessed([
      st({ id: 'a', last_assessment_date: '2026-07-09' }),
      st({ id: 'b', last_assessment_date: '2026-07-08' }),
      st({ id: 'c', last_assessment_date: null }),
      st({ id: 'd', last_assessment_date: TODAY }),
    ], TODAY)).toBe(2);
  });
});
