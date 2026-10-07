import { jsPDF } from 'jspdf';
import { Student, Assessment } from './data';
import { getLgpdStatusLabel } from './lgpd-utils';

// =====================================================================
// FUNÇÕES PURAS (testáveis sem DOM) — formatação e classificação
// =====================================================================

/** Formata número com N casas; retorna '—' para null/undefined/NaN. */
export function pdfFormatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

/** Converte 'YYYY-MM-DD' → 'DD/MM/YYYY' sem bug de fuso horário. */
export function pdfFormatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(dateStr);
  return Number.isNaN(dt.getTime())
    ? '—'
    : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** 'YYYY-MM-DD' → 'DD/MM' (rótulos de gráfico). */
export function pdfShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  return m ? `${m[3]}/${m[2]}` : '—';
}

/** Extrai {y, m, d} de 'YYYY-MM-DD' (string) ou dos campos LOCAIS de um Date — sem conversão UTC. */
function pdfYmd(value: string | Date): { y: number; m: number; d: number } | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? { y: +match[1], m: +match[2], d: +match[3] } : null;
}

/**
 * Idade em anos na data de referência (ex: data da avaliação).
 * Lê Y/M/D direto da string para evitar o bug de fuso (new Date('YYYY-MM-DD') é UTC → dia anterior no Brasil).
 */
export function pdfAgeFromBirth(birthDate: string, ref: string | Date): number {
  const b = pdfYmd(birthDate);
  const r = pdfYmd(ref);
  if (!b || !r) return NaN;
  let age = r.y - b.y;
  if (r.m < b.m || (r.m === b.m && r.d < b.d)) age--;
  return age;
}

/** Date → 'DD/MM/YYYY' usando campos locais (toISOString() vira o dia seguinte após 21h no Brasil). */
export function pdfFormatLocalDate(dt: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(dt.getDate())}/${p2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

/** Mantém só itens com data (YYYY-MM-DD) <= referência — o relatório não mostra o "futuro" da avaliação exportada. */
export function pdfUpToDate<T extends { date: string }>(items: T[], refDate: string | null | undefined): T[] {
  if (!refDate) return [...items];
  const ref = refDate.slice(0, 10);
  return items.filter(i => (i.date ?? '').slice(0, 10) <= ref);
}

/** 'YYYY-MM-DD' → número do dia (dias desde a época), sem parse UTC de string; null se inválida. */
function pdfDayNumber(dateStr: string | null | undefined): number | null {
  const p = pdfYmd(dateStr ?? '');
  return p ? Date.UTC(p.y, p.m - 1, p.d) / 86_400_000 : null;
}

/**
 * Seleciona as fotos do comparativo por ângulo ("fotos do mês correspondente").
 * As fotos não têm avaliacao_id e costumam ser tiradas dias DEPOIS da avaliação, então cada foto é
 * atribuída à avaliação de data mais próxima (empate → a anterior). Sem avaliações → a exportada.
 * - recente: foto atribuída à avaliação exportada (mais próxima de refDate; empate → a mais nova).
 * - inicio: foto mais antiga atribuída a uma avaliação ANTERIOR à exportada.
 * Fotos atribuídas a avaliações posteriores são ignoradas. Ângulos sem foto não entram no Map.
 */
export function pdfSelectPhotos<T extends { category: string; date: string }>(
  photos: T[],
  assessmentDates: string[],
  refDate: string,
): Map<string, { inicio?: T; recente?: T }> {
  const result = new Map<string, { inicio?: T; recente?: T }>();
  const refDay = pdfDayNumber(refDate);
  if (refDay === null) return result;

  const days = new Set<number>([refDay]);
  for (const d of assessmentDates) {
    const n = pdfDayNumber(d);
    if (n !== null) days.add(n);
  }
  const sortedDays = [...days].sort((x, y) => x - y);

  for (const photo of photos) {
    const pd = pdfDayNumber(photo.date);
    if (pd === null) continue;
    // Avaliação mais próxima; percorre em ordem crescente e só troca se for estritamente mais perto (empate → anterior)
    let assigned = sortedDays[0];
    for (const d of sortedDays) {
      if (Math.abs(pd - d) < Math.abs(pd - assigned)) assigned = d;
    }
    if (assigned > refDay) continue;

    const entry = result.get(photo.category) ?? {};
    if (assigned === refDay) {
      const cur = entry.recente ? pdfDayNumber(entry.recente.date)! : null;
      const better = cur === null
        || Math.abs(pd - refDay) < Math.abs(cur - refDay)
        || (Math.abs(pd - refDay) === Math.abs(cur - refDay) && pd > cur);
      if (better) entry.recente = photo;
    } else {
      const cur = entry.inicio ? pdfDayNumber(entry.inicio.date)! : null;
      if (cur === null || pd < cur) entry.inicio = photo;
    }
    result.set(photo.category, entry);
  }
  return result;
}

export function pdfGenderLabel(g: 'MALE' | 'FEMALE'): string {
  return g === 'MALE' ? 'Masculino' : 'Feminino';
}

export function pdfVisceralLabel(risk: 'NORMAL' | 'HIGH' | 'VERY_HIGH'): string {
  if (risk === 'NORMAL') return 'Normal';
  if (risk === 'HIGH') return 'Alto';
  return 'Muito Alto';
}

/** Sim/Não/— para booleanos possivelmente ausentes. */
export function pdfBoolLabel(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value ? 'Sim' : 'Não';
}

/** Texto não vazio ou '—'. */
export function pdfText(value: string | null | undefined): string {
  const t = (value ?? '').trim();
  return t.length ? t : '—';
}

/** Nome legível do protocolo de dobras. */
export function pdfProtocolLabel(protocol: string | null | undefined): string {
  if (!protocol) return '—';
  const map: Record<string, string> = {
    '7_dobras': '7 Dobras (Jackson & Pollock)',
    '3_dobras_masc': '3 Dobras Masc. (Jackson & Pollock)',
    '3_dobras_fem': '3 Dobras Fem. (Jackson & Pollock)',
  };
  return map[protocol] ?? protocol;
}

export type DeltaDir = 'up' | 'down' | 'flat';

export interface DeltaInfo {
  text: string;       // ex: "+1.2" / "-0.5" / "—"
  dir: DeltaDir;      // direção numérica
}

/** Calcula a variação atual − anterior. */
export function pdfDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  digits = 1,
): DeltaInfo {
  if (
    current === null || current === undefined || Number.isNaN(current) ||
    previous === null || previous === undefined || Number.isNaN(previous)
  ) {
    return { text: '—', dir: 'flat' };
  }
  const diff = current - previous;
  const rounded = Number(diff.toFixed(digits));
  if (rounded === 0) return { text: '0', dir: 'flat' };
  const sign = rounded > 0 ? '+' : '';
  return { text: `${sign}${rounded.toFixed(digits)}`, dir: rounded > 0 ? 'up' : 'down' };
}

