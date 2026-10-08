import { describe, it, expect } from 'vitest';
import {
  AGENDA_API, groupByDay, normalizeAgendaItem, weekDays, weekLabel, weekStart, weekdayLong, weekdayShort,
} from '../app/agenda-utils';

describe('semana da agenda', () => {
  it('weekStart volta para a segunda-feira (domingo pertence à semana que começou na segunda)', () => {
    expect(weekStart('2026-10-07')).toBe('2026-10-05'); // quarta
    expect(weekStart('2026-10-05')).toBe('2026-10-05'); // segunda
    expect(weekStart('2026-10-11')).toBe('2026-10-05'); // domingo
    expect(weekStart('2027-01-01')).toBe('2026-12-28'); // virada de ano
  });

  it('weekDays gera 7 dias consecutivos', () => {
    expect(weekDays('2026-12-28')).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ]);
  });

  it('rótulos', () => {
    expect(weekLabel('2026-10-05')).toBe('05/10 – 11/10/2026');
    expect(weekdayShort('2026-10-05')).toBe('Seg');
    expect(weekdayLong('2026-10-11')).toBe('Domingo');
  });
});

describe('groupByDay', () => {
  it('distribui pelos 7 dias, ordena por horário e ignora itens fora da semana', () => {
    const base = { aluno_id: 'a', focus: '' };
    const days = groupByDay([
      { ...base, id: '1', studentName: 'B', date: '2026-10-07', time: '18:00' },
      { ...base, id: '2', studentName: 'A', date: '2026-10-07', time: '07:30' },
      { ...base, id: '3', studentName: 'C', date: '2026-10-11', time: '09:00' },
      { ...base, id: '4', studentName: 'D', date: '2026-10-12', time: '09:00' },
    ], '2026-10-05');
    expect(days).toHaveLength(7);
    expect(days[2].items.map(i => i.id)).toEqual(['2', '1']);
    expect(days[6].items.map(i => i.id)).toEqual(['3']);
    expect(days.flatMap(d => d.items).map(i => i.id)).not.toContain('4');
  });
});

describe('normalizeAgendaItem (contrato da API)', () => {
  it('formato novo', () => {
    expect(normalizeAgendaItem({ id: 'x', aluno_id: 'a', studentName: 'Ana', date: '2026-10-07', time: '07:30', focus: 'Pernas' }))
      .toEqual({ id: 'x', aluno_id: 'a', studentName: 'Ana', date: '2026-10-07', time: '07:30', focus: 'Pernas' });
  });

  it('student_name (contrato final da função) e focus null', () => {
    expect(normalizeAgendaItem({ id: 'x', aluno_id: 'a', student_name: 'Ana', date: '2026-10-07', time: '07:30', focus: null }))
      .toEqual({ id: 'x', aluno_id: 'a', studentName: 'Ana', date: '2026-10-07', time: '07:30', focus: '' });
  });

  it('formato antigo (alunos(name), time HH:MM:SS, focus null)', () => {
    expect(normalizeAgendaItem({ id: 'x', aluno_id: 'a', alunos: { name: 'Ana' }, date: '2026-10-07', time: '07:30:00', focus: null }))
      .toEqual({ id: 'x', aluno_id: 'a', studentName: 'Ana', date: '2026-10-07', time: '07:30', focus: '' });
  });

  it('formato da função nova (aluno_name, focus null)', () => {
    expect(normalizeAgendaItem({ id: 'x', aluno_id: 'a', aluno_name: 'Ana', date: '2026-10-07', time: '07:30', focus: null, created_at: 'z' }))
      .toEqual({ id: 'x', aluno_id: 'a', studentName: 'Ana', date: '2026-10-07', time: '07:30', focus: '' });
  });

  it('sem aluno', () => {
    const item = normalizeAgendaItem({ id: 'y', aluno_id: null, alunos: null, date: '2026-10-07', time: '10:00' });
    expect(item.aluno_id).toBeNull();
    expect(item.studentName).toBe('Sem aluno');
  });

  it('caminhos e parâmetros da API', () => {
    expect(AGENDA_API.fn).toBe('agenda');
    expect(AGENDA_API.listParams('2026-10-05', '2026-10-11')).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(AGENDA_API.itemPath('abc')).toBe('agenda/abc');
  });
});
