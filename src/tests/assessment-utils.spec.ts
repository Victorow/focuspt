import { describe, it, expect } from 'vitest';
import {
  shouldConvertCmToMm,
  cmToMm,
  fieldRangeHint,
  FIELD_RANGES,
  toOptionalNumber,
  toOptionalBoolean,
  fatClassificationTone,
} from '../app/assessment-utils';

// =============================================
// shouldConvertCmToMm
// =============================================
describe('shouldConvertCmToMm', () => {
  it('valores entre 0 e 6 (exclusivo) são tratados como cm', () => {
    expect(shouldConvertCmToMm(2.5)).toBe(true);
    expect(shouldConvertCmToMm(0.8)).toBe(true);
    expect(shouldConvertCmToMm(5.9)).toBe(true);
  });

  it('valores >= 6 são tratados como mm (não converte)', () => {
    expect(shouldConvertCmToMm(6)).toBe(false);
    expect(shouldConvertCmToMm(12)).toBe(false);
    expect(shouldConvertCmToMm(40)).toBe(false);
  });

  it('zero, negativos e NaN não convertem', () => {
    expect(shouldConvertCmToMm(0)).toBe(false);
    expect(shouldConvertCmToMm(-3)).toBe(false);
    expect(shouldConvertCmToMm(NaN)).toBe(false);
  });
});

// =============================================
// cmToMm
// =============================================
describe('cmToMm', () => {
  it('multiplica por 10', () => {
    expect(cmToMm(2.5)).toBe(25);
    expect(cmToMm(0.8)).toBe(8);
    expect(cmToMm(1.25)).toBe(12.5);
  });

  it('arredonda para 1 casa decimal', () => {
    expect(cmToMm(0.123)).toBe(1.2);
  });
});

// =============================================
// fieldRangeHint
// =============================================
describe('fieldRangeHint', () => {
  it('campos > 0 mostram "Maior que zero"', () => {
    expect(fieldRangeHint('weightKg')).toBe('Maior que zero');
    expect(fieldRangeHint('restingMetabolismKcal')).toBe('Maior que zero');
  });

  it('idade corporal mostra a faixa 10 a 100', () => {
    expect(fieldRangeHint('bodyAge')).toBe('Entre 10 e 100');
  });

  it('gordura visceral mostra a faixa 1 a 30', () => {
    expect(fieldRangeHint('visceralFatLevel')).toBe('Entre 1 e 30');
  });

  it('campo desconhecido tem fallback genérico', () => {
    expect(fieldRangeHint('campoQualquer')).toBe('Obrigatório, maior que zero');
  });
});

// =============================================
// FIELD_RANGES (consistência com o banco)
// =============================================
describe('FIELD_RANGES', () => {
  it('idade corporal: 10 a 100 (igual ao CHECK do banco)', () => {
    expect(FIELD_RANGES['bodyAge']).toEqual({ min: 10, max: 100 });
  });

  it('água corporal: 0 a 100', () => {
    expect(FIELD_RANGES['waterPercentage']).toEqual({ min: 0, max: 100 });
  });

  it('gordura visceral: 1 a 30', () => {
    expect(FIELD_RANGES['visceralFatLevel']).toEqual({ min: 1, max: 30 });
  });
});

// =============================================
// toOptionalNumber
// =============================================
describe('toOptionalNumber', () => {
  it('string numérica não vazia retorna number', () => {
    expect(toOptionalNumber('48.5')).toBe(48.5);
    expect(toOptionalNumber(48.5)).toBe(48.5);
  });

  it('string vazia, null, undefined e "0" retornam undefined', () => {
    expect(toOptionalNumber('')).toBeUndefined();
    expect(toOptionalNumber(null)).toBeUndefined();
    expect(toOptionalNumber(undefined)).toBeUndefined();
    expect(toOptionalNumber('0')).toBeUndefined();
    expect(toOptionalNumber(0)).toBeUndefined();
  });
});

// =============================================
// toOptionalBoolean
// =============================================
describe('toOptionalBoolean', () => {
  it('"true" retorna true, "false" retorna false', () => {
    expect(toOptionalBoolean('true')).toBe(true);
    expect(toOptionalBoolean('false')).toBe(false);
  });

  it('string vazia, null e undefined retornam undefined (não informado)', () => {
    expect(toOptionalBoolean('')).toBeUndefined();
    expect(toOptionalBoolean(null)).toBeUndefined();
    expect(toOptionalBoolean(undefined)).toBeUndefined();
  });
});

// =============================================
// fatClassificationTone (classificação Omron do % gordura)
// =============================================
describe('fatClassificationTone', () => {
  it('Normal → good', () => {
    expect(fatClassificationTone('Normal')).toBe('good');
  });
  it('Baixo → warn (não é "excelente")', () => {
    expect(fatClassificationTone('Baixo')).toBe('warn');
  });
  it('Alto → warn', () => {
    expect(fatClassificationTone('Alto')).toBe('warn');
  });
  it('Muito Alto → bad', () => {
    expect(fatClassificationTone('Muito Alto')).toBe('bad');
  });
  it('ignora maiúsculas/espaços', () => {
    expect(fatClassificationTone('  muito alto ')).toBe('bad');
  });
  it('desconhecido/vazio → neutral', () => {
    expect(fatClassificationTone('Excelente (Atleta)')).toBe('neutral');
    expect(fatClassificationTone(null)).toBe('neutral');
  });
});

