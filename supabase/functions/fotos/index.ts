import { handleCors, jsonResponse, errorResponse, handleError } from '../_shared/cors.ts';
import { getAuthUser, getSupabaseAdmin } from '../_shared/supabase.ts';
import { decodeImageBase64, IMAGE_EXT, isIsoDate, isUuid } from '../_shared/validation.ts';

const BUCKET = 'fotos-alunos';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // mesmo limite do bucket

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, client } = await getAuthUser(req);
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'POST') {
      const body = (await req.json()) ?? {};
      const { aluno_id, date, category, image_base64 } = body;

      if (!aluno_id || !date || !category || !image_base64) {
        return errorResponse('Campos obrigatórios: aluno_id, date, category, image_base64');
      }
      if (!['FRENTE', 'LADO_DIREITO', 'LADO_ESQUERDO', 'COSTAS'].includes(category)) {
        return errorResponse('category inválida. Use: FRENTE, LADO_DIREITO, LADO_ESQUERDO ou COSTAS');
      }
      // date entra no caminho do Storage: só aceita YYYY-MM-DD
      if (!isIsoDate(date)) return errorResponse('date inválida (use YYYY-MM-DD)');
      if (!isUuid(aluno_id)) return errorResponse('Aluno não encontrado ou sem permissão', 403);

      // Tipo real (magic bytes) e tamanho — o mime_type enviado pelo cliente não é confiável
      const img = decodeImageBase64(image_base64, {
        maxBytes: MAX_PHOTO_BYTES,
        allowed: ['image/jpeg', 'image/png', 'image/webp'],
      });
      // Rejeita (400) antes do upload qualquer caso sem bytes/tipo válidos
      if (img.error !== null || !img.bytes || !img.mime) return errorResponse(img.error ?? 'Imagem inválida');

      // Verify ownership
      const { error: alunoErr } = await client
        .from('alunos')
        .select('id')
        .eq('id', aluno_id)
        .eq('personal_trainer_id', user.id)
        .is('deleted_at', null)
        .single();

      if (alunoErr) return errorResponse('Aluno não encontrado ou sem permissão', 403);

      // Upload to Supabase Storage
      const admin = getSupabaseAdmin();
      const storagePath = `${user.id}/${aluno_id}/${date}_${category}_${Date.now()}.${IMAGE_EXT[img.mime]}`;

      const { error: uploadErr } = await admin.storage
        .from(BUCKET)
        .upload(storagePath, img.bytes, {
          contentType: img.mime,
          upsert: false,
        });

      if (uploadErr) throw uploadErr;

      const { data: foto, error: fotoErr } = await client
        .from('fotos')
        .insert({ aluno_id, date, category, storage_path: storagePath })
        .select()
        .single();

      if (fotoErr) {
        // Não deixa arquivo órfão no Storage se o registro não foi criado
        await admin.storage.from(BUCKET).remove([storagePath]);
        throw fotoErr;
      }

      // Bucket privado (LGPD): retorna URL assinada temporária
      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
      return jsonResponse({ ...foto, url: signed?.signedUrl ?? null }, 201);
    }

    if (req.method === 'DELETE') {
      const fotoId = parts.pop();
      if (!fotoId) return errorResponse('ID da foto não informado');
      if (!isUuid(fotoId)) return errorResponse('Foto não encontrada ou sem permissão', 403);

      const { data: foto, error: findErr } = await client
        .from('fotos')
        .select('id, storage_path, aluno_id, alunos!inner(personal_trainer_id)')
        .eq('id', fotoId)
        .eq('alunos.personal_trainer_id', user.id)
        .single();

      if (findErr || !foto) return errorResponse('Foto não encontrada ou sem permissão', 403);

      const admin = getSupabaseAdmin();
      await admin.storage.from(BUCKET).remove([foto.storage_path]);

      const { error } = await client.from('fotos').delete().eq('id', fotoId);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    return errorResponse('Method not allowed', 405);
  } catch (err) {
    return handleError(err);
  }
});
