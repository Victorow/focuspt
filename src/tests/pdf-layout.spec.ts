import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Assessment, Student } from '../app/data';
import type { PdfPhoto } from '../app/pdf-report';
import { TEST_JPEGS } from './pdf-test-photos';

// =====================================================================
// Harness de layout do PDF: intercepta cada doc.text() do jsPDF, calcula a
// caixa delimitadora real do texto (largura via getTextWidth na fonte atual,
// altura pela fonte, respeitando align) e garante que NENHUM texto se
// sobrepõe a outro na mesma página e que tudo fica dentro das margens.
// doc.addImage() também é interceptado: nenhum texto pode cobrir uma foto.
// =====================================================================

interface TextBox {
  page: number;
  text: string;
  x1: number; y1: number; x2: number; y2: number;
  fontSize: number; bold: boolean; x: number; y: number;
}

interface ImageBox { page: number; x1: number; y1: number; x2: number; y2: number }

// Registro global das caixas por documento gerado (o PDF é criado dentro do SUT).
const recorded: { texts: TextBox[]; images: ImageBox[] }[] = [];

vi.mock('jspdf', async (importOriginal) => {
  const mod = await importOriginal<typeof import('jspdf')>();
  const Base = mod.jsPDF;
  class RecordingJsPDF extends (Base as any) {
    constructor(...args: any[]) {
      super(...args);
      const boxes: TextBox[] = [];
      const images: ImageBox[] = [];
      recorded.push({ texts: boxes, images });
      const self = this as any;
      const originalImage = self.addImage.bind(self);
      // addImage(imageData, format, x, y, w, h, ...)
      self.addImage = (...args: any[]) => {
        const [, , x, y, w, h] = args;
        if (typeof x === 'number') {
          images.push({ page: self.getCurrentPageInfo().pageNumber, x1: x, y1: y, x2: x + w, y2: y + h });
        }
        return originalImage(...args);
      };
      const original = self.text.bind(self);
      self.text = (text: string | string[], x: number, y: number, opts?: any, ...rest: any[]) => {
        const fontSize: number = self.getFontSize();
        const fsMm = (fontSize * 25.4) / 72;
        const lineH = fsMm * (self.getLineHeightFactor?.() ?? 1.15);
        const lines = (Array.isArray(text) ? text : [text]).flatMap(t => String(t).split('\n'));
        const page = self.getCurrentPageInfo().pageNumber;
        const bold = String(self.getFont().fontStyle).includes('bold');
        lines.forEach((ln, i) => {
          if (ln.trim() === '') return;
          const w = self.getTextWidth(ln);
          const align = opts?.align ?? 'left';
          const x1 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
          const by = y + i * lineH; // baseline 'alphabetic' (padrão)
          // Helvetica: acentos em maiúsculas sobem ~0.9 em; descendentes ~0.21 em.
          boxes.push({ page, text: ln, x1, x2: x1 + w, y1: by - 0.9 * fsMm, y2: by + 0.21 * fsMm, fontSize, bold, x, y: by });
        });
        return original(text, x, y, opts, ...rest);
      };
    }
  }
  return { ...mod, jsPDF: RecordingJsPDF, default: RecordingJsPDF };
});

const { generateAssessmentPDF } = await import('../app/pdf-report');

// ---------------------------------------------------------------------
// Verificações
// ---------------------------------------------------------------------
const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;
const TOL = 0.2;

function overlaps(a: TextBox, b: TextBox): boolean {
  return a.x1 < b.x2 - TOL && b.x1 < a.x2 - TOL && a.y1 < b.y2 - TOL && b.y1 < a.y2 - TOL;
}

