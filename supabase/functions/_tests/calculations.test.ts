// deno-lint-ignore-file
import { assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  calcBmi, classifyBmi,
  classifyBodyFat, classifySkeletalMuscle,
  classifyVisceral, calcJacksonPollock7, calcSkinfoldsSum7,
  calcRcq, classifyRcq, calcAge,
} from '../_shared/calculations.ts';

// =============================================
// BMI
// =============================================
Deno.test('calcBmi - peso normal', () => {
  assertEquals(calcBmi(70, 175), 22.86);
});

Deno.test('calcBmi - sobrepeso', () => {
  assertEquals(calcBmi(88, 175), 28.73);
});

Deno.test('classifyBmi - abaixo do peso', () => {
  assertEquals(classifyBmi(17.9), 'Abaixo do peso');
});

Deno.test('classifyBmi - peso normal', () => {
  assertEquals(classifyBmi(22.0), 'Peso normal');
});

Deno.test('classifyBmi - sobrepeso', () => {
  assertEquals(classifyBmi(27.5), 'Sobrepeso');
});

Deno.test('classifyBmi - obesidade I', () => {
  assertEquals(classifyBmi(32.0), 'Obesidade Grau I');
});

Deno.test('classifyBmi - obesidade II', () => {
  assertEquals(classifyBmi(37.0), 'Obesidade Grau II');
});

Deno.test('classifyBmi - obesidade III', () => {
  assertEquals(classifyBmi(42.0), 'Obesidade Grau III');
});

// =============================================
// Body Fat Classification
// =============================================
// Tabela Omron HBF-514C (Gallagher 2000)
Deno.test('classifyBodyFat - homem 20-39 limites 8 / 20 / 25', () => {
  assertEquals(classifyBodyFat('MALE', 25, 7.9), 'Baixo');
  assertEquals(classifyBodyFat('MALE', 25, 8), 'Normal');
  assertEquals(classifyBodyFat('MALE', 25, 19.9), 'Normal');
  assertEquals(classifyBodyFat('MALE', 39, 20), 'Alto');
  assertEquals(classifyBodyFat('MALE', 25, 25), 'Muito Alto');
});

Deno.test('classifyBodyFat - homem 40-59 limites 11 / 22 / 28', () => {
  assertEquals(classifyBodyFat('MALE', 40, 10.9), 'Baixo');
  assertEquals(classifyBodyFat('MALE', 45, 11), 'Normal');
  assertEquals(classifyBodyFat('MALE', 59, 22), 'Alto');
  assertEquals(classifyBodyFat('MALE', 50, 28), 'Muito Alto');
});

Deno.test('classifyBodyFat - homem 60+ limites 13 / 25 / 30', () => {
  assertEquals(classifyBodyFat('MALE', 60, 12.9), 'Baixo');
  assertEquals(classifyBodyFat('MALE', 70, 24.9), 'Normal');
  assertEquals(classifyBodyFat('MALE', 65, 25), 'Alto');
  assertEquals(classifyBodyFat('MALE', 80, 30), 'Muito Alto');
});

Deno.test('classifyBodyFat - mulher 20-39 limites 21 / 33 / 39', () => {
  assertEquals(classifyBodyFat('FEMALE', 25, 20.9), 'Baixo');
  assertEquals(classifyBodyFat('FEMALE', 25, 32.9), 'Normal');
  assertEquals(classifyBodyFat('FEMALE', 39, 33), 'Alto');
  assertEquals(classifyBodyFat('FEMALE', 30, 39), 'Muito Alto');
});

Deno.test('classifyBodyFat - mulher 40-59 limites 23 / 34 / 40', () => {
  assertEquals(classifyBodyFat('FEMALE', 40, 22.9), 'Baixo');
  assertEquals(classifyBodyFat('FEMALE', 45, 33.9), 'Normal');
  assertEquals(classifyBodyFat('FEMALE', 55, 34), 'Alto');
  assertEquals(classifyBodyFat('FEMALE', 59, 40), 'Muito Alto');
});

Deno.test('classifyBodyFat - mulher 60+ limites 24 / 36 / 42', () => {
  assertEquals(classifyBodyFat('FEMALE', 60, 23.9), 'Baixo');
  assertEquals(classifyBodyFat('FEMALE', 70, 35.9), 'Normal');
  assertEquals(classifyBodyFat('FEMALE', 65, 36), 'Alto');
  assertEquals(classifyBodyFat('FEMALE', 75, 42), 'Muito Alto');
});

