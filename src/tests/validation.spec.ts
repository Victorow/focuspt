import { describe, it, expect } from 'vitest';
import {
  isUuid,
  isIsoDate,
  normalizeTime,
  daysBetween,
  todayInTimeZone,
  sanitizeSearchTerm,
  validateAlunoFields,
  parseAgendaRange,
  validateAgendaInput,
  AGENDA_MAX_RANGE_DAYS,
  stripDataUrl,
  base64DecodedSize,
  detectImageMime,
  decodeImageBase64,
  storagePathFromSignedUrl,
} from '../../supabase/functions/_shared/validation';

const UUID = '86b74477-b02b-445a-90f4-f6b603a1d8bc';

// Bytes mínimos para cada formato (só o cabeçalho importa para a detecção)
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0];
const WEBP_HEADER = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const toB64 = (bytes: number[]) => Buffer.from(Uint8Array.from(bytes)).toString('base64');
const pad = (header: number[], total: number) => [...header, ...new Array(Math.max(0, total - header.length)).fill(0)];

// =============================================
// Tipos básicos
// =============================================
describe('isUuid', () => {
  it('aceita UUID válido', () => expect(isUuid(UUID)).toBe(true));
  it('rejeita string qualquer, vazio e não-string', () => {
    expect(isUuid('abc')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(123)).toBe(false);
    expect(isUuid(`${UUID},id.neq.x`)).toBe(false);
  });
});