// =============================================
// parseDecimal / parsePositive / toInputText
// =============================================
import { parseDecimal, parsePositive, toInputText, formatNum, formatDelta, deltaClass, symmetry, implausibleWaterChange } from '../app/assessment-utils';

describe('parseDecimal', () => {
  it('aceita vírgula ou ponto', () => {
    expect(parseDecimal('49,2')).toBe(49.2);
    expect(parseDecimal('49.2')).toBe(49.2);
    expect(parseDecimal(' 1185 ')).toBe(1185);
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal(3)).toBe(3);
  });

  it('vazio ou inválido → null', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
    expect(parseDecimal(NaN)).toBeNull();
  });
});

describe('parsePositive', () => {
  it('só valores > 0; vazio e zero → undefined', () => {
    expect(parsePositive('0,8')).toBe(0.8);
    expect(parsePositive('0')).toBeUndefined();
    expect(parsePositive('')).toBeUndefined();
    expect(parsePositive(null)).toBeUndefined();
  });
});

describe('toInputText', () => {
  it('usa vírgula decimal e vazio para ausente', () => {
    expect(toInputText(49.2)).toBe('49,2');
    expect(toInputText(27)).toBe('27');
    expect(toInputText(null)).toBe('');
    expect(toInputText(undefined)).toBe('');
  });
});

describe('formatNum / formatDelta', () => {
  it('formata com vírgula e casas fixas', () => {
    expect(formatNum(49.2)).toBe('49,2');
    expect(formatNum(1185, 0)).toBe('1185');
    expect(formatNum(0.7191, 2)).toBe('0,72');
    expect(formatNum(null)).toBe('—');
  });

  it('Δ com sinal explícito e sinal de menos tipográfico', () => {
    expect(formatDelta(1.4)).toBe('+1,4');
    expect(formatDelta(-0.5)).toBe('\u22120,5');
    expect(formatDelta(0)).toBe('0,0');
    expect(formatDelta(-0.04)).toBe('0,0');
    expect(formatDelta(-3, 0)).toBe('\u22123');
    expect(formatDelta(null)).toBe('—');
  });
});

describe('deltaClass', () => {
  it('verde/vermelho é favorável/desfavorável, não subiu/desceu', () => {
    expect(deltaClass(-3.4, 'down')).toBe('dn');
    expect(deltaClass(+2, 'down')).toBe('up');
    expect(deltaClass(+1.4, 'up')).toBe('dn');
    expect(deltaClass(-1.4, 'up')).toBe('up');
  });
  it('sem juízo ou sem variação → neutro', () => {
    expect(deltaClass(+5, 'neutral')).toBe('nt');
    expect(deltaClass(0, 'down')).toBe('nt');
    expect(deltaClass(null, 'down')).toBe('nt');
  });
});

describe('symmetry', () => {
  it('≤ 0,5 cm é simétrico', () => {
    expect(symmetry(33, 33)).toEqual({ text: 'simétrico', cls: 'dn' });
    expect(symmetry(22, 22.5)).toEqual({ text: 'simétrico', cls: 'dn' });
  });
  it('entre 0,5 e 1,5 mostra o lado maior', () => {
    expect(symmetry(25.5, 26.5)).toEqual({ text: 'E +1,0', cls: 'nt' });
    expect(symmetry(50.5, 49.5)).toEqual({ text: 'D +1,0', cls: 'nt' });
  });
  it('acima de 1,5 pede conferência', () => {
    expect(symmetry(26.0, 27.9)).toEqual({ text: 'E +1,9 · confira', cls: 'up' });
  });
  it('lado ausente → —', () => {
    expect(symmetry(null, 30)).toEqual({ text: '—', cls: 'nt' });
    expect(symmetry(30, undefined)).toEqual({ text: '—', cls: 'nt' });
  });
});

describe('implausibleWaterChange', () => {
  it('mais de 15 pontos entre avaliações é improvável', () => {
    expect(implausibleWaterChange(27.1, 55.1)).toBe(true);
    expect(implausibleWaterChange(55, 40)).toBe(false);
    expect(implausibleWaterChange(55.1, 39.9)).toBe(true);
  });
  it('sem valor atual ou anterior não avisa', () => {
    expect(implausibleWaterChange(null, 55)).toBe(false);
    expect(implausibleWaterChange(27, undefined)).toBe(false);
  });
});

// =============================================
// trend / trendSymbol (seta de comparação ao digitar)
// =============================================
import { trend, trendSymbol } from '../app/assessment-utils';

describe('trend', () => {
  it('maior → up, menor → down, igual → same', () => {
    expect(trend(71.4, 70)).toBe('up');
    expect(trend(69, 70)).toBe('down');
    expect(trend(70, 70)).toBe('same');
  });

  it('compara no arredondamento exibido', () => {
    expect(trend(70.04, 70, 1)).toBe('same');
    expect(trend(70.06, 70, 1)).toBe('up');
    expect(trend(1500.4, 1500, 0)).toBe('same');
  });

  it('sem um dos lados → null', () => {
    expect(trend(null, 70)).toBeNull();
    expect(trend(70, undefined)).toBeNull();
    expect(trend(NaN, 70)).toBeNull();
  });
});

describe('trendSymbol', () => {
  it('↑ ↓ = e vazio', () => {
    expect(trendSymbol('up')).toBe('↑');
    expect(trendSymbol('down')).toBe('↓');
    expect(trendSymbol('same')).toBe('=');
    expect(trendSymbol(null)).toBe('');
  });
});
