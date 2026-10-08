// deno-lint-ignore-file
// Espelho (Deno) de src/tests/validation.spec.ts — mesmos helpers, rodando no runtime das Edge Functions.
import { assert, assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  isUuid, isIsoDate, normalizeTime, daysBetween, todayInTimeZone, sanitizeSearchTerm,
  validateAlunoFields, parseAgendaRange, validateAgendaInput, AGENDA_MAX_RANGE_DAYS,
  stripDataUrl, base64DecodedSize, detectImageMime, decodeImageBase64, storagePathFromSignedUrl,
} from '../_shared/validation.ts';

const UUID = '86b74477-b02b-445a-90f4-f6b603a1d8bc';
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0];
const WEBP_HEADER = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const toB64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
const pad = (h: number[], total: number) => [...h, ...new Array(Math.max(0, total - h.length)).fill(0)];

// ---- Tipos básicos ----
Deno.test('isUuid', () => {
  assert(isUuid(UUID));
  assert(!isUuid('abc'));
  assert(!isUuid(''));
  assert(!isUuid(123));
  assert(!isUuid(`${UUID},id.neq.x`));
});

Deno.test('isIsoDate', () => {
  assert(isIsoDate('2026-10-07'));
  assert(isIsoDate('2024-02-29'));
  assert(!isIsoDate('2026-02-30'));
  assert(!isIsoDate('2025-02-29'));
  assert(!isIsoDate('07/10/2026'));
  assert(!isIsoDate('../../x'));
  assert(!isIsoDate(null));
});

Deno.test('normalizeTime', () => {
  assertEquals(normalizeTime('07:30'), '07:30');
  assertEquals(normalizeTime('23:59:59'), '23:59');
  assertEquals(normalizeTime('24:00'), null);
  assertEquals(normalizeTime('7:30'), null);
  assertEquals(normalizeTime(730), null);
});

Deno.test('daysBetween / todayInTimeZone (Brasília vs UTC)', () => {
  assertEquals(daysBetween('2026-10-01', '2026-10-07'), 6);
  const now = new Date('2026-10-08T02:00:00Z');
  assertEquals(todayInTimeZone(now, 'America/Sao_Paulo'), '2026-10-07');
  assertEquals(todayInTimeZone(now, 'UTC'), '2026-10-08');
});

Deno.test('sanitizeSearchTerm', () => {
  assertEquals(sanitizeSearchTerm('Maria Silva'), 'Maria Silva');
  assertEquals(sanitizeSearchTerm('a,personal_trainer_id.neq.x'), 'a personal trainer id neq x');
  assertEquals(sanitizeSearchTerm('%(x)*'), 'x');
  assertEquals(sanitizeSearchTerm('a'.repeat(300)).length, 100);
  assertEquals(sanitizeSearchTerm(null), '');
});

// ---- Alunos ----
Deno.test('validateAlunoFields - ignora lgpd_consent_status e campos fora da whitelist', () => {
  const today = '2026-10-07';
  const r = validateAlunoFields(
    { name: ' Ana ', birth_date: '1990-05-10', gender: 'FEMALE', height_cm: 165, lgpd_consent_status: 'ACCEPTED', personal_trainer_id: UUID },
    false, today,
  );
  assertEquals(r.error, null);
  assertEquals(r.value, { name: 'Ana', birth_date: '1990-05-10', gender: 'FEMALE', height_cm: 165 });
  assertEquals(validateAlunoFields({ lgpd_consent_status: 'ACCEPTED' }, true, today), { value: {}, error: null });
});

Deno.test('validateAlunoFields - obrigatórios e valores inválidos', () => {
  const today = '2026-10-07';
  assertMatch(validateAlunoFields({ name: 'Ana' }, false, today).error!, /obrigatórios/);
  assertMatch(validateAlunoFields({ gender: 'X' }, true, today).error!, /gender/);
  assertMatch(validateAlunoFields({ height_cm: 300 }, true, today).error!, /height_cm/);
  assertMatch(validateAlunoFields({ birth_date: '2030-01-01' }, true, today).error!, /birth_date/);
  assertMatch(validateAlunoFields({ phone_number: '<script>' }, true, today).error!, /phone_number/);
  assertEquals(validateAlunoFields({ phone_number: '(11) 98888-7777' }, true, today).value.phone_number, '(11) 98888-7777');
});

