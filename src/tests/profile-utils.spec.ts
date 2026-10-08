import { describe, it, expect } from 'vitest';
import { diff, METRIC_IMPROVE, refBar, omronLabel, ageAt, anamnesisTags } from '../app/profile-utils';
import { deltaClass } from '../app/assessment-utils';
import { groupPhotoSessions, nearestDate, selectComparePair } from '../app/media-utils';

describe('diff + deltaClass (favorável/desfavorável, não subiu/desceu)', () => {
  it('diff arredonda e devolve null sem um dos lados', () => {
    expect(diff(23.7, 27.1)).toBe(-3.4);
    expect(diff(49.2, 49.3)).toBe(-0.1);
    expect(diff(3, 4, 0)).toBe(-1);
    expect(diff(49.2, null)).toBeNull();
    expect(diff(undefined, 1)).toBeNull();
  });
  it('gordura caiu → favorável (.dn); subiu → desfavorável (.up)', () => {
    expect(deltaClass(diff(23.7, 27.1), METRIC_IMPROVE.fat)).toBe('dn');
    expect(deltaClass(diff(28.3, 26.3), METRIC_IMPROVE.skinfoldFat)).toBe('up');
  });
  it('músculo e massa magra subiram → favorável', () => {
    expect(deltaClass(diff(31.0, 29.6), METRIC_IMPROVE.muscle)).toBe('dn');
    expect(deltaClass(diff(37.5, 35.9), METRIC_IMPROVE.leanMass)).toBe('dn');
    expect(deltaClass(diff(35.0, 35.9), METRIC_IMPROVE.leanMass)).toBe('up');
  });
  it('peso, quadril e braço são neutros; sem variação é neutro', () => {
    expect(deltaClass(diff(49.2, 49.3), METRIC_IMPROVE.weight)).toBe('nt');
    expect(deltaClass(diff(89.0, 87.5), METRIC_IMPROVE.hip)).toBe('nt');
    expect(deltaClass(diff(64.0, 64.0), METRIC_IMPROVE.waist)).toBe('nt');
    expect(deltaClass(diff(64.0, null), METRIC_IMPROVE.waist)).toBe('nt');
  });
  it('cintura, abdômen, RCQ, visceral e dobras: menor é melhor', () => {
    for (const k of ['waist', 'abdomen', 'rcq', 'visceral', 'skinfoldSum', 'fatMass'] as const) {
      expect(deltaClass(diff(10, 11), METRIC_IMPROVE[k])).toBe('dn');
    }
  });
});

describe('refBar (faixa Omron em %)', () => {
  it('gordura feminina 20–39: faixa 21–33 no eixo 0–50', () => {
    expect(refBar('fat', 'FEMALE', 37, 23.7)).toEqual({ left: 42, width: 24, mark: 47.4 });
  });
  it('músculo feminino 20–39: faixa 24,3–30,4', () => {
    expect(refBar('muscle', 'FEMALE', 37, 31.0)).toEqual({ left: 48.6, width: 12.2, mark: 62 });
  });
  it('visceral: normal até 9 no eixo 0–30', () => {
    expect(refBar('visceral', 'MALE', 50, 3)).toEqual({ left: 0, width: 30, mark: 10 });
  });
  it('IMC e RCQ usam a MESMA escala do relatório (omronBand), para o valor cair no mesmo lugar nas duas telas', () => {
    expect(refBar('bmi', 'MALE', 30, 19.2)).toEqual({ left: 17.5, width: 32.5, mark: 21 });
    expect(refBar('rcq', 'FEMALE', 37, 0.72)).toEqual({ left: 0, width: 45, mark: 36.7 });
  });
  it('limites por idade/sexo seguem a tabela Omron; valores fora do eixo são presos a 0–100', () => {
    expect(refBar('fat', 'MALE', 65, 20)!.left).toBe(26);   // [13, 25, 30]
    expect(refBar('fat', 'MALE', 45, 20)!.left).toBe(22);   // [11, 22, 28]
    expect(refBar('fat', 'FEMALE', 19, 20)!.left).toBe(42); // < 20 usa 20–39
    expect(refBar('fat', 'MALE', 30, 80)!.mark).toBe(100);
    expect(refBar('visceral', 'MALE', 30, -1)!.mark).toBe(0);
  });
  it('sem valor → null', () => {
    expect(refBar('fat', 'MALE', 30, null)).toBeNull();
    expect(refBar('fat', 'MALE', 30, NaN)).toBeNull();
  });
});