describe('isIsoDate', () => {
  it('aceita datas reais YYYY-MM-DD', () => {
    expect(isIsoDate('2026-10-07')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
  });
  it('rejeita datas inexistentes e formatos errados', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2025-02-29')).toBe(false);
    expect(isIsoDate('07/10/2026')).toBe(false);
    expect(isIsoDate('2026-10-07T10:00')).toBe(false);
    expect(isIsoDate('../../x')).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe('normalizeTime', () => {
  it('normaliza HH:MM e HH:MM:SS para HH:MM', () => {
    expect(normalizeTime('07:30')).toBe('07:30');
    expect(normalizeTime('23:59:59')).toBe('23:59');
    expect(normalizeTime(' 08:00 ')).toBe('08:00');
  });
  it('rejeita horários inválidos', () => {
    expect(normalizeTime('24:00')).toBeNull();
    expect(normalizeTime('7:30')).toBeNull();
    expect(normalizeTime('12:60')).toBeNull();
    expect(normalizeTime(730)).toBeNull();
  });
});

describe('daysBetween / todayInTimeZone', () => {
  it('conta dias entre datas', () => {
    expect(daysBetween('2026-10-01', '2026-10-07')).toBe(6);
    expect(daysBetween('2026-10-07', '2026-10-07')).toBe(0);
  });
  it('usa o fuso de Brasília (23h em SP ainda é o mesmo dia, embora já seja o seguinte em UTC)', () => {
    const now = new Date('2026-10-08T02:00:00Z'); // 23:00 de 07/10 em São Paulo (UTC-3)
    expect(todayInTimeZone(now, 'America/Sao_Paulo')).toBe('2026-10-07');
    expect(todayInTimeZone(now, 'UTC')).toBe('2026-10-08');
  });
});

// =============================================
// Busca
// =============================================
describe('sanitizeSearchTerm', () => {
  it('mantém termos normais', () => {
    expect(sanitizeSearchTerm('Maria Silva')).toBe('Maria Silva');
    expect(sanitizeSearchTerm("D'Ávila")).toBe("D'Ávila");
  });
  it('remove sintaxe de filtro do PostgREST e curingas', () => {
    expect(sanitizeSearchTerm('a,personal_trainer_id.neq.x')).toBe('a personal trainer id neq x');
    expect(sanitizeSearchTerm('%(x)*')).toBe('x');
  });
  it('limita tamanho e trata não-string', () => {
    expect(sanitizeSearchTerm('a'.repeat(300))).toHaveLength(100);
    expect(sanitizeSearchTerm(null)).toBe('');
  });
});

// =============================================
// Alunos
// =============================================
describe('validateAlunoFields', () => {
  const today = '2026-10-07';
  const valido = { name: ' Ana ', birth_date: '1990-05-10', gender: 'FEMALE', height_cm: 165 };

  it('POST: exige os campos obrigatórios', () => {
    expect(validateAlunoFields({ name: 'Ana' }, false, today).error).toMatch(/obrigatórios/);
  });

  it('POST: normaliza campos válidos', () => {
    const r = validateAlunoFields({ ...valido, goal: ' Hipertrofia ', phone_number: '' }, false, today);
    expect(r.error).toBeNull();
    expect(r.value).toEqual({
      name: 'Ana', birth_date: '1990-05-10', gender: 'FEMALE', height_cm: 165, goal: 'Hipertrofia', phone_number: null,
    });
  });

  it('ignora lgpd_consent_status e outros campos fora da whitelist', () => {
    const r = validateAlunoFields(
      { ...valido, lgpd_consent_status: 'ACCEPTED', personal_trainer_id: UUID, deleted_at: null }, false, today,
    );
    expect(r.error).toBeNull();
    expect(r.value).not.toHaveProperty('lgpd_consent_status');
    expect(r.value).not.toHaveProperty('personal_trainer_id');
    expect(r.value).not.toHaveProperty('deleted_at');
  });

  it('PUT parcial: só lgpd_consent_status resulta em nenhuma atualização', () => {
    const r = validateAlunoFields({ lgpd_consent_status: 'ACCEPTED' }, true, today);
    expect(r.error).toBeNull();
    expect(r.value).toEqual({});
  });

  it('rejeita valores inválidos', () => {
    expect(validateAlunoFields({ gender: 'X' }, true, today).error).toMatch(/gender/);
    expect(validateAlunoFields({ height_cm: 300 }, true, today).error).toMatch(/height_cm/);
    expect(validateAlunoFields({ height_cm: 'abc' }, true, today).error).toMatch(/height_cm/);
    expect(validateAlunoFields({ name: 'A' }, true, today).error).toMatch(/name/);
    expect(validateAlunoFields({ birth_date: '2030-01-01' }, true, today).error).toMatch(/birth_date/);
    expect(validateAlunoFields({ birth_date: '1990-02-30' }, true, today).error).toMatch(/birth_date/);
    expect(validateAlunoFields({ phone_number: '<script>' }, true, today).error).toMatch(/phone_number/);
  });

  it('aceita telefone com máscara', () => {
    expect(validateAlunoFields({ phone_number: '(11) 98888-7777' }, true, today).value.phone_number).toBe('(11) 98888-7777');
  });
});

// =============================================
// Agenda
// =============================================
describe('parseAgendaRange', () => {
  const today = '2026-10-07';
  it('sem parâmetros usa hoje', () => {
    expect(parseAgendaRange(null, null, today)).toEqual({ from: today, to: today, error: null });
  });
  it('só from → mesmo dia', () => {
    expect(parseAgendaRange('2026-10-10', null, today)).toEqual({ from: '2026-10-10', to: '2026-10-10', error: null });
  });
  it('intervalo de semana', () => {
    expect(parseAgendaRange('2026-10-05', '2026-10-11', today).error).toBeNull();
  });
  it('rejeita formato inválido, to < from e intervalo grande demais', () => {
    expect(parseAgendaRange('10/05/2026', null, today).error).toMatch(/YYYY-MM-DD/);
    expect(parseAgendaRange('2026-10-11', '2026-10-05', today).error).toMatch(/maior ou igual/);
    expect(parseAgendaRange('2026-01-01', '2026-12-31', today).error).toMatch(new RegExp(String(AGENDA_MAX_RANGE_DAYS)));
  });
});

describe('validateAgendaInput', () => {
  it('criação: exige aluno_id, date e time', () => {
    expect(validateAgendaInput({ date: '2026-10-07', time: '08:00' }, false).error).toMatch(/obrigatórios/);
  });
  it('criação válida normaliza time e focus', () => {
    const r = validateAgendaInput({ aluno_id: UUID, date: '2026-10-07', time: '08:00:00', focus: '  Pernas ' }, false);
    expect(r.error).toBeNull();
    expect(r.value).toEqual({ aluno_id: UUID, date: '2026-10-07', time: '08:00', focus: 'Pernas' });
  });
  it('focus vazio vira null', () => {
    expect(validateAgendaInput({ focus: '   ' }, true).value.focus).toBeNull();
  });
  it('ignora campos desconhecidos (personal_trainer_id, id)', () => {
    const r = validateAgendaInput({ time: '09:00', personal_trainer_id: UUID, id: UUID }, true);
    expect(r.value).toEqual({ time: '09:00' });
  });
  it('edição sem campos válidos é erro', () => {
    expect(validateAgendaInput({ foo: 1 }, true).error).toMatch(/Nenhum campo/);
  });
  it('rejeita valores inválidos', () => {
    expect(validateAgendaInput({ aluno_id: 'x' }, true).error).toMatch(/aluno_id/);
    expect(validateAgendaInput({ date: '2026-13-01' }, true).error).toMatch(/date/);
    expect(validateAgendaInput({ time: '25:00' }, true).error).toMatch(/time/);
    expect(validateAgendaInput({ focus: 'x'.repeat(501) }, true).error).toMatch(/focus/);
    expect(validateAgendaInput({ focus: 42 }, true).error).toMatch(/focus/);
  });
});

// =============================================
// Upload de imagens
// =============================================
describe('stripDataUrl / base64DecodedSize', () => {
  it('remove prefixo data URL e espaços', () => {
    expect(stripDataUrl('data:image/png;base64,AAAA\nBBBB')).toBe('AAAABBBB');
    expect(stripDataUrl('AAAA')).toBe('AAAA');
  });
  it('calcula tamanho decodificado considerando padding', () => {
    expect(base64DecodedSize(toB64([1, 2, 3]))).toBe(3);
    expect(base64DecodedSize(toB64([1, 2]))).toBe(2);
    expect(base64DecodedSize(toB64([1]))).toBe(1);
    expect(base64DecodedSize('')).toBe(0);
  });
});

describe('detectImageMime', () => {
  it('detecta PNG, JPEG e WEBP pelos magic bytes', () => {
    expect(detectImageMime(Uint8Array.from(PNG_HEADER))).toBe('image/png');
    expect(detectImageMime(Uint8Array.from(JPEG_HEADER))).toBe('image/jpeg');
    expect(detectImageMime(Uint8Array.from(WEBP_HEADER))).toBe('image/webp');
  });
  it('não reconhece HTML/SVG/PDF', () => {
    expect(detectImageMime(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(detectImageMime(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
  });
});

describe('decodeImageBase64', () => {
  const opts = { maxBytes: 1024, allowed: ['image/png' as const] };

  it('aceita PNG válido (com ou sem prefixo data URL)', () => {
    const b64 = toB64(pad(PNG_HEADER, 200));
    const r = decodeImageBase64(b64, opts);
    expect(r.error).toBeNull();
    expect(r.mime).toBe('image/png');
    expect(r.bytes?.length).toBe(200);
    expect(decodeImageBase64(`data:image/png;base64,${b64}`, opts).error).toBeNull();
  });

  it('rejeita tipo real diferente do permitido (JPEG renomeado como PNG)', () => {
    expect(decodeImageBase64(toB64(pad(JPEG_HEADER, 200)), opts).error).toMatch(/Formato/);
  });

  it('rejeita conteúdo que não é imagem', () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
    expect(decodeImageBase64(html, { maxBytes: 1024, allowed: ['image/jpeg', 'image/png', 'image/webp'] }).error).toMatch(/Formato/);
  });

  it('rejeita acima do limite de tamanho sem decodificar', () => {
    expect(decodeImageBase64(toB64(pad(PNG_HEADER, 2048)), opts).error).toMatch(/limite/);
  });

  it('rejeita base64 malformado, vazio ou não-string', () => {
    expect(decodeImageBase64('@@@@', opts).error).toMatch(/base64/);
    expect(decodeImageBase64('', opts).error).toMatch(/não informada/);
    expect(decodeImageBase64(123, opts).error).toMatch(/não informada/);
  });
});

// =============================================
// Assinatura LGPD
// =============================================
describe('storagePathFromSignedUrl', () => {
  const bucket = 'lgpd-assinaturas';
  const path = `c70d9df8-4613-4a0d-9bb7-6df81d579f21/${UUID}/assinatura_lgpd_v1.0_1781309714981.png`;

  it('extrai o caminho de uma URL assinada antiga', () => {
    const url = `https://qhdkacasbbfilqqywosj.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=abc.def.ghi`;
    expect(storagePathFromSignedUrl(url, bucket)).toBe(path);
  });

  it('decodifica caracteres escapados', () => {
    const url = `https://x.supabase.co/storage/v1/object/sign/${bucket}/a/b/arquivo%20v1.png?token=t`;
    expect(storagePathFromSignedUrl(url, bucket)).toBe('a/b/arquivo v1.png');
  });

  it('retorna null para outro bucket, URL inválida, vazia ou com ..', () => {
    expect(storagePathFromSignedUrl(`https://x.supabase.co/storage/v1/object/sign/fotos-alunos/${path}?token=t`, bucket)).toBeNull();
    expect(storagePathFromSignedUrl('não é url', bucket)).toBeNull();
    expect(storagePathFromSignedUrl('', bucket)).toBeNull();
    expect(storagePathFromSignedUrl(null, bucket)).toBeNull();
    expect(storagePathFromSignedUrl(`https://x.supabase.co/storage/v1/object/sign/${bucket}/a%2F..%2Fb.png?token=t`, bucket)).toBeNull();
  });
});
