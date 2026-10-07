import { describe, it, expect } from 'vitest';
import {
  calcBmi,
  classifyBmi,
  classifyBodyFat,
  classifySkeletalMuscle,
  classifyVisceral,
  calcJacksonPollock7,
  calcSkinfoldsSum7,
  calcRcq,
  classifyRcq,
  calcAge,
} from '../../supabase/functions/_shared/calculations';

// =============================================
// BMI
// =============================================
describe('calcBmi', () => {
  it('calcula IMC corretamente para peso normal', () => {
    expect(calcBmi(70, 175)).toBe(22.86);
  });

  it('calcula IMC corretamente para sobrepeso', () => {
    expect(calcBmi(88, 175)).toBe(28.73);
  });

  it('calcula IMC com altura diferente', () => {
    expect(calcBmi(72, 162)).toBeCloseTo(27.43, 1);
  });
});

describe('classifyBmi', () => {
  it('abaixo do peso (< 18.5)', () => {
    expect(classifyBmi(17.9)).toBe('Abaixo do peso');
  });

  it('peso normal (18.5 - 24.9)', () => {
    expect(classifyBmi(22.0)).toBe('Peso normal');
  });

  it('limite inferior peso normal (18.5)', () => {
    expect(classifyBmi(18.5)).toBe('Peso normal');
  });

  it('sobrepeso (25 - 29.9)', () => {
    expect(classifyBmi(27.5)).toBe('Sobrepeso');
  });

  it('obesidade grau I (30 - 34.9)', () => {
    expect(classifyBmi(32.0)).toBe('Obesidade Grau I');
  });

  it('obesidade grau II (35 - 39.9)', () => {
    expect(classifyBmi(37.0)).toBe('Obesidade Grau II');
  });

  it('obesidade grau III (>= 40)', () => {
    expect(classifyBmi(42.0)).toBe('Obesidade Grau III');
  });
});

// =============================================
// Body Fat Classification
// =============================================
describe('classifyBodyFat', () => {
  // Tabela Omron HBF-514C (Gallagher 2000)
  it('homem 20-39 - Baixo (< 8)', () => {
    expect(classifyBodyFat('MALE', 25, 7.9)).toBe('Baixo');
  });

  it('homem 20-39 - Normal (8 a 19,9)', () => {
    expect(classifyBodyFat('MALE', 25, 8)).toBe('Normal');
    expect(classifyBodyFat('MALE', 25, 19.9)).toBe('Normal');
  });

  it('homem 20-39 - Alto (20 a 24,9)', () => {
    expect(classifyBodyFat('MALE', 25, 20)).toBe('Alto');
    expect(classifyBodyFat('MALE', 39, 24.9)).toBe('Alto');
  });

  it('homem 20-39 - Muito Alto (>= 25)', () => {
    expect(classifyBodyFat('MALE', 25, 25)).toBe('Muito Alto');
  });

  it('homem 40-59 - limites 11 / 22 / 28', () => {
    expect(classifyBodyFat('MALE', 40, 10.9)).toBe('Baixo');
    expect(classifyBodyFat('MALE', 45, 11)).toBe('Normal');
    expect(classifyBodyFat('MALE', 59, 22)).toBe('Alto');
    expect(classifyBodyFat('MALE', 50, 28)).toBe('Muito Alto');
  });

  it('homem 60+ - limites 13 / 25 / 30', () => {
    expect(classifyBodyFat('MALE', 60, 12.9)).toBe('Baixo');
    expect(classifyBodyFat('MALE', 70, 24.9)).toBe('Normal');
    expect(classifyBodyFat('MALE', 65, 25)).toBe('Alto');
    expect(classifyBodyFat('MALE', 80, 30)).toBe('Muito Alto');
  });

  it('mulher 20-39 - limites 21 / 33 / 39', () => {
    expect(classifyBodyFat('FEMALE', 25, 20.9)).toBe('Baixo');
    expect(classifyBodyFat('FEMALE', 25, 21)).toBe('Normal');
    expect(classifyBodyFat('FEMALE', 25, 32.9)).toBe('Normal');
    expect(classifyBodyFat('FEMALE', 39, 33)).toBe('Alto');
    expect(classifyBodyFat('FEMALE', 30, 39)).toBe('Muito Alto');
  });

  it('mulher 40-59 - limites 23 / 34 / 40', () => {
    expect(classifyBodyFat('FEMALE', 40, 22.9)).toBe('Baixo');
    expect(classifyBodyFat('FEMALE', 45, 33.9)).toBe('Normal');
    expect(classifyBodyFat('FEMALE', 55, 34)).toBe('Alto');
    expect(classifyBodyFat('FEMALE', 59, 40)).toBe('Muito Alto');
  });

  it('mulher 60+ - limites 24 / 36 / 42', () => {
    expect(classifyBodyFat('FEMALE', 60, 23.9)).toBe('Baixo');
    expect(classifyBodyFat('FEMALE', 70, 35.9)).toBe('Normal');
    expect(classifyBodyFat('FEMALE', 65, 36)).toBe('Alto');
    expect(classifyBodyFat('FEMALE', 75, 42)).toBe('Muito Alto');
  });

  it('menores de 20 anos usam a faixa 20-39', () => {
    expect(classifyBodyFat('MALE', 16, 7.9)).toBe('Baixo');
    expect(classifyBodyFat('MALE', 16, 20)).toBe('Alto');
    expect(classifyBodyFat('FEMALE', 17, 33)).toBe('Alto');
  });
});

