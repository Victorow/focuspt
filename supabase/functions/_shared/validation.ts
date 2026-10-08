// Helpers puros de validação usados pelas Edge Functions.
// Sem dependências de Deno/Supabase para poderem ser testados com vitest (src/tests/validation.spec.ts).

// ---------------------------------------------
// Tipos básicos
// ---------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** Data no formato YYYY-MM-DD e que exista no calendário (rejeita 2026-02-30). */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Aceita HH:MM ou HH:MM:SS (24h). Retorna normalizado em HH:MM ou null se inválido. */
export function normalizeTime(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(v.trim());
  return m ? `${m[1]}:${m[2]}` : null;
}

/** Diferença em dias entre duas datas YYYY-MM-DD (to - from). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** "Hoje" (YYYY-MM-DD) no fuso informado — o personal trabalha no horário de Brasília, não em UTC. */
export function todayInTimeZone(now: Date = new Date(), timeZone = 'America/Sao_Paulo'): string {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// ---------------------------------------------
// Busca (PostgREST .or())
// ---------------------------------------------

/**
 * Remove do termo de busca os caracteres com significado na sintaxe de filtros do
 * PostgREST (`,` `(` `)` `.` `:` `"`) e os curingas do ILIKE (`%` `_` `*` `\`), evitando
 * que o usuário injete condições extras no `.or()`. Limita o tamanho a 100 caracteres.
 */
export function sanitizeSearchTerm(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[,()%_*\\.:"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

// ---------------------------------------------
// Alunos
// ---------------------------------------------

export interface AlunoFields {
  name?: string;
  birth_date?: string;
  gender?: 'MALE' | 'FEMALE';
  height_cm?: number;
  goal?: string;
  phone_number?: string | null;
}

// lgpd_consent_status NÃO entra aqui de propósito: só o lgpd-sign altera o status, após assinatura real.
const ALUNO_EDITABLE = ['name', 'birth_date', 'gender', 'height_cm', 'goal', 'phone_number'] as const;

/**
 * Valida/normaliza os campos editáveis de um aluno. Com `partial = true` (PUT) só valida
 * o que veio; senão (POST) exige name, birth_date, gender e height_cm.
 * Campos fora da whitelist (ex.: lgpd_consent_status, personal_trainer_id) são ignorados.
 */
export function validateAlunoFields(
  body: unknown,
  partial: boolean,
  today: string = todayInTimeZone(),
): { value: AlunoFields; error: string | null } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const value: AlunoFields = {};

  if (!partial) {
    const faltando = ['name', 'birth_date', 'gender', 'height_cm'].filter((k) => b[k] === undefined || b[k] === null || b[k] === '');
    if (faltando.length) return { value, error: 'Campos obrigatórios: name, birth_date, gender, height_cm' };
  }

  for (const key of ALUNO_EDITABLE) {
    if (!(key in b)) continue;
    const v = b[key];
    switch (key) {
      case 'name': {
        const s = typeof v === 'string' ? v.trim() : '';
        if (s.length < 2 || s.length > 120) return { value, error: 'name deve ter entre 2 e 120 caracteres' };
        value.name = s;
        break;
      }
      case 'birth_date':
        if (!isIsoDate(v) || v > today || v < '1900-01-01') return { value, error: 'birth_date inválida (use YYYY-MM-DD)' };
        value.birth_date = v;
        break;
      case 'gender':
        if (v !== 'MALE' && v !== 'FEMALE') return { value, error: 'gender inválido' };
        value.gender = v;
        break;
      case 'height_cm': {
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(n) || n < 50 || n > 250) return { value, error: 'height_cm fora do intervalo 50-250' };
        value.height_cm = n;
        break;
      }
      case 'goal':
        if (v !== null && typeof v !== 'string') return { value, error: 'goal inválido' };
        value.goal = ((v as string | null) ?? '').trim().slice(0, 500);
        break;
      case 'phone_number': {
        if (v === null || v === '') { value.phone_number = null; break; }
        if (typeof v !== 'string' || v.length > 30 || !/^[0-9+()\-\s]+$/.test(v)) {
          return { value, error: 'phone_number inválido' };
        }
        value.phone_number = v.trim();
        break;
      }
    }
  }
  return { value, error: null };
}

// ---------------------------------------------
// Agenda
// ---------------------------------------------

export const AGENDA_MAX_RANGE_DAYS = 92;
export const AGENDA_FOCUS_MAX = 500;

/** Valida ?from=&to= da agenda. Ausentes → hoje; só `from` → mesmo dia. */
export function parseAgendaRange(
  from: string | null,
  to: string | null,
  today: string,
): { from: string; to: string; error: string | null } {
  const f = from || today;
  const t = to || (from ? f : today);
  if (!isIsoDate(f) || !isIsoDate(t)) return { from: f, to: t, error: 'from/to devem estar no formato YYYY-MM-DD' };
  if (t < f) return { from: f, to: t, error: '"to" deve ser maior ou igual a "from"' };
  if (daysBetween(f, t) > AGENDA_MAX_RANGE_DAYS) {
    return { from: f, to: t, error: `Intervalo máximo de ${AGENDA_MAX_RANGE_DAYS} dias` };
  }
  return { from: f, to: t, error: null };
}

export interface AgendaFields {
  aluno_id?: string;
  date?: string;
  time?: string;
  focus?: string | null;
}

/** Valida o corpo de criação (partial=false: aluno_id, date e time obrigatórios) ou edição (partial=true). */
export function validateAgendaInput(body: unknown, partial: boolean): { value: AgendaFields; error: string | null } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const value: AgendaFields = {};

  if (!partial && (!b.aluno_id || !b.date || !b.time)) {
    return { value, error: 'Campos obrigatórios: aluno_id, date, time' };
  }
  if ('aluno_id' in b) {
    if (!isUuid(b.aluno_id)) return { value, error: 'aluno_id inválido' };
    value.aluno_id = b.aluno_id;
  }
  if ('date' in b) {
    if (!isIsoDate(b.date)) return { value, error: 'date inválida (use YYYY-MM-DD)' };
    value.date = b.date;
  }
  if ('time' in b) {
    const t = normalizeTime(b.time);
    if (!t) return { value, error: 'time inválido (use HH:MM)' };
    value.time = t;
  }
  if ('focus' in b) {
    if (b.focus !== null && b.focus !== undefined && typeof b.focus !== 'string') return { value, error: 'focus inválido' };
    const s = typeof b.focus === 'string' ? b.focus.trim() : '';
    if (s.length > AGENDA_FOCUS_MAX) return { value, error: `focus deve ter no máximo ${AGENDA_FOCUS_MAX} caracteres` };
    value.focus = s.length ? s : null;
  }
  if (partial && Object.keys(value).length === 0) {
    return { value, error: 'Nenhum campo para atualizar (aluno_id, date, time, focus)' };
  }
  return { value, error: null };
}

