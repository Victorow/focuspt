import { describe, it, expect } from 'vitest';
import {
  countByFilter, filterStudents, fmtNum, isLgpdPending, isOverdue, isVisceralHigh, lastAssessmentLabel, sexAge,
  FilterableStudent,
} from '../app/students-filter';

const TODAY = '2026-10-08';

function st(over: Partial<FilterableStudent> & { name: string }): FilterableStudent {
  return {
    goal: 'Hipertrofia',
    phone_number: '',
    last_assessment_date: TODAY,
    lgpd_consent_status: 'ACCEPTED',
    last_visceral_level: 5,
    ...over,
  };
}

const LIST: FilterableStudent[] = [
  st({ name: 'Marina', last_assessment_date: '2026-10-03' }),
  st({ name: 'Diego', goal: 'Redução de gordura', last_assessment_date: '2026-07-11', last_visceral_level: 12 }),
  st({ name: 'Thiago', last_assessment_date: '2026-06-22' }),
  st({ name: 'André', last_assessment_date: null, lgpd_consent_status: 'PENDING', last_visceral_level: null, phone_number: '11999' }),
  st({ name: 'Paula', last_assessment_date: '2026-07-27', last_visceral_level: 10, lgpd_consent_status: 'PENDING' }),
];

describe('predicados', () => {
  it('isOverdue: sem avaliação ou mais de 90 dias', () => {
    expect(isOverdue(st({ name: 'a', last_assessment_date: null }), TODAY)).toBe(true);
    expect(isOverdue(st({ name: 'a', last_assessment_date: '2026-07-10' }), TODAY)).toBe(false); // 90 dias → em dia
    expect(isOverdue(st({ name: 'a', last_assessment_date: '2026-07-09' }), TODAY)).toBe(true); // 91 dias
    expect(isOverdue(st({ name: 'a', last_assessment_date: '2026-07-11' }), TODAY)).toBe(false); // 89 dias
  });

  it('isVisceralHigh: nível 10 ou mais', () => {
    expect(isVisceralHigh(st({ name: 'a', last_visceral_level: 9 }))).toBe(false);
    expect(isVisceralHigh(st({ name: 'a', last_visceral_level: 10 }))).toBe(true);
    expect(isVisceralHigh(st({ name: 'a', last_visceral_level: null }))).toBe(false);
  });

  it('isLgpdPending', () => {
    expect(isLgpdPending(st({ name: 'a', lgpd_consent_status: 'PENDING' }))).toBe(true);
    expect(isLgpdPending(st({ name: 'a' }))).toBe(false);
  });
});

describe('filterStudents', () => {
  it('"Todos" sem busca devolve tudo', () => {
    expect(filterStudents(LIST, { query: '', filter: 'all' }, TODAY).map(s => s.name))
      .toEqual(['Marina', 'Diego', 'Thiago', 'André', 'Paula']);
  });

  it('filtros segmentados', () => {
    expect(filterStudents(LIST, { query: '', filter: 'overdue' }, TODAY).map(s => s.name)).toEqual(['Thiago', 'André']);
    expect(filterStudents(LIST, { query: '', filter: 'visceral' }, TODAY).map(s => s.name)).toEqual(['Diego', 'Paula']);
    expect(filterStudents(LIST, { query: '', filter: 'lgpd' }, TODAY).map(s => s.name)).toEqual(['André', 'Paula']);
  });

  it('busca por nome, objetivo ou telefone, combinada com o filtro', () => {
    expect(filterStudents(LIST, { query: 'GORDURA', filter: 'all' }, TODAY).map(s => s.name)).toEqual(['Diego']);
    expect(filterStudents(LIST, { query: '11999', filter: 'all' }, TODAY).map(s => s.name)).toEqual(['André']);
    expect(filterStudents(LIST, { query: 'paula', filter: 'overdue' }, TODAY)).toEqual([]);
    expect(filterStudents(LIST, { query: '  ', filter: 'all' }, TODAY)).toHaveLength(5);
  });

  it('countByFilter ignora a busca', () => {
    expect(countByFilter(LIST, TODAY)).toEqual({ all: 5, overdue: 2, visceral: 2, lgpd: 2 });
    expect(countByFilter([], TODAY)).toEqual({ all: 0, overdue: 0, visceral: 0, lgpd: 0 });
  });
});

describe('rótulos', () => {
  it('lastAssessmentLabel', () => {
    expect(lastAssessmentLabel('2026-10-03', TODAY)).toEqual({ date: '03/10/2026', ago: '5 dias', overdue: false });
    expect(lastAssessmentLabel('2026-10-07', TODAY)).toEqual({ date: '07/10/2026', ago: '1 dia', overdue: false });
    expect(lastAssessmentLabel(TODAY, TODAY)).toEqual({ date: '08/10/2026', ago: 'hoje', overdue: false });
    expect(lastAssessmentLabel('2026-06-22', TODAY)).toEqual({ date: '22/06/2026', ago: '108 dias', overdue: true });
    expect(lastAssessmentLabel(null, TODAY)).toEqual({ date: '—', ago: 'sem avaliação', overdue: true });
  });

  it('fmtNum usa vírgula e traço para vazio', () => {
    expect(fmtNum(49.2)).toBe('49,2');
    expect(fmtNum(91)).toBe('91,0');
    expect(fmtNum(12, 0)).toBe('12');
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(undefined)).toBe('—');
  });

  it('sexAge', () => {
    expect(sexAge('FEMALE', 37)).toBe('F · 37');
    expect(sexAge('MALE', 45)).toBe('M · 45');
    expect(sexAge('MALE', null)).toBe('M');
  });
});