/** Sentido de melhora de um indicador: 'down' = menor é melhor; 'up' = maior é melhor; 'neutral' = sem juízo. */
export type ImproveDir = 'up' | 'down' | 'neutral';

/** Tom da variação conforme o sentido de melhora (neutral quando não há juízo ou não houve variação). */
export function pdfDeltaTone(delta: DeltaInfo | undefined, improve: ImproveDir | undefined): 'good' | 'bad' | 'neutral' {
  if (!delta || delta.text === '—' || delta.dir === 'flat') return 'neutral';
  if (!improve || improve === 'neutral') return 'neutral';
  return delta.dir === improve ? 'good' : 'bad';
}

// =====================================================================
// GERAÇÃO DO PDF (usa jsPDF — vetorial, layout próprio)
// =====================================================================

export interface PdfPhoto {
  category: string;
  date: string;
  dataUrl: string;
}

export interface AssessmentPdfData {
  student: Student;
  assessment: Assessment;
  previous: Assessment | null;
  trainerName: string;
  generatedAt: Date;
  photos?: PdfPhoto[];
  observacoes?: string | null;
}

// Paleta (documento claro, profissional)
const C = {
  primary: [37, 99, 235] as [number, number, number],
  primaryDark: [30, 58, 138] as [number, number, number],
  ink: [30, 41, 59] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  faint: [148, 163, 184] as [number, number, number],
  line: [226, 232, 240] as [number, number, number],
  zebra: [248, 250, 252] as [number, number, number],
  cardBg: [241, 245, 249] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  amber: [217, 119, 6] as [number, number, number],
  grayBar: [148, 163, 184] as [number, number, number],
};

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;
const CONTENT_W = PAGE_W - M * 2;
const FOOTER_Y = PAGE_H - 12;
const BOTTOM_LIMIT = PAGE_H - 18;

