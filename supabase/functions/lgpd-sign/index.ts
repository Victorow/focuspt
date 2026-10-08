import { handleCors, jsonResponse, errorResponse, handleError } from '../_shared/cors.ts';
import { getAuthUser, getSupabaseAdmin } from '../_shared/supabase.ts';
import { decodeImageBase64, isUuid, storagePathFromSignedUrl } from '../_shared/validation.ts';

const BUCKET = 'lgpd-assinaturas';
const TERM_VERSION = '1.0';
// URL assinada curta, gerada a cada leitura (o banco guarda só o caminho no Storage)
const SIGNED_URL_TTL_S = 60 * 60; // 1 hora
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024; // mesmo limite do bucket

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, client } = await getAuthUser(req);
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);

    // GET /lgpd-sign/:alunoId — verifica se já tem assinatura
    if (req.method === 'GET') {
      const alunoId = parts.pop();
      if (!alunoId) return errorResponse('ID do aluno não informado');
      if (!isUuid(alunoId)) return jsonResponse({ signed: false });

      // RLS limita lgpd_assinaturas aos alunos do personal logado
      const { data, error } = await client
        .from('lgpd_assinaturas')
        .select('id, signed_at, term_version, signature_storage_path, signature_url')
        .eq('aluno_id', alunoId)
        .maybeSingle();

      if (error || !data) return jsonResponse({ signed: false });

      // Registros antigos também guardam uma URL de 10 anos em signature_url; ela nunca é
      // devolvida. Usa o caminho salvo (ou, se faltar, o extraído da URL antiga).
      const path = data.signature_storage_path || storagePathFromSignedUrl(data.signature_url, BUCKET);
      let signedUrl: string | null = null;
      if (path) {
        // Client do usuário: a policy do Storage exige que a 1ª pasta do caminho seja o uid
        const { data: signed } = await client.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_S);
        signedUrl = signed?.signedUrl ?? null;
      }

      return jsonResponse({
        signed: true,
        id: data.id,
        signed_at: data.signed_at,
        term_version: data.term_version,
        signature_url: signedUrl,
        signature_url_expires_in: SIGNED_URL_TTL_S,
      });
    }

    // POST /lgpd-sign — salva assinatura
    if (req.method === 'POST') {
      const body = (await req.json()) ?? {};
      const { aluno_id, signature_base64 } = body;

      if (!aluno_id || !signature_base64) {
        return errorResponse('Campos obrigatórios: aluno_id, signature_base64');
      }
      if (!isUuid(aluno_id)) return errorResponse('Aluno não encontrado ou sem permissão', 403);

      // Verifica propriedade (e que o aluno não está na lixeira)
      const { data: aluno } = await client
        .from('alunos')
        .select('id')
        .eq('id', aluno_id)
        .eq('personal_trainer_id', user.id)
        .is('deleted_at', null)
        .maybeSingle();

      if (!aluno) return errorResponse('Aluno não encontrado ou sem permissão', 403);

      // Valida que a assinatura não está vazia (deve ser PNG base64 não trivial)
      if (typeof signature_base64 !== 'string' || signature_base64.length < 100) {
        return errorResponse('Assinatura inválida ou em branco');
      }
      const img = decodeImageBase64(signature_base64, { maxBytes: MAX_SIGNATURE_BYTES, allowed: ['image/png'] });
      // Rejeita (400) antes do upload qualquer caso sem bytes válidos
      if (img.error !== null || !img.bytes) return errorResponse(`Assinatura inválida: ${img.error ?? 'imagem inválida'}`);

      const admin = getSupabaseAdmin();
      const storagePath = `${user.id}/${aluno_id}/assinatura_lgpd_v${TERM_VERSION}_${Date.now()}.png`;

      // Upload da assinatura (bucket privado)
      const { error: uploadErr } = await admin.storage
        .from(BUCKET)
        .upload(storagePath, img.bytes, { contentType: 'image/png', upsert: false });

      if (uploadErr) throw uploadErr;

      // Upsert na tabela (UNIQUE em aluno_id — substitui se já existir).
      // Só o caminho é a referência válida; signature_url é NOT NULL no schema atual,
      // então grava '' até a coluna ser removida/tornada opcional (ver relatório).
      const { data: lgpd, error: lgpdErr } = await client
        .from('lgpd_assinaturas')
        .upsert({
          aluno_id,
          signature_storage_path: storagePath,
          signature_url: '',
          term_version: TERM_VERSION,
          signed_at: new Date().toISOString(),
        }, { onConflict: 'aluno_id' })
        .select('signed_at, term_version')
        .single();

      if (lgpdErr) throw lgpdErr;

      // Atualiza status LGPD do aluno — único ponto do sistema que marca ACCEPTED
      const { error: updateErr } = await client
        .from('alunos')
        .update({ lgpd_consent_status: 'ACCEPTED' })
        .eq('id', aluno_id)
        .eq('personal_trainer_id', user.id);

      if (updateErr) throw updateErr;

      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_S);

      return jsonResponse({
        success: true,
        signed_at: lgpd.signed_at,
        term_version: lgpd.term_version,
        signature_url: signed?.signedUrl ?? null,
        signature_url_expires_in: SIGNED_URL_TTL_S,
      }, 201);
    }

    return errorResponse('Method not allowed', 405);
  } catch (err) {
    return handleError(err);
  }
});