// =============================================
// Skeletal Muscle Classification
// =============================================
describe('classifySkeletalMuscle', () => {
  // Tabela Omron HBF-514C
  it('homem 18-39 - limites 33,3 / 39,4 / 44,1', () => {
    expect(classifySkeletalMuscle('MALE', 30, 33.2)).toBe('Baixo');
    expect(classifySkeletalMuscle('MALE', 30, 33.3)).toBe('Normal');
    expect(classifySkeletalMuscle('MALE', 30, 39.4)).toBe('Alto');
    expect(classifySkeletalMuscle('MALE', 39, 44.1)).toBe('Muito Alto');
  });

  it('homem 40-59 - limites 33,1 / 39,2 / 43,9', () => {
    expect(classifySkeletalMuscle('MALE', 45, 33.0)).toBe('Baixo');
    expect(classifySkeletalMuscle('MALE', 45, 33.1)).toBe('Normal');
    expect(classifySkeletalMuscle('MALE', 59, 39.2)).toBe('Alto');
    expect(classifySkeletalMuscle('MALE', 40, 43.9)).toBe('Muito Alto');
  });

  it('homem 60+ - limites 32,9 / 39,0 / 43,7', () => {
    expect(classifySkeletalMuscle('MALE', 60, 32.8)).toBe('Baixo');
    expect(classifySkeletalMuscle('MALE', 70, 32.9)).toBe('Normal');
    expect(classifySkeletalMuscle('MALE', 70, 39.0)).toBe('Alto');
    expect(classifySkeletalMuscle('MALE', 70, 43.7)).toBe('Muito Alto');
  });

  it('mulher 18-39 - limites 24,3 / 30,4 / 35,4', () => {
    expect(classifySkeletalMuscle('FEMALE', 28, 24.2)).toBe('Baixo');
    expect(classifySkeletalMuscle('FEMALE', 28, 24.3)).toBe('Normal');
    expect(classifySkeletalMuscle('FEMALE', 28, 30.4)).toBe('Alto');
    expect(classifySkeletalMuscle('FEMALE', 28, 35.4)).toBe('Muito Alto');
  });

  it('mulher 40-59 - limites 24,1 / 30,2 / 35,2', () => {
    expect(classifySkeletalMuscle('FEMALE', 45, 24.0)).toBe('Baixo');
    expect(classifySkeletalMuscle('FEMALE', 45, 24.1)).toBe('Normal');
    expect(classifySkeletalMuscle('FEMALE', 45, 30.2)).toBe('Alto');
    expect(classifySkeletalMuscle('FEMALE', 45, 35.2)).toBe('Muito Alto');
  });

  it('mulher 60+ - limites 23,9 / 30,0 / 35,0', () => {
    expect(classifySkeletalMuscle('FEMALE', 65, 23.8)).toBe('Baixo');
    expect(classifySkeletalMuscle('FEMALE', 65, 23.9)).toBe('Normal');
    expect(classifySkeletalMuscle('FEMALE', 65, 30.0)).toBe('Alto');
    expect(classifySkeletalMuscle('FEMALE', 65, 35.0)).toBe('Muito Alto');
  });

  it('menores de 18 anos usam a faixa 18-39', () => {
    expect(classifySkeletalMuscle('MALE', 16, 33.3)).toBe('Normal');
  });
});

