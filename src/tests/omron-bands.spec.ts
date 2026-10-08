import { describe, it, expect } from 'vitest';
import { omronBand, omronAgeBandLabel } from '../app/omron-bands';

describe('omronBand', () => {
  it('gordura corporal, mulher 37 anos: faixa normal 21–33 numa escala 0–50 (como no artboard)', () => {
    const b = omronBand('bodyFat', 'FEMALE', 37, 23.7)!;
    expect(b.left).toBe(42);
    expect(b.width).toBe(24);
    expect(b.marker).toBe(47.4);
    expect(b.label).toBe('Normal');
  });

  it('músculo esquelético, mulher 37 anos: 31,0 % fica em "Alto"', () => {
    const b = omronBand('skeletalMuscle', 'FEMALE', 37, 31.0)!;
    expect(b.left).toBe(48.6);
    expect(b.width).toBe(12.2);
    expect(b.marker).toBe(62);
    expect(b.label).toBe('Alto');
  });

  it('gordura visceral: faixa normal até 9 numa escala 0–30', () => {
    const b = omronBand('visceral', 'MALE', 50, 3)!;
    expect(b.left).toBe(0);
    expect(b.width).toBe(30);
    expect(b.marker).toBe(10);
    expect(b.label).toBe('Normal');
  });

  it('IMC: faixa 18,5–25 numa escala 15–35', () => {
    const b = omronBand('bmi', 'FEMALE', 37, 19.2)!;
    expect(b.left).toBe(17.5);
    expect(b.width).toBe(32.5);
    expect(b.marker).toBe(21);
    expect(b.label).toBe('Peso normal');
  });

  it('RCQ: favorável abaixo de "Alto" (0,77 para mulher) numa escala 0,5–1,1', () => {
    const b = omronBand('rcq', 'FEMALE', 37, 0.72)!;
    expect(b.left).toBe(0);
    expect(b.width).toBe(45);
    expect(b.marker).toBe(36.7);
    expect(b.label).toBe('Moderado');
  });

  it('marcador fica dentro de 0–100 mesmo fora da escala', () => {
    expect(omronBand('bodyFat', 'MALE', 30, 70)!.marker).toBe(100);
    expect(omronBand('bmi', 'MALE', 30, 10)!.marker).toBe(0);
  });

  it('valor ausente → null', () => {
    expect(omronBand('bmi', 'MALE', 30, null)).toBeNull();
    expect(omronBand('bmi', 'MALE', 30, undefined)).toBeNull();
    expect(omronBand('bmi', 'MALE', 30, NaN)).toBeNull();
  });
});

describe('omronAgeBandLabel', () => {
  it('monta o texto do cabeçalho', () => {
    expect(omronAgeBandLabel('FEMALE', 37)).toBe('mulher, 20 a 39 anos');
    expect(omronAgeBandLabel('MALE', 45)).toBe('homem, 40 a 59 anos');
    expect(omronAgeBandLabel('MALE', 70)).toBe('homem, 60 anos ou mais');
  });
});