function layoutProblems(boxes: TextBox[], images: ImageBox[] = []): string[] {
  const problems: string[] = [];
  const fmtR = (b: { page: number; x1: number; y1: number; x2: number; y2: number }) =>
    `p${b.page} [${b.x1.toFixed(1)},${b.y1.toFixed(1)}–${b.x2.toFixed(1)},${b.y2.toFixed(1)}]`;
  const fmt = (b: TextBox) => `"${b.text}" ${fmtR(b)}`;
  const inPage = (b: { x1: number; y1: number; x2: number; y2: number }) =>
    b.x1 >= M - TOL && b.x2 <= PAGE_W - M + TOL && b.y1 >= 4 && b.y2 <= PAGE_H - 5;
  for (const b of boxes) {
    if (!inPage(b)) problems.push(`fora da margem: ${fmt(b)}`);
  }
  // Fotos: dentro das margens, acima do rodapé, sem se sobrepor entre si nem a textos.
  const FOOTER_LINE = PAGE_H - 15;
  for (const im of images) {
    if (!inPage(im) || im.y2 > FOOTER_LINE) problems.push(`imagem fora da margem/rodapé: ${fmtR(im)}`);
    for (const b of boxes) {
      if (b.page === im.page && overlaps(b, im as TextBox)) problems.push(`texto sobre imagem: ${fmt(b)} x ${fmtR(im)}`);
    }
  }
  for (let i = 0; i < images.length; i++) {
    for (let j = i + 1; j < images.length; j++) {
      if (images[i].page === images[j].page && overlaps(images[i] as TextBox, images[j] as TextBox)) {
        problems.push(`imagens sobrepostas: ${fmtR(images[i])} x ${fmtR(images[j])}`);
      }
    }
  }
  // Rótulo de ângulo da foto (9pt bold em M) nunca fica órfão: a foto vem logo abaixo, na mesma página.
  for (const t of boxes.filter(b => b.fontSize === 9 && b.bold && Math.abs(b.x - M) < 0.01)) {
    if (!images.some(im => im.page === t.page && im.y1 >= t.y2 && im.y1 - t.y2 < 12)) problems.push(`rótulo de foto órfão: ${fmt(t)}`);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].page === boxes[j].page && overlaps(boxes[i], boxes[j])) {
        problems.push(`sobreposição: ${fmt(boxes[i])} x ${fmt(boxes[j])}`);
      }
    }
  }
  // Título de seção (11pt bold em M+6) nunca fica órfão no fim da página:
  // precisa haver conteúdo abaixo dele na mesma página (excluindo o rodapé).
  const FOOTER_TOP = PAGE_H - 16;
  for (const t of boxes.filter(b => b.fontSize === 11 && b.bold && Math.abs(b.x - (M + 6)) < 0.01)) {
    const below = boxes.some(b => b.page === t.page && b !== t && b.y1 > t.y2 && b.y2 < FOOTER_TOP);
    if (!below) problems.push(`título órfão: ${fmt(t)}`);
  }
  return problems;
}