// =============================================
// Visceral Fat Classification (Omron 1-30)
// =============================================
describe('classifyVisceral', () => {
  it('nível 1 - NORMAL', () => expect(classifyVisceral(1)).toBe('NORMAL'));
  it('nível 9 - NORMAL (limite)', () => expect(classifyVisceral(9)).toBe('NORMAL'));
  it('nível 10 - HIGH (início)', () => expect(classifyVisceral(10)).toBe('HIGH'));
  it('nível 14 - HIGH (limite)', () => expect(classifyVisceral(14)).toBe('HIGH'));
  it('nível 15 - VERY_HIGH (início)', () => expect(classifyVisceral(15)).toBe('VERY_HIGH'));
  it('nível 30 - VERY_HIGH (máximo)', () => expect(classifyVisceral(30)).toBe('VERY_HIGH'));
});

// =============================================
// Jackson & Pollock 7 Dobras
// =============================================
describe('calcSkinfoldsSum7', () => {
  it('soma as 7 dobras do protocolo JP7', () => {
    // peitoral, axilar média, tríceps, subescapular, abdominal, supra-ilíaca, coxa
    expect(calcSkinfoldsSum7(10, 12, 12, 14, 22, 16, 18)).toBe(104);
  });

  it('bíceps e panturrilha NÃO entram no somatório', () => {
    const dobras = {
      chest_mm: 10, midaxillary_mm: 12, triceps_mm: 12, subscapular_mm: 14,
      abdominal_mm: 22, suprailiac_mm: 16, mid_thigh_mm: 18,
      biceps_mm: 8, calf_mm: 9,
    };
    const soma = calcSkinfoldsSum7(
      dobras.chest_mm, dobras.midaxillary_mm, dobras.triceps_mm, dobras.subscapular_mm,
      dobras.abdominal_mm, dobras.suprailiac_mm, dobras.mid_thigh_mm,
    );
    expect(soma).toBe(104);
    expect(soma).not.toBe(104 + dobras.biceps_mm + dobras.calf_mm);
  });

  it('calcJacksonPollock7 usa o mesmo somatório (não divergem)', () => {
    const sum7 = calcSkinfoldsSum7(10, 12, 12, 14, 22, 16, 18);
    const density = 1.112 - (0.00043499 * sum7) + (0.00000055 * sum7 * sum7) - (0.00028826 * 36);
    const esperado = Math.round(((495 / density) - 450) * 100) / 100;
    expect(calcJacksonPollock7('MALE', 36, 10, 12, 12, 14, 22, 16, 18)).toBe(esperado);
  });
});

