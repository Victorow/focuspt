import { handleCors, jsonResponse, errorResponse, handleError } from '../_shared/cors.ts';
import { getAuthUser } from '../_shared/supabase.ts';
import { isUuid } from '../_shared/validation.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, client } = await getAuthUser(req);
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const avaliacaoId = parts.pop();
    if (!avaliacaoId) return errorResponse('ID da avaliação não informado');
    if (!isUuid(avaliacaoId)) return errorResponse('Avaliação não encontrada', 404);

    if (req.method === 'GET') {
      const { data, error } = await client
        .from('avaliacoes')
        .select(`
          *,
          bioimpedancias(*),
          dobras_cutaneas(*),
          circunferencias(*),
          alunos!inner(id, name, birth_date, gender, height_cm, phone_number, personal_trainer_id)
        `)
        .eq('id', avaliacaoId)
        .eq('alunos.personal_trainer_id', user.id)
        .is('deleted_at', null)
        .single();

      if (error) return errorResponse('Avaliação não encontrada', 404);
      return jsonResponse(data);
    }

    if (req.method === 'DELETE') {
      // Verify ownership via join
      const { data: av, error: checkErr } = await client
        .from('avaliacoes')
        .select('id, alunos!inner(personal_trainer_id)')
        .eq('id', avaliacaoId)
        .eq('alunos.personal_trainer_id', user.id)
        .single();

      if (checkErr || !av) return errorResponse('Avaliação não encontrada ou sem permissão', 403);

      // Soft-delete: marca a data em vez de apagar fisicamente. O registro sai
      // das telas mas continua no banco e pode ser restaurado pela lixeira.
      const { error } = await client
        .from('avaliacoes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', avaliacaoId)
        .is('deleted_at', null);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (req.method === 'PATCH') {
      // Restaurar da lixeira
      const { data: av, error: checkErr } = await client
        .from('avaliacoes')
        .select('id, alunos!inner(personal_trainer_id)')
        .eq('id', avaliacaoId)
        .eq('alunos.personal_trainer_id', user.id)
        .single();

      if (checkErr || !av) return errorResponse('Avaliação não encontrada ou sem permissão', 403);

      const { error } = await client
        .from('avaliacoes')
        .update({ deleted_at: null })
        .eq('id', avaliacaoId);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    return errorResponse('Method not allowed', 405);
  } catch (err) {
    return handleError(err);
  }
});