// ---------------------------------------------------------------------
// Fábricas de dados
// ---------------------------------------------------------------------
let seq = 0;
function makeAssessment(date: string, v: Partial<{
  weight: number; fat: number; muscle: number; lean: number; fatMass: number; bodyAge: number;
  visceral: number; water: number; bmi: number; kcal: number; cir: number; sk: number;
}>, over: Partial<Assessment> = {}): Assessment {
  const c = v.cir ?? 0;
  const s = v.sk ?? 0;
  return {
    id: `a${++seq}`,
    date,
    bmi: v.bmi ?? 19.2,
    bmi_classification: 'Peso normal',
    body_fat_percentage: v.fat ?? 23.7,
    fat_mass_kg: v.fatMass ?? 11.7,
    lean_mass_kg: v.lean ?? 37.5,
    body_fat_classification: 'Normal',
    visceral_risk: 'NORMAL',
    skinfolds_fat_percentage: 24.8,
    skinfolds_sum_mm: 148 + s * 7,
    rcq: 0.72,
    last_menstruation_date: '2026-09-20',
    menstrual_cycle_regular: true,
    bioimpedancias: {
      is_athlete: false,
      weight_kg: v.weight ?? 49.2,
      body_fat_percentage: v.fat ?? 23.7,
      skeletal_muscle_percentage: v.muscle ?? 31.0,
      resting_metabolism_kcal: v.kcal ?? 1150,
      body_age: v.bodyAge ?? 23,
      visceral_fat_level: v.visceral ?? 3,
      water_percentage: v.water ?? 27.1,
      fat_mass_kg: v.fatMass ?? 11.7,
      lean_mass_kg: v.lean ?? 37.5,
    },
    dobras_cutaneas: {
      protocol: '7_dobras',
      triceps_mm: 16 + s, biceps_mm: 17 + s, subscapular_mm: 23 + s, chest_mm: 10 + s,
      midaxillary_mm: 24 + s, suprailiac_mm: 24 + s, abdominal_mm: 22 + s, mid_thigh_mm: 29 + s, calf_mm: 16 + s,
    },
    circunferencias: {
      neck_cm: 30 + c, shoulder_cm: 93.5 + c, chest_cm: 81 + c, waist_cm: 64 + c, abdomen_cm: 71.5 + c, hip_cm: 89 + c,
      bust_cm: 81.1 + c,
      right_arm_relaxed_cm: 24 + c, left_arm_relaxed_cm: 23.5 + c, right_arm_flexed_cm: 25.5 + c, left_arm_flexed_cm: 25 + c,
      right_forearm_cm: 21 + c, left_forearm_cm: 20.5 + c,
      right_thigh_proximal_cm: 52 + c, left_thigh_proximal_cm: 51.5 + c,
      right_thigh_medial_cm: 47 + c, left_thigh_medial_cm: 46.5 + c,
      right_thigh_distal_cm: 38 + c, left_thigh_distal_cm: 37.5 + c,
      right_calf_cm: 33 + c, left_calf_cm: 32.5 + c,
    },
    ...over,
  };
}

function makeStudent(over: Partial<Student>, avaliacoes: Assessment[]): Student {
  return {
    id: 's1',
    name: 'Stefane Barbosa Freitas',
    birth_date: '1988-11-30',
    gender: 'FEMALE',
    height_cm: 160,
    goal: 'Emagrecimento com ganho de massa muscular, melhora do condicionamento e da postura',
    phone_number: '(11) 98765-4321',
    lgpd_consent_status: 'ACCEPTED',
    created_at: '2026-06-01',
    anamneses: {
      cardiac_condition: false,
      joint_pain: true,
      chest_pain_during_exercise: false,
      recent_surgery_description: 'Cirurgia de joelho (menisco medial) em 2024, liberada pelo ortopedista para treino resistido',
      active_medications: 'Anticoncepcional oral contínuo, vitamina D 2000 UI diária e suplemento de ferro quinzenal',
      notes: 'Relata dor lombar ocasional após longos períodos sentada. Prefere treinar pela manhã. Histórico de corrida amadora.',
    },
    avaliacoes,
    fotos: [],
    ...over,
  };
}

function photoPair(category: string, start: string, recent: string, d1 = '2026-06-21', d2 = '2026-10-05'): PdfPhoto[] {
  return [{ category, date: d1, dataUrl: start }, { category, date: d2, dataUrl: recent }];
}

function realisticCase() {
  const prev = makeAssessment('2026-06-20', { weight: 49.3, fat: 27.1, muscle: 29.6, lean: 35.9, fatMass: 13.4, bodyAge: 30, visceral: 4, water: 55.1, bmi: 19.3, cir: 1, sk: 2 },
    { menstrual_cycle_regular: false, last_menstruation_date: '2026-06-02' });
  const cur = makeAssessment('2026-10-03', { weight: 49.2, fat: 23.7, muscle: 31.0, lean: 37.5, fatMass: 11.7, bodyAge: 23, visceral: 3, water: 27.1 });
  const student = makeStudent({}, [prev, cur]);
  return {
    student, assessment: cur, previous: prev, trainerName: 'Alexandre Personal',
    generatedAt: new Date(2026, 9, 7, 10, 30),
    observacoes: 'Ótima evolução no período: redução de 3,4 pontos percentuais de gordura com manutenção do peso.\n\nManter treino 4x/semana e ajustar ingestão proteica.',
    // fotos tiradas dias depois de cada avaliação (Início x Recente nos 4 ângulos)
    photos: [
      ...photoPair('FRENTE', TEST_JPEGS['azul'], TEST_JPEGS['verde']),
      ...photoPair('LADO_DIREITO', TEST_JPEGS['laranja'], TEST_JPEGS['cinza']),
      ...photoPair('LADO_ESQUERDO', TEST_JPEGS['vermelho'], TEST_JPEGS['azul']),
      ...photoPair('COSTAS', TEST_JPEGS['verde'], TEST_JPEGS['laranja']),
    ] as PdfPhoto[],
  };
}