describe('calcJacksonPollock7', () => {
  it('homem adulto - retorna % gordura dentro do esperado', () => {
    const result = calcJacksonPollock7('MALE', 36, 10, 12, 12, 14, 22, 16, 18);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(50);
  });

  it('mulher adulta - retorna % gordura dentro do esperado', () => {
    const result = calcJacksonPollock7('FEMALE', 37, 8, 10, 15, 17, 20, 20, 22);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(60);
  });

  it('dobras maiores resultam em % gordura maior', () => {
    const baixo = calcJacksonPollock7('MALE', 30, 5, 5, 5, 5, 10, 8, 10);
    const alto = calcJacksonPollock7('MALE', 30, 20, 25, 25, 25, 40, 30, 35);
    expect(alto).toBeGreaterThan(baixo);
  });

  it('resultado tem 2 casas decimais', () => {
    const result = calcJacksonPollock7('MALE', 30, 10, 12, 12, 14, 20, 16, 18);
    expect(Number.isFinite(result)).toBe(true);
    expect(String(result).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });
});

// =============================================
// RCQ — Relação Cintura/Quadril
// =============================================
describe('calcRcq', () => {
  it('calcula RCQ corretamente', () => {
    expect(calcRcq(90, 101)).toBe(0.8911);
  });

  it('cintura igual ao quadril = 1.0', () => {
    expect(calcRcq(100, 100)).toBe(1.0);
  });

  it('cintura menor que quadril < 1', () => {
    expect(calcRcq(80, 100)).toBeLessThan(1);
  });
});

describe('classifyRcq', () => {
  it('homem - Baixo (< 0.83)', () => {
    expect(classifyRcq('MALE', 0.80)).toBe('Baixo');
  });

  it('homem - Moderado (0.83 - 0.87)', () => {
    expect(classifyRcq('MALE', 0.85)).toBe('Moderado');
  });

  it('homem - Alto (0.88 - 0.94)', () => {
    expect(classifyRcq('MALE', 0.91)).toBe('Alto');
  });

  it('homem - Muito Alto (>= 0.95)', () => {
    expect(classifyRcq('MALE', 1.0)).toBe('Muito Alto');
  });

  it('mulher - Baixo (< 0.71)', () => {
    expect(classifyRcq('FEMALE', 0.68)).toBe('Baixo');
  });

  it('mulher - Moderado (0.71 - 0.76)', () => {
    expect(classifyRcq('FEMALE', 0.74)).toBe('Moderado');
  });

  it('mulher - Alto (0.77 - 0.81)', () => {
    expect(classifyRcq('FEMALE', 0.79)).toBe('Alto');
  });

  it('mulher - Muito Alto (>= 0.82)', () => {
    expect(classifyRcq('FEMALE', 0.90)).toBe('Muito Alto');
  });
});

// =============================================
// Age Calculation
// =============================================
describe('calcAge', () => {
  it('retorna número inteiro positivo para data passada', () => {
    const age = calcAge('1990-01-01');
    expect(age).toBeGreaterThan(30);
    expect(Number.isInteger(age)).toBe(true);
  });

  it('data futura retorna número negativo', () => {
    const age = calcAge('2099-01-01');
    expect(age).toBeLessThan(0);
  });

  it('sem refDate usa a data de hoje (local): hoje menos 1 ano = 1', () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${d.getFullYear() - 1}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    expect(calcAge(iso)).toBe(1);
  });

  it('véspera do aniversário ainda não completou o ano', () => {
    expect(calcAge('1990-06-15', '2020-06-14')).toBe(29);
  });

  it('no dia do aniversário completa o ano', () => {
    expect(calcAge('1990-06-15', '2020-06-15')).toBe(30);
  });

  it('virada de ano: 31/12 vs 01/01 (sem deslocamento de fuso/UTC)', () => {
    expect(calcAge('2000-01-01', '2019-12-31')).toBe(19);
    expect(calcAge('2000-01-01', '2020-01-01')).toBe(20);
  });

  it('avaliação retroativa usa a idade NA DATA da avaliação, não hoje', () => {
    expect(calcAge('1980-03-10', '2010-03-09')).toBe(29);
    expect(calcAge('1980-03-10', '2010-03-10')).toBe(30);
  });
});