Deno.test('classifyBodyFat - menores de 20 anos usam a faixa 20-39', () => {
  assertEquals(classifyBodyFat('MALE', 16, 7.9), 'Baixo');
  assertEquals(classifyBodyFat('MALE', 16, 20), 'Alto');
  assertEquals(classifyBodyFat('FEMALE', 17, 33), 'Alto');
});

// =============================================
// Skeletal Muscle Classification
// =============================================
// Tabela Omron HBF-514C
Deno.test('classifySkeletalMuscle - homem 18-39 limites 33,3 / 39,4 / 44,1', () => {
  assertEquals(classifySkeletalMuscle('MALE', 30, 33.2), 'Baixo');
  assertEquals(classifySkeletalMuscle('MALE', 30, 33.3), 'Normal');
  assertEquals(classifySkeletalMuscle('MALE', 30, 39.4), 'Alto');
  assertEquals(classifySkeletalMuscle('MALE', 39, 44.1), 'Muito Alto');
});

Deno.test('classifySkeletalMuscle - homem 40-59 limites 33,1 / 39,2 / 43,9', () => {
  assertEquals(classifySkeletalMuscle('MALE', 45, 33.0), 'Baixo');
  assertEquals(classifySkeletalMuscle('MALE', 45, 33.1), 'Normal');
  assertEquals(classifySkeletalMuscle('MALE', 59, 39.2), 'Alto');
  assertEquals(classifySkeletalMuscle('MALE', 40, 43.9), 'Muito Alto');
});

Deno.test('classifySkeletalMuscle - homem 60+ limites 32,9 / 39,0 / 43,7', () => {
  assertEquals(classifySkeletalMuscle('MALE', 60, 32.8), 'Baixo');
  assertEquals(classifySkeletalMuscle('MALE', 70, 32.9), 'Normal');
  assertEquals(classifySkeletalMuscle('MALE', 70, 39.0), 'Alto');
  assertEquals(classifySkeletalMuscle('MALE', 70, 43.7), 'Muito Alto');
});

Deno.test('classifySkeletalMuscle - mulher 18-39 limites 24,3 / 30,4 / 35,4', () => {
  assertEquals(classifySkeletalMuscle('FEMALE', 28, 24.2), 'Baixo');
  assertEquals(classifySkeletalMuscle('FEMALE', 28, 24.3), 'Normal');
  assertEquals(classifySkeletalMuscle('FEMALE', 28, 30.4), 'Alto');
  assertEquals(classifySkeletalMuscle('FEMALE', 28, 35.4), 'Muito Alto');
});

Deno.test('classifySkeletalMuscle - mulher 40-59 limites 24,1 / 30,2 / 35,2', () => {
  assertEquals(classifySkeletalMuscle('FEMALE', 45, 24.0), 'Baixo');
  assertEquals(classifySkeletalMuscle('FEMALE', 45, 24.1), 'Normal');
  assertEquals(classifySkeletalMuscle('FEMALE', 45, 30.2), 'Alto');
  assertEquals(classifySkeletalMuscle('FEMALE', 45, 35.2), 'Muito Alto');
});

Deno.test('classifySkeletalMuscle - mulher 60+ limites 23,9 / 30,0 / 35,0', () => {
  assertEquals(classifySkeletalMuscle('FEMALE', 65, 23.8), 'Baixo');
  assertEquals(classifySkeletalMuscle('FEMALE', 65, 23.9), 'Normal');
  assertEquals(classifySkeletalMuscle('FEMALE', 65, 30.0), 'Alto');
  assertEquals(classifySkeletalMuscle('FEMALE', 65, 35.0), 'Muito Alto');
});

// =============================================
// Visceral
// =============================================
Deno.test('classifyVisceral - normal', () => {
  assertEquals(classifyVisceral(9), 'NORMAL');
});

Deno.test('classifyVisceral - high (exato 10)', () => {
  assertEquals(classifyVisceral(10), 'HIGH');
});

Deno.test('classifyVisceral - high (14)', () => {
  assertEquals(classifyVisceral(14), 'HIGH');
});

Deno.test('classifyVisceral - very high', () => {
  assertEquals(classifyVisceral(15), 'VERY_HIGH');
});

Deno.test('classifyVisceral - very high extremo', () => {
  assertEquals(classifyVisceral(30), 'VERY_HIGH');
});

// =============================================
// Jackson & Pollock 7 dobras
// =============================================
Deno.test('calcSkinfoldsSum7 - soma as 7 dobras do protocolo JP7', () => {
  // peitoral, axilar média, tríceps, subescapular, abdominal, supra-ilíaca, coxa
  assertEquals(calcSkinfoldsSum7(10, 12, 12, 14, 22, 16, 18), 104);
});