function stressCase() {
  const long = 'Texto extremamente longo sem fim '.repeat(12);
  const dates = ['2025-01-05', '2025-02-10', '2025-03-15', '2025-04-20', '2025-05-25', '2025-06-30', '2025-08-04', '2025-09-08', '2025-10-13', '2025-11-17'];
  const avs = dates.map((d, i) => makeAssessment(d, {
    weight: 1234.5 - i * 0.01, // faixa minúscula com 4 dígitos
    fat: i % 2 ? 5 : 95,         // faixa enorme
    muscle: 1000 + i * 1111, lean: 9999.9 - i * 900, fatMass: 1500 - i * 140,
    bodyAge: 99 - i, visceral: 30 - i, water: 9999.9, bmi: 1234.5, kcal: 99999, cir: 1000 - i * 50, sk: 999 - i * 90,
  }, {
    bmi_classification: 'Obesidade grau III (mórbida) com classificação extremamente longa',
    body_fat_classification: 'Muito acima do recomendado para a faixa etária e sexo',
    visceral_risk: 'VERY_HIGH',
    rcq: 12.34,
    skinfolds_sum_mm: 9999.9,
    skinfolds_fat_percentage: 99.9,
    dobras_cutaneas: {
      protocol: '3_dobras_masc', triceps_mm: 1234.5, biceps_mm: null, subscapular_mm: 999.9, chest_mm: 1000, midaxillary_mm: 2000,
      suprailiac_mm: 3000, abdominal_mm: 4000, mid_thigh_mm: 5000, calf_mm: null,
    },
  }));
  // valores opcionais ausentes na última avaliação
  const last = avs[avs.length - 1];
  last.bioimpedancias.water_percentage = undefined;
  last.circunferencias.right_calf_cm = undefined;
  last.circunferencias.left_forearm_cm = undefined;
  const student = makeStudent({
    name: 'Maria Aparecida dos Santos Nascimento Albuquerque de Oliveira e Silva Pereira Júnior',
    goal: long,
    phone_number: '+55 (11) 98765-4321 ramal 12345',
    lgpd_consent_status: 'PENDING',
    anamneses: {
      cardiac_condition: true, joint_pain: true, chest_pain_during_exercise: true,
      recent_surgery_description: long,
      active_medications: 'Losartana, Metformina, Sinvastatina, Levotiroxina, Omeprazol, ' + long + ' ' + 'Palavragigantesemespacos'.repeat(10),
      notes: (long + '\n').repeat(8),
    },
  }, avs);
  return {
    student, assessment: last, previous: avs[avs.length - 2],
    trainerName: 'Alexandre Personal Trainer Especialista em Emagrecimento e Hipertrofia de Alto Rendimento CREF 123456-G/SP',
    generatedAt: new Date(2026, 9, 7, 10, 30),
    observacoes: (long + '\n\n').repeat(10),
    photos: [
      ...photoPair('FRENTE', TEST_JPEGS['azul'], TEST_JPEGS['verde'], '2025-01-07', '2025-11-18'),
      { category: 'LADO_DIREITO', date: '2025-01-06', dataUrl: TEST_JPEGS['laranja'] }, // só Início → layout único
      { category: 'COSTAS', date: '2025-11-19', dataUrl: TEST_JPEGS['cinza'] },         // só Recente → layout único
      ...photoPair('PERFIL', TEST_JPEGS['vermelho'], TEST_JPEGS['azul'], '2025-02-11', '2025-11-17'),
    ] as PdfPhoto[],
  };
}

