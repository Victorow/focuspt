import { describe, it, expect } from 'vitest';
import {
  pdfFormatNumber,
  pdfFormatDate,
  pdfShortDate,
  pdfAgeFromBirth,
  pdfGenderLabel,
  pdfVisceralLabel,
  pdfBoolLabel,
  pdfText,
  pdfProtocolLabel,
  pdfDelta,
  pdfFormatLocalDate,
  pdfDeltaTone,
  pdfUpToDate,
} from '../app/pdf-report';

// =============================================
// pdfFormatNumber
// =============================================
describe('pdfFormatNumber', () => {
  it('formata com 1 casa por padrão', () => {
    expect(pdfFormatNumber(12.345)).toBe('12.3');
  });

  it('respeita o número de casas', () => {
    expect(pdfFormatNumber(12.345, 2)).toBe('12.35');
    expect(pdfFormatNumber(12.345, 0)).toBe('12');
  });

  it('retorna — para null/undefined/NaN', () => {
    expect(pdfFormatNumber(null)).toBe('—');
    expect(pdfFormatNumber(undefined)).toBe('—');
    expect(pdfFormatNumber(NaN)).toBe('—');
  });

  it('formata zero corretamente', () => {
    expect(pdfFormatNumber(0)).toBe('0.0');
  });
});

// =============================================
// pdfFormatDate
// =============================================
describe('pdfFormatDate', () => {
  it('converte YYYY-MM-DD para DD/MM/YYYY sem bug de fuso', () => {
    expect(pdfFormatDate('2026-06-13')).toBe('13/06/2026');
  });

  it('funciona com timestamp ISO completo', () => {
    expect(pdfFormatDate('2026-01-05T10:30:00Z')).toBe('05/01/2026');
  });

  it('retorna — para vazio/null', () => {
    expect(pdfFormatDate('')).toBe('—');
    expect(pdfFormatDate(null)).toBe('—');
    expect(pdfFormatDate(undefined)).toBe('—');
  });

  it('retorna — para data inválida', () => {
    expect(pdfFormatDate('not-a-date')).toBe('—');
  });
});

// =============================================
// pdfAgeFromBirth
// =============================================
describe('pdfAgeFromBirth', () => {
  it('calcula idade básica', () => {
    expect(pdfAgeFromBirth('2000-01-01', '2026-06-13')).toBe(26);
  });

  it('ainda não fez aniversário no ano', () => {
    expect(pdfAgeFromBirth('2000-12-31', '2026-06-13')).toBe(25);
  });

  it('exatamente no aniversário', () => {
    expect(pdfAgeFromBirth('2000-06-13', '2026-06-13')).toBe(26);
  });

  it('um dia antes do aniversário', () => {
    expect(pdfAgeFromBirth('2000-06-14', '2026-06-13')).toBe(25);
  });

  it('véspera do aniversário com ref Date local (sem bug de fuso UTC)', () => {
    // 13/06/2026 23:30 local — véspera do aniversário de 14/06
    expect(pdfAgeFromBirth('2000-06-14', new Date(2026, 5, 13, 23, 30))).toBe(25);
    // 14/06/2026 00:10 local — já fez aniversário
    expect(pdfAgeFromBirth('2000-06-14', new Date(2026, 5, 14, 0, 10))).toBe(26);
  });

  it('nascimento em 1º de janeiro não vira 31/12 do ano anterior', () => {
    expect(pdfAgeFromBirth('2000-01-01', '2025-12-31')).toBe(25);
    expect(pdfAgeFromBirth('2000-01-01', '2026-01-01')).toBe(26);
  });
});

describe('pdfGenderLabel', () => {
  it('MALE → Masculino', () => {
    expect(pdfGenderLabel('MALE')).toBe('Masculino');
  });
  it('FEMALE → Feminino', () => {
    expect(pdfGenderLabel('FEMALE')).toBe('Feminino');
  });
});

// =============================================
// pdfVisceralLabel
// =============================================
describe('pdfVisceralLabel', () => {
  it('NORMAL → Normal', () => {
    expect(pdfVisceralLabel('NORMAL')).toBe('Normal');
  });
  it('HIGH → Alto', () => {
    expect(pdfVisceralLabel('HIGH')).toBe('Alto');
  });
  it('VERY_HIGH → Muito Alto', () => {
    expect(pdfVisceralLabel('VERY_HIGH')).toBe('Muito Alto');
  });
});

// =============================================
// pdfShortDate
// =============================================
describe('pdfShortDate', () => {
  it('YYYY-MM-DD → DD/MM', () => {
    expect(pdfShortDate('2026-06-13')).toBe('13/06');
  });
  it('timestamp ISO → DD/MM', () => {
    expect(pdfShortDate('2026-01-05T10:00:00Z')).toBe('05/01');
  });
  it('vazio/null → —', () => {
    expect(pdfShortDate('')).toBe('—');
    expect(pdfShortDate(null)).toBe('—');
  });
});

// =============================================
// pdfBoolLabel
// =============================================
describe('pdfBoolLabel', () => {
  it('true → Sim', () => expect(pdfBoolLabel(true)).toBe('Sim'));
  it('false → Não', () => expect(pdfBoolLabel(false)).toBe('Não'));
  it('null/undefined → —', () => {
    expect(pdfBoolLabel(null)).toBe('—');
    expect(pdfBoolLabel(undefined)).toBe('—');
  });
});