describe('omronLabel', () => {
  it('classifica pelo sexo e idade', () => {
    expect(omronLabel('fat', 'FEMALE', 37, 23.7)).toBe('normal');
    expect(omronLabel('fat', 'FEMALE', 37, 35)).toBe('alto');
    expect(omronLabel('fat', 'MALE', 25, 7)).toBe('baixo');
    expect(omronLabel('muscle', 'FEMALE', 37, 31.0)).toBe('alto');
    expect(omronLabel('visceral', 'MALE', 30, 3)).toBe('normal');
    expect(omronLabel('visceral', 'MALE', 30, 12)).toBe('alto');
    expect(omronLabel('visceral', 'MALE', 30, 15)).toBe('muito alto');
    expect(omronLabel('bmi', 'MALE', 30, 19.2)).toBe('normal');
    expect(omronLabel('rcq', 'FEMALE', 37, 0.72)).toBe('moderado');
    expect(omronLabel('rcq', 'MALE', 37, 0.80)).toBe('baixo');
    expect(omronLabel('fat', 'MALE', 30, undefined)).toBe('');
  });
});

describe('ageAt / anamnesisTags', () => {
  it('idade em anos completos sem bug de fuso', () => {
    expect(ageAt('1988-11-30', '2026-10-08')).toBe(37);
    expect(ageAt('1988-11-30', '2026-11-30')).toBe(38);
    expect(ageAt('1988-11-30', '2026-11-29')).toBe(37);
    expect(ageAt('', '2026-10-08')).toBeNull();
  });
  it('só as respostas "sim" viram etiqueta', () => {
    expect(anamnesisTags({ cardiac_condition: false, joint_pain: true, chest_pain_during_exercise: false })).toEqual(['Dor articular']);
    expect(anamnesisTags({ cardiac_condition: true, joint_pain: true, chest_pain_during_exercise: true })).toHaveLength(3);
    expect(anamnesisTags(null)).toEqual([]);
  });
});

describe('groupPhotoSessions / nearestDate / selectComparePair', () => {
  const photos = [
    { id: 'a', date: '2026-06-21', category: 'COSTAS' },
    { id: 'b', date: '2026-06-21', category: 'FRENTE' },
    { id: 'c', date: '2026-10-05', category: 'FRENTE' },
    { id: 'd', date: '2026-10-05', category: 'LADO_DIREITO' },
    { id: 'e', date: '2026-03-15', category: 'FRENTE' },
  ];
  const assessments = ['2026-03-14', '2026-06-20', '2026-10-03'];

  it('agrupa por data (recente primeiro) e ordena ângulos dentro da sessão', () => {
    const s = groupPhotoSessions(photos);
    expect(s.map(x => x.date)).toEqual(['2026-10-05', '2026-06-21', '2026-03-15']);
    expect(s[1].photos.map(p => p.id)).toEqual(['b', 'a']);
    expect(groupPhotoSessions([])).toEqual([]);
  });

  it('avaliação mais próxima da sessão', () => {
    expect(nearestDate(assessments, '2026-10-05')).toBe('2026-10-03');
    expect(nearestDate(assessments, '2026-06-21')).toBe('2026-06-20');
    expect(nearestDate([], '2026-06-21')).toBeNull();
  });

  it('par início/recente segue a regra do PDF: recente = avaliação de referência, início = a mais antiga', () => {
    const pair = selectComparePair(photos, assessments, 'FRENTE', '2026-10-03');
    expect(pair.inicio?.id).toBe('e');
    expect(pair.recente?.id).toBe('c');
  });

  it('sem avaliações: mais antiga vs mais recente do ângulo; um só → só recente', () => {
    expect(selectComparePair(photos, [], 'FRENTE', '2026-10-08')).toMatchObject({ inicio: { id: 'e' }, recente: { id: 'c' } });
    expect(selectComparePair(photos, [], 'COSTAS', '2026-10-08')).toEqual({ recente: photos[0] });
    expect(selectComparePair(photos, assessments, 'PERFIL', '2026-10-03')).toEqual({});
  });
});