function singleCase() {
  const cur = makeAssessment('2026-10-03', { weight: 72.4, fat: 18.2 }, { menstrual_cycle_regular: null, last_menstruation_date: null });
  const student = makeStudent({ name: 'João Silva', gender: 'MALE', anamneses: null, phone_number: undefined }, [cur]);
  return { student, assessment: cur, previous: null, trainerName: 'Ana', generatedAt: new Date(2026, 9, 7, 10, 30), observacoes: null };
}

const OUT = process.env['PDF_OUT']
  ? 'C:/Users/Victor/AppData/Local/Temp/claude/c--Users-Victor-Projetos-Alexandre/b829dacb-3203-4b53-a261-7165e3c3fdf6/scratchpad/pdf'
  : null;

describe('layout do PDF — nenhum texto sobreposto', () => {
  // [nome, dados, nº de fotos esperadas no PDF]
  const cases: [string, () => any, number][] = [
    ['realista', realisticCase, 8],
    ['estresse', stressCase, 6],
    ['avaliacao-unica', singleCase, 0],
  ];
  for (const [name, build, expectedImages] of cases) {
    it(`caso ${name}: sem sobreposição, dentro das margens, sem título órfão`, () => {
      const before = recorded.length;
      const doc = generateAssessmentPDF(build());
      expect(recorded.length).toBe(before + 1);
      const { texts: boxes, images } = recorded[recorded.length - 1];
      expect(boxes.length).toBeGreaterThan(50);
      if (OUT) {
        fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(path.join(OUT, `${name}.pdf`), Buffer.from(doc.output('arraybuffer')));
      }
      expect(layoutProblems(boxes, images)).toEqual([]);
      const photos = (build().photos ?? []) as PdfPhoto[];
      if (photos.length) {
        // todas as fotos do caso viram imagens; os rótulos esperados aparecem
        expect(images.length).toBe(expectedImages);
        // fotos de teste são 300x450: desenhadas sem distorção (proporção 2:3)
        for (const im of images) expect((im.x2 - im.x1) / (im.y2 - im.y1)).toBeCloseTo(300 / 450, 3);
        const texts = boxes.map(b => b.text);
        expect(texts).toContain('Frente');
        expect(texts).toContain('Início');
        expect(texts).toContain('Recente');
      }
    });
  }

  it('o verificador detecta texto sobre imagem e rótulo de foto órfão (sanidade)', () => {
    const img: ImageBox = { page: 2, x1: 20, y1: 40, x2: 100, y2: 140 };
    const txt: TextBox = { page: 2, text: '01/01/2026', x1: 50, y1: 135, x2: 65, y2: 138, fontSize: 7.5, bold: false, x: 50, y: 137 };
    expect(layoutProblems([txt], [img]).some(p => p.startsWith('texto sobre imagem'))).toBe(true);
    const label: TextBox = { page: 3, text: 'Frente', x1: M, y1: 270, x2: M + 10, y2: 273, fontSize: 9, bold: true, x: M, y: 272 };
    expect(layoutProblems([label], [img]).some(p => p.startsWith('rótulo de foto órfão'))).toBe(true);
  });

  it('o verificador detecta sobreposição (sanidade)', () => {
    const a: TextBox = { page: 1, text: 'a', x1: 0, y1: 0, x2: 10, y2: 3, fontSize: 8, bold: false, x: 0, y: 0 };
    expect(overlaps(a, { ...a, x1: 5, x2: 15 })).toBe(true);
    expect(overlaps(a, { ...a, x1: 10, x2: 15 })).toBe(false);
    expect(overlaps(a, { ...a, page: 1, y1: 3.1, y2: 6 })).toBe(false);
  });
});