// ---- Agenda ----
Deno.test('parseAgendaRange', () => {
  const today = '2026-10-07';
  assertEquals(parseAgendaRange(null, null, today), { from: today, to: today, error: null });
  assertEquals(parseAgendaRange('2026-10-10', null, today), { from: '2026-10-10', to: '2026-10-10', error: null });
  assertEquals(parseAgendaRange('2026-10-05', '2026-10-11', today).error, null);
  assertMatch(parseAgendaRange('10/05/2026', null, today).error!, /YYYY-MM-DD/);
  assertMatch(parseAgendaRange('2026-10-11', '2026-10-05', today).error!, /maior ou igual/);
  assertMatch(parseAgendaRange('2026-01-01', '2026-12-31', today).error!, new RegExp(String(AGENDA_MAX_RANGE_DAYS)));
});

Deno.test('validateAgendaInput', () => {
  assertMatch(validateAgendaInput({ date: '2026-10-07', time: '08:00' }, false).error!, /obrigatórios/);
  assertEquals(
    validateAgendaInput({ aluno_id: UUID, date: '2026-10-07', time: '08:00:00', focus: '  Pernas ' }, false),
    { value: { aluno_id: UUID, date: '2026-10-07', time: '08:00', focus: 'Pernas' }, error: null },
  );
  assertEquals(validateAgendaInput({ focus: '   ' }, true).value.focus, null);
  assertEquals(validateAgendaInput({ time: '09:00', personal_trainer_id: UUID, id: UUID }, true).value, { time: '09:00' });
  assertMatch(validateAgendaInput({ foo: 1 }, true).error!, /Nenhum campo/);
  assertMatch(validateAgendaInput({ aluno_id: 'x' }, true).error!, /aluno_id/);
  assertMatch(validateAgendaInput({ time: '25:00' }, true).error!, /time/);
  assertMatch(validateAgendaInput({ focus: 'x'.repeat(501) }, true).error!, /focus/);
});

// ---- Imagens ----
Deno.test('stripDataUrl / base64DecodedSize', () => {
  assertEquals(stripDataUrl('data:image/png;base64,AAAA\nBBBB'), 'AAAABBBB');
  assertEquals(base64DecodedSize(toB64([1, 2, 3])), 3);
  assertEquals(base64DecodedSize(toB64([1, 2])), 2);
  assertEquals(base64DecodedSize(toB64([1])), 1);
});

Deno.test('detectImageMime', () => {
  assertEquals(detectImageMime(Uint8Array.from(PNG_HEADER)), 'image/png');
  assertEquals(detectImageMime(Uint8Array.from(JPEG_HEADER)), 'image/jpeg');
  assertEquals(detectImageMime(Uint8Array.from(WEBP_HEADER)), 'image/webp');
  assertEquals(detectImageMime(new TextEncoder().encode('<svg onload=alert(1)>')), null);
});

Deno.test('decodeImageBase64 - aceita PNG e rejeita o resto sem bytes', () => {
  const opts = { maxBytes: 1024, allowed: ['image/png' as const] };
  const ok = decodeImageBase64(toB64(pad(PNG_HEADER, 200)), opts);
  assertEquals(ok.error, null);
  assertEquals(ok.mime, 'image/png');
  assertEquals(ok.bytes?.length, 200);

  for (const bad of [
    toB64(pad(JPEG_HEADER, 200)),          // tipo real diferente
    btoa('<html><script>x</script></html>'), // não é imagem
    toB64(pad(PNG_HEADER, 2048)),          // acima do limite
    '@@@@', '', 123,                        // malformado / vazio / não-string
  ]) {
    const r = decodeImageBase64(bad, opts);
    assert(typeof r.error === 'string' && r.error.length > 0);
    assertEquals(r.bytes, null);
    assertEquals(r.mime, null);
  }
});

// ---- Assinatura LGPD ----
Deno.test('storagePathFromSignedUrl', () => {
  const bucket = 'lgpd-assinaturas';
  const path = `c70d9df8-4613-4a0d-9bb7-6df81d579f21/${UUID}/assinatura_lgpd_v1.0_1781309714981.png`;
  assertEquals(
    storagePathFromSignedUrl(`https://qhdkacasbbfilqqywosj.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=abc`, bucket),
    path,
  );
  assertEquals(storagePathFromSignedUrl(`https://x.supabase.co/storage/v1/object/sign/fotos-alunos/${path}?token=t`, bucket), null);
  assertEquals(storagePathFromSignedUrl('não é url', bucket), null);
  assertEquals(storagePathFromSignedUrl(null, bucket), null);
  assertEquals(storagePathFromSignedUrl(`https://x.supabase.co/storage/v1/object/sign/${bucket}/a%2F..%2Fb.png?token=t`, bucket), null);
});