Deno.test('calcSkinfoldsSum7 - bíceps e panturrilha NÃO entram no somatório', () => {
  const dobras = {
    chest_mm: 10, midaxillary_mm: 12, triceps_mm: 12, subscapular_mm: 14,
    abdominal_mm: 22, suprailiac_mm: 16, mid_thigh_mm: 18,
    biceps_mm: 8, calf_mm: 9,
  };
  const soma = calcSkinfoldsSum7(
    dobras.chest_mm, dobras.midaxillary_mm, dobras.triceps_mm, dobras.subscapular_mm,
    dobras.abdominal_mm, dobras.suprailiac_mm, dobras.mid_thigh_mm,
  );
  assertEquals(soma, 104);
  assertEquals(soma === 104 + dobras.biceps_mm + dobras.calf_mm, false);
});

Deno.test('calcJacksonPollock7 - usa o mesmo somatório de calcSkinfoldsSum7', () => {
  const sum7 = calcSkinfoldsSum7(10, 12, 12, 14, 22, 16, 18);
  const density = 1.112 - (0.00043499 * sum7) + (0.00000055 * sum7 * sum7) - (0.00028826 * 36);
  const esperado = Math.round(((495 / density) - 450) * 100) / 100;
  assertEquals(calcJacksonPollock7('MALE', 36, 10, 12, 12, 14, 22, 16, 18), esperado);
});

Deno.test('calcJacksonPollock7 - homem referência', () => {
  const result = calcJacksonPollock7('MALE', 36, 10, 12, 12, 14, 22, 16, 18);
  // sum7 = 104, density ≈ 1.0713, fat% ≈ 12.3
  assertAlmostEquals(result, 12.0, 3);
});

Deno.test('calcJacksonPollock7 - mulher referência', () => {
  const result = calcJacksonPollock7('FEMALE', 37, 0, 0, 15, 17, 0, 20, 22);
  // result should be positive and < 50
  assertEquals(result > 0 && result < 50, true);
});

Deno.test('calcJacksonPollock7 - valores altos resultam em gordura maior', () => {
  const baixo = calcJacksonPollock7('MALE', 30, 5, 5, 5, 5, 10, 8, 10);
  const alto = calcJacksonPollock7('MALE', 30, 20, 25, 25, 25, 40, 30, 35);
  assertEquals(alto > baixo, true);
});

// =============================================
// RCQ
// =============================================
Deno.test('calcRcq - cálculo correto', () => {
  assertEquals(calcRcq(90, 101), 0.8911);
});

Deno.test('calcRcq - cintura igual quadril = 1.0', () => {
  assertEquals(calcRcq(100, 100), 1.0);
});

Deno.test('classifyRcq - homem baixo risco', () => {
  assertEquals(classifyRcq('MALE', 0.80), 'Baixo');
});

Deno.test('classifyRcq - homem moderado', () => {
  assertEquals(classifyRcq('MALE', 0.85), 'Moderado');
});

Deno.test('classifyRcq - homem alto', () => {
  assertEquals(classifyRcq('MALE', 0.91), 'Alto');
});

Deno.test('classifyRcq - homem muito alto', () => {
  assertEquals(classifyRcq('MALE', 1.0), 'Muito Alto');
});

Deno.test('classifyRcq - mulher baixo', () => {
  assertEquals(classifyRcq('FEMALE', 0.68), 'Baixo');
});

Deno.test('classifyRcq - mulher muito alto', () => {
  assertEquals(classifyRcq('FEMALE', 0.90), 'Muito Alto');
});

// =============================================
// Age calculation
// =============================================
Deno.test('calcAge - retorna número positivo', () => {
  const age = calcAge('1990-01-01');
  assertEquals(age >= 34 && age <= 40, true);
});

Deno.test('calcAge - data futura retorna valor negativo ou zero', () => {
  const age = calcAge('2099-01-01');
  assertEquals(age <= 0, true);
});

Deno.test('calcAge - véspera do aniversário ainda não completou o ano', () => {
  assertEquals(calcAge('1990-06-15', '2020-06-14'), 29);
  assertEquals(calcAge('1990-06-15', '2020-06-15'), 30);
});

Deno.test('calcAge - virada de ano sem deslocamento de fuso/UTC', () => {
  assertEquals(calcAge('2000-01-01', '2019-12-31'), 19);
  assertEquals(calcAge('2000-01-01', '2020-01-01'), 20);
});

Deno.test('calcAge - avaliação retroativa usa a idade na data da avaliação', () => {
  assertEquals(calcAge('1980-03-10', '2010-03-09'), 29);
  assertEquals(calcAge('1980-03-10', '2010-03-10'), 30);
});