// =============================================
// pdfText
// =============================================
describe('pdfText', () => {
  it('texto normal é preservado', () => {
    expect(pdfText('Hipertrofia')).toBe('Hipertrofia');
  });
  it('string vazia ou só espaços → —', () => {
    expect(pdfText('')).toBe('—');
    expect(pdfText('   ')).toBe('—');
  });
  it('null/undefined → —', () => {
    expect(pdfText(null)).toBe('—');
    expect(pdfText(undefined)).toBe('—');
  });
  it('faz trim nas bordas', () => {
    expect(pdfText('  Olá  ')).toBe('Olá');
  });
});

// =============================================
// pdfProtocolLabel
// =============================================
describe('pdfProtocolLabel', () => {
  it('7_dobras → nome completo', () => {
    expect(pdfProtocolLabel('7_dobras')).toContain('7 Dobras');
  });
  it('3_dobras_masc / 3_dobras_fem → nomes do protocolo de 3 dobras', () => {
    expect(pdfProtocolLabel('3_dobras_masc')).toBe('3 Dobras Masc. (Jackson & Pollock)');
    expect(pdfProtocolLabel('3_dobras_fem')).toBe('3 Dobras Fem. (Jackson & Pollock)');
  });
  it('3_dobras (inexistente no banco) não é mais mapeado', () => {
    expect(pdfProtocolLabel('3_dobras')).toBe('3_dobras');
  });
  it('protocolo desconhecido retorna ele mesmo', () => {
    expect(pdfProtocolLabel('custom')).toBe('custom');
  });
  it('null/undefined → —', () => {
    expect(pdfProtocolLabel(null)).toBe('—');
    expect(pdfProtocolLabel(undefined)).toBe('—');
  });
});

// =============================================
// pdfDelta
// =============================================
describe('pdfDelta', () => {
  it('aumento → sinal + e dir up', () => {
    const d = pdfDelta(82, 80);
    expect(d.text).toBe('+2.0');
    expect(d.dir).toBe('up');
  });

  it('redução → sinal - e dir down', () => {
    const d = pdfDelta(78, 80);
    expect(d.text).toBe('-2.0');
    expect(d.dir).toBe('down');
  });

  it('sem variação → 0 e dir flat', () => {
    const d = pdfDelta(80, 80);
    expect(d.text).toBe('0');
    expect(d.dir).toBe('flat');
  });

  it('previous ausente → — e flat', () => {
    const d = pdfDelta(80, null);
    expect(d.text).toBe('—');
    expect(d.dir).toBe('flat');
  });

  it('current ausente → — e flat', () => {
    const d = pdfDelta(undefined, 80);
    expect(d.text).toBe('—');
    expect(d.dir).toBe('flat');
  });

  it('respeita casas decimais', () => {
    const d = pdfDelta(0.92, 0.90, 2);
    expect(d.text).toBe('+0.02');
    expect(d.dir).toBe('up');
  });

  it('diferença que arredonda para zero é flat', () => {
    const d = pdfDelta(80.04, 80.0, 1);
    expect(d.dir).toBe('flat');
    expect(d.text).toBe('0');
  });
});

// =============================================
// pdfFormatLocalDate
// =============================================
describe('pdfFormatLocalDate', () => {
  it('usa campos locais (21h30 local não vira o dia seguinte)', () => {
    expect(pdfFormatLocalDate(new Date(2026, 9, 6, 21, 30))).toBe('06/10/2026');
  });
  it('preenche com zero à esquerda', () => {
    expect(pdfFormatLocalDate(new Date(2026, 0, 5))).toBe('05/01/2026');
  });
});

// =============================================
// pdfDeltaTone
// =============================================
describe('pdfDeltaTone', () => {
  const up = pdfDelta(82, 80);
  const down = pdfDelta(78, 80);
  const flat = pdfDelta(80, 80);

  it('improve down: queda é boa, alta é ruim', () => {
    expect(pdfDeltaTone(down, 'down')).toBe('good');
    expect(pdfDeltaTone(up, 'down')).toBe('bad');
  });
  it('improve up: alta é boa, queda é ruim', () => {
    expect(pdfDeltaTone(up, 'up')).toBe('good');
    expect(pdfDeltaTone(down, 'up')).toBe('bad');
  });
  it('neutral ou ausente → neutral', () => {
    expect(pdfDeltaTone(up, 'neutral')).toBe('neutral');
    expect(pdfDeltaTone(down, undefined)).toBe('neutral');
  });
  it('flat ou delta ausente → neutral', () => {
    expect(pdfDeltaTone(flat, 'down')).toBe('neutral');
    expect(pdfDeltaTone(undefined, 'up')).toBe('neutral');
  });
});

// =============================================
// pdfUpToDate
// =============================================
describe('pdfUpToDate', () => {
  const items = [
    { date: '2026-01-10' },
    { date: '2026-03-15' },
    { date: '2026-05-20' },
  ];
  it('mantém só itens com data <= referência (inclusive)', () => {
    expect(pdfUpToDate(items, '2026-03-15').map(i => i.date)).toEqual(['2026-01-10', '2026-03-15']);
  });
  it('aceita datas com horário (compara só YYYY-MM-DD)', () => {
    expect(pdfUpToDate([{ date: '2026-03-15T22:00:00' }, { date: '2026-03-16T01:00:00' }], '2026-03-15'))
      .toEqual([{ date: '2026-03-15T22:00:00' }]);
  });
  it('referência ausente → retorna tudo', () => {
    expect(pdfUpToDate(items, '')).toHaveLength(3);
  });
});
