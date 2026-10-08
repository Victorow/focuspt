// Seleção de fotos para o card "Mídia Recente" do perfil.

export interface PhotoLike {
  date: string;
  created_at?: string | null;
}

/**
 * As `limit` fotos MAIS RECENTES: data da foto desc, depois created_at desc.
 * Não depende da ordem em que a API devolve a lista e não altera o array original.
 */
export function selectRecentPhotos<T extends PhotoLike>(photos: readonly T[] | null | undefined, limit = 2): T[] {
  if (!photos?.length) return [];
  return [...photos]
    .sort((a, b) => {
      const byDate = (b.date ?? '').localeCompare(a.date ?? '');
      if (byDate !== 0) return byDate;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    })
    .slice(0, limit);
}

export function categoryLabel(cat: string): string {
  const MAP: Record<string, string> = {
    FRENTE: 'Frente',
    LADO_DIREITO: 'Lado Direito',
    LADO_ESQUERDO: 'Lado Esquerdo',
    COSTAS: 'Costas',
    PERFIL: 'Lateral',
  };
  return MAP[cat] ?? cat;
}

// =============================================
// SESSÕES E COMPARAÇÃO (galeria e aba Fotos do perfil)
// =============================================

import { pdfSelectPhotos } from './pdf-report';

export interface PhotoSession<T> {
  date: string;
  photos: T[];
}

/** Agrupa fotos por data (sessão), da mais recente para a mais antiga; dentro da sessão, na ordem de ângulo. */
export function groupPhotoSessions<T extends PhotoLike & { category: string }>(photos: readonly T[] | null | undefined): PhotoSession<T>[] {
  if (!photos?.length) return [];
  const ORDER = ['FRENTE', 'LADO_DIREITO', 'LADO_ESQUERDO', 'COSTAS', 'PERFIL'];
  const rank = (c: string) => { const i = ORDER.indexOf(c); return i < 0 ? ORDER.length : i; };
  const map = new Map<string, T[]>();
  for (const p of photos) {
    const key = (p.date ?? '').slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(p);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({ date, photos: [...list].sort((a, b) => rank(a.category) - rank(b.category)) }));
}

/** Data (dentro de `dates`) mais próxima de `date`; empate → a anterior. Lista vazia → null. */
export function nearestDate(dates: readonly string[], date: string): string | null {
  const day = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
  const target = day(date);
  if (target === null) return null;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const d of [...dates].sort()) {
    const n = day(d);
    if (n === null) continue;
    const dist = Math.abs(n - target);
    if (dist < bestDist) { best = d; bestDist = dist; }
  }
  return best;
}

export interface ComparePair<T> {
  inicio?: T;
  recente?: T;
}

/**
 * Par início/recente de um ângulo, pela mesma regra do PDF (pdfSelectPhotos: cada foto vai para a
 * avaliação mais próxima). Sem avaliação, ou quando a regra não acha um "início", cai para a foto
 * mais antiga do ângulo anterior à recente.
 */
export function selectComparePair<T extends PhotoLike & { category: string }>(
  photos: readonly T[],
  assessmentDates: readonly string[],
  category: string,
  refDate: string,
): ComparePair<T> {
  const mine = photos.filter(p => p.category === category);
  if (mine.length === 0) return {};
  const sorted = [...mine].sort((a, b) => a.date.localeCompare(b.date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const pair: ComparePair<T> = assessmentDates.length
    ? (pdfSelectPhotos([...mine], [...assessmentDates], refDate).get(category) ?? {})
    : {};
  const recente = pair.recente ?? sorted[sorted.length - 1];
  let inicio = pair.inicio;
  if (!inicio) {
    const older = sorted.filter(p => p !== recente && p.date < recente.date);
    inicio = older[0];
  }
  return inicio && inicio !== recente ? { inicio, recente } : { recente };
}