// ---------------------------------------------
// Upload de imagens (fotos e assinatura LGPD)
// ---------------------------------------------

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export const IMAGE_EXT: Record<ImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Remove um eventual prefixo `data:...;base64,` e espaços/quebras de linha. */
export function stripDataUrl(b64: string): string {
  const i = b64.indexOf('base64,');
  return (i >= 0 ? b64.slice(i + 7) : b64).replace(/\s/g, '');
}

/** Tamanho em bytes do conteúdo decodificado de uma string base64 (sem decodificar). */
export function base64DecodedSize(b64: string): number {
  const len = b64.length;
  if (!len) return 0;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

/** Identifica o tipo real da imagem pelos "magic bytes" (não confia no mime enviado pelo cliente). */
export function detectImageMime(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // WEBP
  ) return 'image/webp';
  return null;
}

/**
 * Decodifica e valida uma imagem em base64: base64 válido, tamanho máximo e tipo real
 * dentro de `allowed`. Retorna os bytes e o mime detectado.
 */
export function decodeImageBase64(
  input: unknown,
  opts: { maxBytes: number; allowed: ImageMime[]; minBytes?: number },
): { bytes: Uint8Array; mime: ImageMime; error: null } | { bytes: null; mime: null; error: string } {
  const fail = (error: string) => ({ bytes: null, mime: null, error } as const);
  if (typeof input !== 'string' || !input) return fail('Imagem não informada');
  const b64 = stripDataUrl(input);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 !== 0) return fail('Imagem em base64 inválida');
  const size = base64DecodedSize(b64);
  if (size > opts.maxBytes) return fail(`Imagem maior que o limite de ${Math.round(opts.maxBytes / 1024 / 1024)} MB`);
  if (size < (opts.minBytes ?? 1)) return fail('Imagem vazia ou inválida');
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return fail('Imagem em base64 inválida');
  }
  const mime = detectImageMime(bytes);
  if (!mime || !opts.allowed.includes(mime)) {
    return fail(`Formato de imagem não permitido. Use: ${opts.allowed.map((m) => IMAGE_EXT[m].toUpperCase()).join(', ')}`);
  }
  return { bytes, mime, error: null };
}

// ---------------------------------------------
// Assinatura LGPD
// ---------------------------------------------

/**
 * Extrai o caminho no Storage a partir de uma URL assinada antiga
 * (`.../storage/v1/object/sign/<bucket>/<path>?token=...`). Usado só como
 * fallback para registros antigos sem `signature_storage_path`.
 */
export function storagePathFromSignedUrl(url: unknown, bucket: string): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    const u = new URL(url);
    const marker = `/storage/v1/object/sign/${bucket}/`;
    const i = u.pathname.indexOf(marker);
    if (i < 0) return null;
    const path = decodeURIComponent(u.pathname.slice(i + marker.length));
    return path && !path.split('/').includes('..') ? path : null;
  } catch {
    return null;
  }
}