export function generateAssessmentPDF(data: AssessmentPdfData): jsPDF {
  const { student, assessment: a, previous: prev, trainerName, generatedAt } = data;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let y = 0;

  const setFill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

  // Trunca texto por largura real (mm), com reticências.
  const truncate = (text: string, maxW: number): string => {
    if (doc.getTextWidth(text) <= maxW) return text;
    let t = text;
    while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1);
    return t + '…';
  };

  // Reduz a fonte (até minSize) para o texto caber em maxW; retorna o tamanho aplicado.
  const fitFontSize = (text: string, maxW: number, size: number, minSize: number): number => {
    doc.setFontSize(size);
    while (size > minSize && doc.getTextWidth(text) > maxW) doc.setFontSize(size = Math.max(minSize, size - 0.5));
    return size;
  };

  const runningHeader = () => {
    setText(C.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('FocusPT', M, M);
    setText(C.faint);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(truncate(student.name, 90), PAGE_W - M, M, { align: 'right' });
    setDraw(C.line);
    doc.setLineWidth(0.3);
    doc.line(M, M + 2, PAGE_W - M, M + 2);
    y = M + 8;
  };

  const ensure = (needed: number) => {
    if (y + needed > BOTTOM_LIMIT) {
      doc.addPage();
      y = M + 4;
      runningHeader();
    }
  };

  const mainHeader = () => {
    setFill(C.primaryDark);
    doc.rect(0, 0, PAGE_W, 32, 'F');
    setFill(C.primary);
    doc.rect(0, 30, PAGE_W, 2, 'F');

    setText(C.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('FocusPT', M, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText([191, 219, 254]);
    doc.text('Gestão de Avaliação Física', M, 21);

    setText(C.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('RELATÓRIO DE AVALIAÇÃO FÍSICA', PAGE_W - M, 14, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText([191, 219, 254]);
    doc.text(`Emitido em ${pdfFormatLocalDate(generatedAt)}`, PAGE_W - M, 20, { align: 'right' });

    y = 42;
  };

  // keepWith: altura do primeiro bloco de conteúdo — o título nunca fica órfão no fim da página.
  const sectionTitle = (label: string, keepWith = 10) => {
    ensure(14 + keepWith);
    setFill(C.primary);
    doc.rect(M, y, 3, 6, 'F');
    setText(C.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(label.toUpperCase(), M + 6, y + 5);
    setDraw(C.line);
    doc.setLineWidth(0.3);
    doc.line(M, y + 8.5, PAGE_W - M, y + 8.5);
    y += 14;
  };

  // ======================= PÁGINA 1 — CABEÇALHO =======================
  mainHeader();

  // ---- bloco de dados do aluno (3 linhas, sem sobreposição) ----
  const age = pdfAgeFromBirth(student.birth_date, a.date); // idade na data da avaliação
  const blockH = 38;
  setFill(C.cardBg);
  doc.roundedRect(M, y, CONTENT_W, blockH, 2, 2, 'F');

  const colW = CONTENT_W / 4;
  const infoCell = (col: number, row: number, label: string, value: string, span = 1) => {
    const cx = M + 5 + col * colW;
    const cy = y + 8 + row * 11;
    const maxW = colW * span - 8; // não invade a coluna seguinte
    setText(C.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(truncate(label.toUpperCase(), maxW), cx, cy);
    setText(C.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(truncate(value, maxW), cx, cy + 5);
  };
  infoCell(0, 0, 'Aluno', pdfText(student.name));
  infoCell(1, 0, 'Idade', `${age} anos`);
  infoCell(2, 0, 'Sexo', pdfGenderLabel(student.gender));
  infoCell(3, 0, 'Altura', `${pdfFormatNumber(student.height_cm, 0)} cm`);
  infoCell(0, 1, 'Nascimento', pdfFormatDate(student.birth_date));
  infoCell(1, 1, 'Data da Avaliação', pdfFormatDate(a.date));
  infoCell(2, 1, 'Avaliação Anterior', prev ? pdfFormatDate(prev.date) : '—');
  infoCell(3, 1, 'Telefone', pdfText(student.phone_number));
  infoCell(0, 2, 'Objetivo', pdfText(student.goal), 2); // ocupa as colunas 0–1 (a 1 está livre)
  infoCell(2, 2, 'Status LGPD', getLgpdStatusLabel(student.lgpd_consent_status), 2);
  y += blockH + 6;

  // ---- cards de indicadores principais ----
  const cardGap = 4;
  const cardW = (CONTENT_W - cardGap * 2) / 3;
  const cardH = 24;

  sectionTitle('Indicadores Principais', cardH * 2 + cardGap);

  interface MetricCard {
    label: string; value: string; unit: string;
    sub?: string; delta?: DeltaInfo; improve?: ImproveDir;
  }

  const toneColor = (t: 'good' | 'bad' | 'neutral') => (t === 'good' ? C.green : t === 'bad' ? C.red : C.muted);

  const drawCard = (idx: number, m: MetricCard) => {
    const row = Math.floor(idx / 3);
    const col = idx % 3;
    const cx = M + col * (cardW + cardGap);
    const cy = y + row * (cardH + cardGap);

    setFill(C.white);
    setDraw(C.line);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, cy, cardW, cardH, 2, 2, 'FD');
    setFill(C.primary);
    doc.rect(cx, cy, 1.5, cardH, 'F');

    setText(C.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    const innerW = cardW - 9; // área útil do card (após a faixa colorida e padding)
    doc.text(truncate(m.label.toUpperCase(), innerW), cx + 5, cy + 6);

    // Mede a unidade na fonte DELA e o valor na fonte DELE (antes media o valor
    // já com a fonte 8pt da unidade → unidade desenhada em cima do número).
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const unitW = m.unit ? doc.getTextWidth(m.unit) + 1.5 : 0;
    setText(C.ink);
    doc.setFont('helvetica', 'bold');
    let valueSize = 16;
    doc.setFontSize(valueSize);
    while (valueSize > 9 && doc.getTextWidth(m.value) + unitW > innerW) doc.setFontSize(--valueSize);
    const valueTxt = truncate(m.value, innerW - unitW);
    const vw = doc.getTextWidth(valueTxt);
    doc.text(valueTxt, cx + 5, cy + 14);
    if (m.unit) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setText(C.faint);
      doc.text(m.unit, cx + 5 + vw + 1.5, cy + 14);
    }

    // Variação tem prioridade de espaço; a classificação é truncada no que sobra.
    const showDelta = !!m.delta && m.delta.text !== '—' && m.delta.dir !== 'flat';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    const deltaTxt = showDelta ? truncate(m.delta!.text, innerW) : '';
    const deltaW = showDelta ? doc.getTextWidth(deltaTxt) : 0;
    let subX = cx + 5;
    if (m.sub) {
      setText(C.muted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const subMax = innerW - (showDelta ? deltaW + 3 : 0);
      if (subMax > 4) {
        const subTxt = truncate(m.sub, subMax);
        doc.text(subTxt, subX, cy + 20);
        subX += doc.getTextWidth(subTxt) + 3;
      }
    }
    if (showDelta) {
      setText(toneColor(pdfDeltaTone(m.delta, m.improve)));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(deltaTxt, subX, cy + 20);
    }
  };

  const bio = a.bioimpedancias;
  const pbio = prev?.bioimpedancias;
  const cards: MetricCard[] = [
    { label: 'Peso', value: pdfFormatNumber(bio?.weight_kg), unit: 'kg', delta: pdfDelta(bio?.weight_kg, pbio?.weight_kg), improve: 'neutral' },
    { label: 'IMC', value: pdfFormatNumber(a.bmi), unit: '', sub: pdfText(a.bmi_classification), delta: pdfDelta(a.bmi, prev?.bmi), improve: 'neutral' },
    { label: '% Gordura (bioimp.)', value: pdfFormatNumber(a.body_fat_percentage), unit: '%', sub: pdfText(a.body_fat_classification), delta: pdfDelta(a.body_fat_percentage, prev?.body_fat_percentage), improve: 'down' },
    { label: 'Massa Magra', value: pdfFormatNumber(a.lean_mass_kg), unit: 'kg', delta: pdfDelta(a.lean_mass_kg, prev?.lean_mass_kg), improve: 'up' },
    { label: 'Idade Corporal', value: pdfFormatNumber(bio?.body_age, 0), unit: 'anos', delta: pdfDelta(bio?.body_age, pbio?.body_age, 0), improve: 'down' },
    { label: 'Gordura Visceral', value: pdfFormatNumber(bio?.visceral_fat_level, 0), unit: '', sub: pdfVisceralLabel(a.visceral_risk), delta: pdfDelta(bio?.visceral_fat_level, pbio?.visceral_fat_level, 0), improve: 'down' },
  ];
  cards.forEach((m, i) => drawCard(i, m));
  y += cardH * 2 + cardGap + 8;

  // =================== GRÁFICOS ===================

  // -- gráfico de barras comparativo (Atual vs Anterior) --
  const drawBarChart = (
    x: number, gy: number, w: number, h: number,
    title: string,
    groups: { label: string; cur: number | null | undefined; prev: number | null | undefined }[],
  ) => {
    setFill(C.white); setDraw(C.line); doc.setLineWidth(0.3);
    doc.roundedRect(x, gy, w, h, 2, 2, 'FD');
    const lx = x + w - 48;
    setText(C.ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    doc.text(truncate(title, lx - x - 8), x + 4, gy + 6);

    // legenda
    setFill(C.grayBar); doc.rect(lx, gy + 3, 3, 3, 'F');
    setText(C.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    doc.text('Anterior', lx + 4, gy + 5.5);
    setFill(C.primary); doc.rect(lx + 24, gy + 3, 3, 3, 'F');
    doc.text('Atual', lx + 28, gy + 5.5);

    const padL = 5, padR = 5, padT = 11, padB = 10;
    const px = x + padL, py = gy + padT, pw = w - padL - padR, ph = h - padT - padB;
    const n = groups.length;
    const groupW = pw / n;

    setDraw(C.line); doc.setLineWidth(0.3);
    doc.line(px, py + ph, px + pw, py + ph); // base

    groups.forEach((g, i) => {
      const gx = px + i * groupW;
      const cur = (g.cur ?? null);
      const prv = (g.prev ?? null);
      const localMax = Math.max(cur ?? 0, prv ?? 0, 0.0001);
      const barW = groupW * 0.26;
      const cluster = barW * 2 + 2;
      const startX = gx + (groupW - cluster) / 2;

      const drawBar = (bx: number, val: number | null, color: [number, number, number]) => {
        if (val === null || Number.isNaN(val)) {
          setText(C.faint); doc.setFont('helvetica', 'normal'); doc.setFontSize(6);
          doc.text('—', bx + barW / 2, py + ph - 1, { align: 'center' });
          return;
        }
        const bh = Math.max((val / localMax) * (ph - 4), 0.5);
        setFill(color);
        doc.rect(bx, py + ph - bh, barW, bh, 'F');
        setText(C.ink); doc.setFont('helvetica', 'bold');
        // rótulo cabe na largura da barra + metade do vão (não encosta no vizinho)
        const valTxt = val.toFixed(1);
        fitFontSize(valTxt, barW + 1.4, 6, 4);
        doc.text(truncate(valTxt, barW + 1.4), bx + barW / 2, py + ph - bh - 1.2, { align: 'center' });
      };
      drawBar(startX, prv, C.grayBar);
      drawBar(startX + barW + 2, cur, C.primary);

      setText(C.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
      doc.text(truncate(g.label, groupW - 1), gx + groupW / 2, py + ph + 5, { align: 'center' });
    });
  };

  // -- gráfico de linha (evolução histórica) --
  const drawLineChart = (
    x: number, gy: number, w: number, h: number,
    title: string, unit: string,
    points: { label: string; v: number }[],
    color: [number, number, number],
  ) => {
    setFill(C.white); setDraw(C.line); doc.setLineWidth(0.3);
    doc.roundedRect(x, gy, w, h, 2, 2, 'FD');
    // unidade vai no título (antes ficava no rodapé do gráfico, em cima das datas)
    const fullTitle = unit && !title.includes(unit) ? `${title} (${unit})` : title;
    setText(C.ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    doc.text(truncate(fullTitle, w - 8), x + 4, gy + 6);

    if (points.length === 0) {
      setText(C.faint); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
      doc.text('Sem dados disponíveis', x + w / 2, gy + h / 2, { align: 'center' });
      return;
    }

    // Escala "bonita": faixa mínima (evita eixo degenerado com valores quase iguais,
    // que gerava ticks repetidos tipo 49.3/49.3/49.2) e passo 1/2/2.5/5 × 10^k.
    const vals = points.map(p => p.v);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const minSpan = Math.max(Math.abs(hi) * 0.02, 1);
    if (hi - lo < minSpan) { const mid = (lo + hi) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
    const rawStep = (hi - lo) / 2;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const f = rawStep / mag;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
    const t0 = Math.floor(lo / step + 1e-9) * step;
    const t1 = Math.ceil(hi / step - 1e-9) * step;
    const range = t1 - t0;
    let dec = 0;
    while (dec < 3 && Math.abs(step * 10 ** dec - Math.round(step * 10 ** dec)) > 1e-6) dec++;
    const ticks: number[] = [];
    for (let t = t0; t <= t1 + step / 2; t += step) ticks.push(t);

    // margem esquerda conforme a largura real dos rótulos do eixo Y
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6);
    const tickW = Math.max(...ticks.map(t => doc.getTextWidth(t.toFixed(dec))));
    const padL = Math.max(8, tickW + 4), padR = 4, padT = 12, padB = 11;
    const px = x + padL, py = gy + padT, pw = w - padL - padR, ph = h - padT - padB;
    const inset = 4; // pontos afastados das bordas do plot (rótulos não invadem o eixo Y)

    // gridlines + labels Y
    setDraw(C.line); doc.setLineWidth(0.2);
    setText(C.faint);
    ticks.forEach((t, k) => {
      const yy = py + ph - (ph * k) / (ticks.length - 1);
      doc.line(px, yy, px + pw, yy);
      doc.text(t.toFixed(dec), px - 1.5, yy + 0.8, { align: 'right' });
    });

    const n = points.length;
    const xat = (i: number) => (n === 1 ? px + pw / 2 : px + inset + ((pw - inset * 2) * i) / (n - 1));
    const yat = (v: number) => py + ph - ((v - t0) / range) * ph;

    // linha
    setDraw(color); doc.setLineWidth(0.7);
    for (let i = 1; i < n; i++) {
      doc.line(xat(i - 1), yat(points[i - 1].v), xat(i), yat(points[i].v));
    }
    points.forEach((p, i) => { setFill(color); doc.circle(xat(i), yat(p.v), 1, 'F'); });

    // Rótulos sem colisão: prioridade ao último e ao primeiro ponto; cada rótulo
    // tenta acima do ponto (abaixo, se for um "vale"), depois o outro lado; não
    // cobre outros rótulos nem marcadores; se nenhum lado couber, é omitido.
    type Box = { x1: number; y1: number; x2: number; y2: number };
    const placed: Box[] = [];
    const markers: Box[] = points.map((p, i) => ({ x1: xat(i) - 1, x2: xat(i) + 1, y1: yat(p.v) - 1, y2: yat(p.v) + 1 }));
    const hits = (b: Box) =>
      placed.some(o => b.x1 < o.x2 + 1 && o.x1 < b.x2 + 1 && b.y1 < o.y2 + 0.3 && o.y1 < b.y2 + 0.3) ||
      markers.some(o => b.x1 < o.x2 && o.x1 < b.x2 && b.y1 < o.y2 && o.y1 < b.y2);
    const order = [n - 1, 0, ...points.map((_, i) => i).slice(1, -1)].filter((v, i, arr) => arr.indexOf(v) === i);
    const fsMm = (size: number) => (size * 25.4) / 72;
    const valH = fsMm(6);
    const dateBase = py + ph + 7;
    const bandTop = gy + 8, bandBottom = dateBase - fsMm(5.8) * 0.9 - 0.6; // abaixo do título, acima das datas
    const valLabels: { txt: string; cx: number; base: number; b: Box }[] = [];
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6);
    for (const i of order) {
      const txt = points[i].v.toFixed(1);
      const tw = doc.getTextWidth(txt);
      const cx = Math.min(Math.max(xat(i), px + 0.5 + tw / 2), px + pw - tw / 2);
      const yp = yat(points[i].v);
      const nb = [points[i - 1]?.v, points[i + 1]?.v].filter((v): v is number => v !== undefined);
      const valley = nb.length > 0 && points[i].v < Math.min(...nb);
      const above = yp - 1.6, below = yp + 1.6 + valH * 0.9;
      for (const base of valley ? [below, above] : [above, below]) {
        const b = { x1: cx - tw / 2, x2: cx + tw / 2, y1: base - valH * 0.9, y2: base + valH * 0.21 };
        if (b.y1 >= bandTop && b.y2 <= bandBottom && !hits(b)) {
          placed.push(b);
          valLabels.push({ txt, cx, base, b });
          break;
        }
      }
    }
    // fundo branco sob o rótulo: a linha do gráfico não risca o número
    setFill(C.white);
    valLabels.forEach(l => doc.rect(l.b.x1 - 0.3, l.b.y1, l.b.x2 - l.b.x1 + 0.6, l.b.y2 - l.b.y1, 'F'));
    setText(C.ink);
    valLabels.forEach(l => doc.text(l.txt, l.cx, l.base, { align: 'center' }));

    // datas no eixo X (mesma regra de prioridade/colisão)
    const dates: Box[] = [];
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8);
    setText(C.muted);
    for (const i of order) {
      const tw = doc.getTextWidth(points[i].label);
      const cx = Math.min(Math.max(xat(i), px + tw / 2), px + pw - tw / 2);
      const b = { x1: cx - tw / 2, x2: cx + tw / 2, y1: 0, y2: 1 };
      if (dates.some(o => b.x1 < o.x2 + 1 && o.x1 < b.x2 + 1)) continue;
      dates.push(b);
      doc.text(points[i].label, cx, dateBase, { align: 'center' });
    }
  };

  // monta dados dos gráficos
  const chartH = 50;
  const half = (CONTENT_W - 4) / 2;

  // barras comparativas
  sectionTitle('Comparativo — Atual vs. Avaliação Anterior', chartH + 2);
  ensure(chartH + 2);
  drawBarChart(M, y, CONTENT_W, chartH, 'Composição Corporal', [
    { label: 'Peso (kg)', cur: bio?.weight_kg, prev: pbio?.weight_kg },
    { label: '% Gord. (bioimp.)', cur: a.body_fat_percentage, prev: prev?.body_fat_percentage },
    { label: '% Músculo', cur: bio?.skeletal_muscle_percentage, prev: pbio?.skeletal_muscle_percentage },
    { label: 'M. Magra (kg)', cur: a.lean_mass_kg, prev: prev?.lean_mass_kg },
    { label: 'M. Gorda (kg)', cur: a.fat_mass_kg, prev: prev?.fat_mass_kg },
  ]);
  y += chartH + 8;

  // evolução histórica (avaliações até a data da avaliação exportada)
  const history = pdfUpToDate(student.avaliacoes, a.date).sort((x1, x2) => x1.date.localeCompare(x2.date));
  const weightPts = history
    .map(h => ({ label: pdfShortDate(h.date), v: h.bioimpedancias?.weight_kg }))
    .filter(p => p.v !== null && p.v !== undefined && !Number.isNaN(p.v)) as { label: string; v: number }[];
  const fatPts = history
    .map(h => ({ label: pdfShortDate(h.date), v: h.body_fat_percentage }))
    .filter(p => p.v !== null && p.v !== undefined && !Number.isNaN(p.v)) as { label: string; v: number }[];

  sectionTitle('Evolução Histórica', chartH + 2);
  ensure(chartH + 2);
  drawLineChart(M, y, half, chartH, 'Peso', 'kg', weightPts, C.primary);
  drawLineChart(M + half + 4, y, half, chartH, '% Gordura Corporal', '%', fatPts, C.red);
  y += chartH + 8;

  // =================== TABELAS ===================
  interface Row { label: string; cur: string; prevVal?: string; delta?: DeltaInfo; improve?: ImproveDir; }

  const drawTable = (title: string, rows: Row[], showCompare: boolean) => {
    const cLabel = M + 3;
    const cCur = showCompare ? M + CONTENT_W * 0.50 : M + CONTENT_W * 0.42;
    const cPrev = M + CONTENT_W * 0.69;
    const cDelta = M + CONTENT_W * 0.86;
    const colEnd = PAGE_W - M - 1;
    // Largura útil de cada coluna: TODO texto é quebrado/truncado nela (nada invade a vizinha).
    const wLabel = cCur - cLabel - 3;
    const wCur = (showCompare ? cPrev : colEnd) - cCur - 3;
    const wPrev = cDelta - cPrev - 3;
    const wDelta = colEnd - cDelta;
    const baseH = 7;
    const lineH = 4.2;
    const pad = 2.8;
    const textY = 4.7;

    // Quebra o texto na largura da coluna (linhas longas sem espaço são truncadas).
    const wrap = (text: string, maxW: number, style: 'normal' | 'bold'): string[] => {
      doc.setFont('helvetica', style);
      doc.setFontSize(8.5);
      return (doc.splitTextToSize(text, maxW) as string[]).map(ln => truncate(ln, maxW));
    };
    const cells = rows.map(r => ({
      label: wrap(r.label, wLabel, 'normal'),
      cur: wrap(r.cur, wCur, 'bold'),
      prev: showCompare ? wrap(r.prevVal ?? '—', wPrev, 'normal') : [],
    }));
    const lineCount = (c: typeof cells[number]) => Math.max(c.label.length, c.cur.length, c.prev.length, 1);
    const segH = (lines: number) => Math.max(baseH, lines * lineH + pad);

    const drawHeader = () => {
      setFill(C.primaryDark);
      doc.rect(M, y, CONTENT_W, baseH, 'F');
      setText(C.white);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(truncate('PARÂMETRO', wLabel), cLabel, y + textY);
      doc.text(truncate('ATUAL', wCur), cCur, y + textY);
      if (showCompare) {
        doc.text(truncate('ANTERIOR', wPrev), cPrev, y + textY);
        doc.text(truncate('VARIAÇÃO', wDelta), cDelta, y + textY);
      }
      y += baseH;
    };
    // nova página no meio da tabela: repete o cabeçalho das colunas
    const breakPage = () => {
      ensure(Number.POSITIVE_INFINITY);
      drawHeader();
    };

    // título + cabeçalho + 1ª linha sempre na mesma página
    const firstLines = cells.length ? Math.min(lineCount(cells[0]), 3) : 0;
    sectionTitle(title, baseH + segH(firstLines));
    drawHeader();

    rows.forEach((r, i) => {
      const c = cells[i];
      const total = lineCount(c);
      let from = 0;
      while (from < total) {
        let fit = Math.floor((BOTTOM_LIMIT - y - pad) / lineH);
        // linha curta não é partida entre páginas; linha muito longa é fatiada
        if (fit < 1 || (from === 0 && fit < Math.min(total, 3))) {
          breakPage();
          fit = Math.floor((BOTTOM_LIMIT - y - pad) / lineH);
        }
        const cnt = Math.min(total - from, Math.max(fit, 1));
        const h = segH(cnt);

        if (i % 2 === 1) {
          setFill(C.zebra);
          doc.rect(M, y, CONTENT_W, h, 'F');
        }
        const col = (lines: string[], cx: number) =>
          lines.slice(from, from + cnt).forEach((ln, li) => doc.text(ln, cx, y + textY + li * lineH));

        setText(C.ink);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        col(c.label, cLabel);
        doc.setFont('helvetica', 'bold');
        col(c.cur, cCur);

        if (showCompare) {
          doc.setFont('helvetica', 'normal');
          setText(C.muted);
          col(c.prev, cPrev);
          if (from === 0) {
            if (r.delta && r.delta.text !== '—' && r.delta.dir !== 'flat') {
              setText(toneColor(pdfDeltaTone(r.delta, r.improve ?? 'neutral')));
              doc.setFont('helvetica', 'bold');
              doc.text(truncate(r.delta.text, wDelta), cDelta, y + textY);
            } else {
              setText(C.faint);
              doc.text('—', cDelta, y + textY);
            }
          }
        }
        y += h;
        from += cnt;
      }
    });
    setDraw(C.line);
    doc.setLineWidth(0.3);
    doc.line(M, y, PAGE_W - M, y);
    y += 8;
  };

  // ---- Bioimpedância (Omron) ----
  drawTable('Composição Corporal — Bioimpedância (Omron HBF-514C)', [
    { label: 'Peso (kg)', cur: pdfFormatNumber(bio?.weight_kg), prevVal: pdfFormatNumber(pbio?.weight_kg), delta: pdfDelta(bio?.weight_kg, pbio?.weight_kg), improve: 'neutral' },
    { label: 'IMC', cur: pdfFormatNumber(a.bmi), prevVal: pdfFormatNumber(prev?.bmi), delta: pdfDelta(a.bmi, prev?.bmi), improve: 'neutral' },
    { label: 'Classificação IMC', cur: pdfText(a.bmi_classification), prevVal: pdfText(prev?.bmi_classification) },
    { label: '% Gordura Corporal', cur: pdfFormatNumber(bio?.body_fat_percentage), prevVal: pdfFormatNumber(pbio?.body_fat_percentage), delta: pdfDelta(bio?.body_fat_percentage, pbio?.body_fat_percentage), improve: 'down' },
    { label: 'Classificação % Gordura (bioimp. Omron)', cur: pdfText(a.body_fat_classification), prevVal: pdfText(prev?.body_fat_classification) },
    { label: '% Músculo Esquelético', cur: pdfFormatNumber(bio?.skeletal_muscle_percentage), prevVal: pdfFormatNumber(pbio?.skeletal_muscle_percentage), delta: pdfDelta(bio?.skeletal_muscle_percentage, pbio?.skeletal_muscle_percentage), improve: 'up' },
    { label: 'Metabolismo Basal (kcal)', cur: pdfFormatNumber(bio?.resting_metabolism_kcal, 0), prevVal: pdfFormatNumber(pbio?.resting_metabolism_kcal, 0), delta: pdfDelta(bio?.resting_metabolism_kcal, pbio?.resting_metabolism_kcal, 0), improve: 'neutral' },
    { label: 'Idade Corporal (anos)', cur: pdfFormatNumber(bio?.body_age, 0), prevVal: pdfFormatNumber(pbio?.body_age, 0), delta: pdfDelta(bio?.body_age, pbio?.body_age, 0), improve: 'down' },
    { label: 'Gordura Visceral (nível)', cur: pdfFormatNumber(bio?.visceral_fat_level, 0), prevVal: pdfFormatNumber(pbio?.visceral_fat_level, 0), delta: pdfDelta(bio?.visceral_fat_level, pbio?.visceral_fat_level, 0), improve: 'down' },
    { label: 'Risco Visceral', cur: pdfVisceralLabel(a.visceral_risk), prevVal: prev ? pdfVisceralLabel(prev.visceral_risk) : '—' },
    { label: '% Água Corporal', cur: pdfFormatNumber(bio?.water_percentage), prevVal: pdfFormatNumber(pbio?.water_percentage), delta: pdfDelta(bio?.water_percentage, pbio?.water_percentage), improve: 'neutral' },
    { label: 'Massa Gorda (kg)', cur: pdfFormatNumber(a.fat_mass_kg), prevVal: pdfFormatNumber(prev?.fat_mass_kg), delta: pdfDelta(a.fat_mass_kg, prev?.fat_mass_kg), improve: 'down' },
    { label: 'Massa Magra (kg)', cur: pdfFormatNumber(a.lean_mass_kg), prevVal: pdfFormatNumber(prev?.lean_mass_kg), delta: pdfDelta(a.lean_mass_kg, prev?.lean_mass_kg), improve: 'up' },
    { label: 'Modo Atleta', cur: pdfBoolLabel(bio?.is_athlete), prevVal: pdfBoolLabel(pbio?.is_athlete) },
  ], true);

  // ---- Circunferências ----
  const cir = a.circunferencias;
  const pcir = prev?.circunferencias;
  // Circunferências: só cintura/abdômen/RCQ têm sentido de melhora (menor = melhor); demais são neutras.
  const cRow = (label: string, key: keyof typeof cir, digits = 1, improve: ImproveDir = 'neutral'): Row => ({
    label,
    improve,
    cur: pdfFormatNumber(cir?.[key] as number, digits),
    prevVal: pdfFormatNumber(pcir?.[key] as number, digits),
    delta: pdfDelta(cir?.[key] as number, pcir?.[key] as number, digits),
  });
  drawTable('Circunferências (cm)', [
    cRow('Pescoço', 'neck_cm'),
    cRow('Ombro', 'shoulder_cm'),
    cRow('Tórax', 'chest_cm'),
    cRow('Cintura', 'waist_cm', 1, 'down'),
    cRow('Abdômen', 'abdomen_cm', 1, 'down'),
    cRow('Quadril', 'hip_cm'),
    cRow('Braço D. (relaxado)', 'right_arm_relaxed_cm'),
    cRow('Braço E. (relaxado)', 'left_arm_relaxed_cm'),
    cRow('Braço D. (contraído)', 'right_arm_flexed_cm'),
    cRow('Braço E. (contraído)', 'left_arm_flexed_cm'),
    cRow('Antebraço D.', 'right_forearm_cm'),
    cRow('Antebraço E.', 'left_forearm_cm'),
    cRow('Coxa D. (proximal)', 'right_thigh_proximal_cm'),
    cRow('Coxa E. (proximal)', 'left_thigh_proximal_cm'),
    cRow('Coxa D. (medial)', 'right_thigh_medial_cm'),
    cRow('Coxa E. (medial)', 'left_thigh_medial_cm'),
    cRow('Coxa D. (distal)', 'right_thigh_distal_cm'),
    cRow('Coxa E. (distal)', 'left_thigh_distal_cm'),
    cRow('Panturrilha D.', 'right_calf_cm'),
    cRow('Panturrilha E.', 'left_calf_cm'),
    ...(cir?.bust_cm || pcir?.bust_cm ? [cRow('Busto', 'bust_cm')] : []),
    { label: 'RCQ (Cintura/Quadril)', cur: pdfFormatNumber(a.rcq, 2), prevVal: pdfFormatNumber(prev?.rcq, 2), delta: pdfDelta(a.rcq, prev?.rcq, 2), improve: 'down' },
  ], true);

  // ---- Saúde Feminina (só quando há dado preenchido) ----
  if (student.gender === 'FEMALE' && (a.last_menstruation_date || a.menstrual_cycle_regular !== null && a.menstrual_cycle_regular !== undefined)) {
    drawTable('Saúde Feminina', [
      { label: 'Última Menstruação', cur: pdfFormatDate(a.last_menstruation_date), prevVal: pdfFormatDate(prev?.last_menstruation_date) },
      { label: 'Ciclo Regular', cur: pdfBoolLabel(a.menstrual_cycle_regular), prevVal: pdfBoolLabel(prev?.menstrual_cycle_regular) },
    ], true);
  }

  // ---- Dobras Cutâneas ----
  const sk = a.dobras_cutaneas;
  const psk = prev?.dobras_cutaneas;
  // Dobras: menor = melhor em todas.
  const sRow = (label: string, key: keyof typeof sk): Row => ({
    label,
    improve: 'down',
    cur: pdfFormatNumber(sk?.[key] as number),
    prevVal: pdfFormatNumber(psk?.[key] as number),
    delta: pdfDelta(sk?.[key] as number, psk?.[key] as number),
  });
  drawTable('Dobras Cutâneas (mm)', [
    { label: 'Protocolo', cur: pdfProtocolLabel(sk?.protocol), prevVal: pdfProtocolLabel(psk?.protocol) },
    sRow('Tríceps', 'triceps_mm'),
    // Bíceps e Panturrilha são opcionais (fora do JP7): só aparecem se houver valor.
    ...(sk?.biceps_mm != null || psk?.biceps_mm != null ? [sRow('Bíceps', 'biceps_mm')] : []),
    sRow('Subescapular', 'subscapular_mm'),
    sRow('Peitoral', 'chest_mm'),
    sRow('Axilar Média', 'midaxillary_mm'),
    sRow('Supra-ilíaca', 'suprailiac_mm'),
    sRow('Abdominal', 'abdominal_mm'),
    sRow('Coxa', 'mid_thigh_mm'),
    ...(sk?.calf_mm != null || psk?.calf_mm != null ? [sRow('Panturrilha', 'calf_mm')] : []),
    { label: 'Somatório 7 dobras (mm)', cur: pdfFormatNumber(a.skinfolds_sum_mm), prevVal: pdfFormatNumber(prev?.skinfolds_sum_mm), delta: pdfDelta(a.skinfolds_sum_mm, prev?.skinfolds_sum_mm), improve: 'down' },
    { label: '% Gordura (dobras)', cur: pdfFormatNumber(a.skinfolds_fat_percentage), prevVal: pdfFormatNumber(prev?.skinfolds_fat_percentage), delta: pdfDelta(a.skinfolds_fat_percentage, prev?.skinfolds_fat_percentage), improve: 'down' },
  ], true);

  // ---- Anamnese ----
  const an = student.anamneses;
  drawTable('Anamnese / Histórico de Saúde', [
    { label: 'Condição cardíaca', cur: an ? pdfBoolLabel(an.cardiac_condition) : '—' },
    { label: 'Dor articular', cur: an ? pdfBoolLabel(an.joint_pain) : '—' },
    { label: 'Dor no peito ao exercitar', cur: an ? pdfBoolLabel(an.chest_pain_during_exercise) : '—' },
    { label: 'Cirurgia recente', cur: an ? pdfText(an.recent_surgery_description) : '—' },
    { label: 'Medicações em uso', cur: an ? pdfText(an.active_medications) : '—' },
    { label: 'Observações', cur: an ? pdfText(an.notes) : '—' },
  ], false);

  // ======================= OBSERVAÇÕES DO RELATÓRIO =======================
  const obs = (data.observacoes ?? '').trim();
  if (obs) {
    sectionTitle('Observações', 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setText(C.ink);
    const obsLineH = 5;
    // Preserva parágrafos do usuário e quebra cada um pela largura útil da página.
    for (const para of obs.split(/\r?\n/)) {
      if (para.trim() === '') { y += obsLineH; continue; }
      for (const ln of doc.splitTextToSize(para, CONTENT_W - 2) as string[]) {
        ensure(obsLineH);
        doc.text(ln, M + 1, y + 3.5);
        y += obsLineH;
      }
    }
    y += 6;
  }

  // ======================= EVOLUÇÃO VISUAL (FOTOS) =======================
  // Fotos são tiradas dias depois da avaliação: atribui cada uma à avaliação mais próxima (ver pdfSelectPhotos)
  const photos = data.photos ?? [];
  if (photos.length > 0) {
    // Ordem de exibição dos ângulos
    const ANGLE_ORDER = ['FRENTE', 'LADO_DIREITO', 'LADO_ESQUERDO', 'COSTAS', 'PERFIL'];
    const ANGLE_LABEL: Record<string, string> = {
      FRENTE: 'Frente', LADO_DIREITO: 'Lado Direito',
      LADO_ESQUERDO: 'Lado Esquerdo', COSTAS: 'Costas', PERFIL: 'Lateral',
    };

    // Agrupa por ângulo: Início (avaliações anteriores) e Recente (avaliação exportada)
    const assessmentDates = (student.avaliacoes ?? []).filter(av => !av.deleted_at).map(av => av.date);
    const selected = pdfSelectPhotos(photos, assessmentDates, a.date);
    const byCategory = new Map<string, { oldest: PdfPhoto; newest: PdfPhoto; single: boolean }>();
    for (const cat of ANGLE_ORDER) {
      const sel = selected.get(cat);
      const oldest = sel?.inicio ?? sel?.recente;
      const newest = sel?.recente ?? sel?.inicio;
      if (oldest && newest) {
        byCategory.set(cat, { oldest, newest, single: !sel?.inicio || !sel?.recente });
      }
    }

    if (byCategory.size > 0) {
      doc.addPage();
      let py = M;

      // Cabeçalho da página de fotos
      setFill(C.primary);
      doc.roundedRect(M, py, CONTENT_W, 10, 2, 2, 'F');
      setText(C.white);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Evolução Visual — Comparativo de Fotos', M + 4, py + 6.5);
      py += 14;

      const IMG_W = 80;
      const IMG_H = 100;
      // Linhas próprias (sem dividir a mesma faixa): ângulo → Início/Recente → foto → data
      const LABEL_Y = 5, CAPTION_Y = 10, IMG_TOP = 12;
      const SECTION_H = IMG_TOP + IMG_H + 9; // rótulos + foto + data + respiro

      // Foto proporcional (sem distorcer) dentro da caixa IMG_W×IMG_H, centrada na horizontal;
      // a data fica logo abaixo da foto desenhada.
      const drawPhoto = (photo: PdfPhoto, bx: number, by: number) => {
        let w = IMG_W, h = IMG_H;
        try {
          const props = doc.getImageProperties(photo.dataUrl);
          const s = Math.min(IMG_W / props.width, IMG_H / props.height);
          w = props.width * s;
          h = props.height * s;
          doc.addImage(photo.dataUrl, props.fileType, bx + (IMG_W - w) / 2, by, w, h);
        } catch { /* imagem inválida, ignora */ }
        setText(C.muted);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text(pdfFormatDate(photo.date), bx + IMG_W / 2, by + h + 4, { align: 'center' });
      };
      const caption = (txt: string, bx: number, cy: number) => {
        setText(C.muted);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text(txt, bx + IMG_W / 2, cy, { align: 'center' });
      };

      for (const [cat, { oldest, newest, single }] of byCategory.entries()) {
        // Nova página se não couber (com o cabeçalho corrido, como nas demais páginas)
        if (py + SECTION_H > BOTTOM_LIMIT) {
          doc.addPage();
          runningHeader();
          py = y;
        }

        // Rótulo do ângulo
        setText(C.ink);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(ANGLE_LABEL[cat] ?? cat, M, py + LABEL_Y);

        if (single) {
          // Só 1 foto — exibir centralizada, indicando se é a do início ou a recente
          const imgX = M + (CONTENT_W - IMG_W) / 2;
          caption(selected.get(cat)?.recente ? 'Recente' : 'Início', imgX, py + CAPTION_Y);
          drawPhoto(oldest, imgX, py + IMG_TOP);
        } else {
          // 2 fotos: Início (esquerda) e Recente (direita)
          const leftX = M;
          const rightX = PAGE_W - M - IMG_W;
          caption('Início', leftX, py + CAPTION_Y);
          caption('Recente', rightX, py + CAPTION_Y);
          drawPhoto(oldest, leftX, py + IMG_TOP);
          drawPhoto(newest, rightX, py + IMG_TOP);
        }

        py += SECTION_H;
      }
    }
  }

  // ======================= RODAPÉ EM TODAS AS PÁGINAS =======================
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    setDraw(C.line);
    doc.setLineWidth(0.3);
    doc.line(M, FOOTER_Y - 3, PAGE_W - M, FOOTER_Y - 3);
    setText(C.faint);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    // nome do personal truncado antes do texto central (sem colisão com nomes longos)
    const centerTxt = 'FocusPT — Documento gerado automaticamente';
    const trainerMaxW = PAGE_W / 2 - doc.getTextWidth(centerTxt) / 2 - 3 - M;
    doc.text(truncate(`Personal Trainer: ${pdfText(trainerName)}`, trainerMaxW), M, FOOTER_Y);
    doc.text(centerTxt, PAGE_W / 2, FOOTER_Y, { align: 'center' });
    doc.text(`Página ${p} de ${pageCount}`, PAGE_W - M, FOOTER_Y, { align: 'right' });
  }

  return doc;
}
