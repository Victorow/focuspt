import { describe, it, expect } from 'vitest';
import { agendaRows, countsLine, dayTitle, hmToMinutes, nextLabel, nowHm } from '../app/dashboard-utils';

describe('título do dia', () => {
  it('dayTitle em português, sem ano', () => {
    expect(dayTitle(new Date(2026, 9, 8, 10, 0))).toBe('Quinta-feira, 8 de outubro');
    expect(dayTitle(new Date(2026, 0, 4))).toBe('Domingo, 4 de janeiro');
  });

  it('nowHm e hmToMinutes', () => {
    expect(nowHm(new Date(2026, 9, 8, 8, 5))).toBe('08:05');
    expect(hmToMinutes('09:00')).toBe(540);
    expect(hmToMinutes('09:00:00')).toBe(540);
    expect(hmToMinutes('x')).toBeNaN();
  });
});

describe('agendaRows', () => {
  const items = [
    { id: 'c', time: '17:30' },
    { id: 'a', time: '06:30' },
    { id: 'b', time: '09:00' },
  ];

  it('ordena por horário; passado = concluído, primeiro futuro = próximo, resto = depois', () => {
    const rows = agendaRows(items, '08:12');
    expect(rows.map(r => [r.item.id, r.status, r.minutesUntil])).toEqual([
      ['a', 'done', null],
      ['b', 'next', 48],
      ['c', 'later', null],
    ]);
  });

  it('tudo concluído quando a hora já passou de todos', () => {
    expect(agendaRows(items, '20:00').every(r => r.status === 'done')).toBe(true);
  });

  it('horário igual ao atual ainda é o próximo (0 min)', () => {
    const rows = agendaRows(items, '09:00');
    expect(rows[1]).toMatchObject({ status: 'next', minutesUntil: 0 });
  });

  it('lista vazia', () => {
    expect(agendaRows([], '08:00')).toEqual([]);
  });
});

describe('rótulos', () => {
  it('nextLabel', () => {
    expect(nextLabel(48)).toBe('próximo · 48 min');
    expect(nextLabel(0)).toBe('agora');
    expect(nextLabel(125)).toBe('próximo · 2 h 05');
    expect(nextLabel(120)).toBe('próximo · 2 h');
    expect(nextLabel(null)).toBe('próximo');
  });

  it('countsLine com singular e plural', () => {
    expect(countsLine(5, 4)).toBe('5 atendimentos · 4 pendências');
    expect(countsLine(1, 1)).toBe('1 atendimento · 1 pendência');
    expect(countsLine(0, 0)).toBe('0 atendimentos · 0 pendências');
  });
});
