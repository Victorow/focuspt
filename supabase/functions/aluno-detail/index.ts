import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthUser } from '../_shared/supabase.ts';

const BUCKET = 'fotos-alunos';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, client } = await getAuthUser(req);
    const url = new URL(req.url);
    const id = url.pathname.split('/').filter(Boolean).pop();
    if (!id) return errorResponse('ID do aluno não informado');

    if (req.method === 'GET') {
      const { data: aluno, error } = await client
        .from('alunos')
        .select(`
          *,
          anamneses(*),
          avaliacoes(
            id, date, bmi, bmi_classification, body_fat_percentage, fat_mass_kg,
            lean_mass_kg, body_fat_classification, visceral_risk,
            skinfolds_fat_percentage, skinfolds_sum_mm, rcq, observacoes,
            last_menstruation_date, menstrual_cycle_regular,
            bioimpedancias(*),
            dobras_cutaneas(*),
            circunferencias(*)
          ),
          fotos(*)
        `)
        .eq('id', id)
        .eq('personal_trainer_id', user.id)
        .is('deleted_at', null)
        .is('avaliacoes.deleted_at', null)
        .order('date', { referencedTable: 'avaliacoes', ascending: false })
        .order('date', { referencedTable: 'fotos', ascending: false })
        .single();

      if (error) return errorResponse('Aluno não encontrado', 404);

      // Avaliações na lixeira (soft-deleted) — listadas à parte para permitir restaurar.
      const { data: trashed } = await client
        .from('avaliacoes')
        .select(`
          id, date, bmi, bmi_classification, body_fat_percentage, fat_mass_kg,
          lean_mass_kg, body_fat_classification, visceral_risk,
          skinfolds_fat_percentage, skinfolds_sum_mm, rcq, observacoes, deleted_at,
          last_menstruation_date, menstrual_cycle_regular,
          bioimpedancias(*),
          dobras_cutaneas(*),
          circunferencias(*)
        `)
        .eq('aluno_id', id)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
      aluno.avaliacoes_trash = trashed ?? [];

      // Bucket privado (LGPD): gera URL assinada temporária para cada foto.
      if (aluno?.fotos?.length) {
        const paths = aluno.fotos.map((f: { storage_path: string }) => f.storage_path);
        const { data: signed } = await client.storage.from(BUCKET).createSignedUrls(paths, 3600);
        const urlByPath = new Map<string, string>(
          (signed ?? []).map((s: { path: string | null; signedUrl: string }) => [s.path ?? '', s.signedUrl]),
        );
        aluno.fotos = aluno.fotos.map((foto: { storage_path: string }) => ({
          ...foto,
          url: urlByPath.get(foto.storage_path) ?? null,
        }));
      }

      return jsonResponse(aluno);
    }

    if (req.method === 'PUT') {
      const body = await req.json();
      const allowed = ['name', 'birth_date', 'gender', 'height_cm', 'goal', 'phone_number', 'lgpd_consent_status'];
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in body) updates[key] = body[key];
      }

      const { data, error } = await client
        .from('alunos')
        .update(updates)
        .eq('id', id)
        .eq('personal_trainer_id', user.id)
        .select()
        .single();

      if (error) throw error;

      if (body.anamnesis) {
        const ana = body.anamnesis;
        const anaFields = {
          cardiac_condition: ana.cardiac_condition ?? false,
          joint_pain: ana.joint_pain ?? false,
          chest_pain_during_exercise: ana.chest_pain_during_exercise ?? false,
          recent_surgery_description: ana.recent_surgery_description ?? '',
          active_medications: ana.active_medications ?? '',
          notes: ana.notes ?? '',
        };
        const { data: existing } = await client
          .from('anamneses')
          .select('id')
          .eq('aluno_id', id)
          .maybeSingle();
        if (existing) {
          await client.from('anamneses').update(anaFields).eq('aluno_id', id);
        } else {
          await client.from('anamneses').insert({ aluno_id: id, ...anaFields });
        }
      }

      return jsonResponse(data);
    }

    if (req.method === 'DELETE') {
      // Soft-delete: move o aluno para a lixeira. As avaliações/fotos ficam
      // preservadas e tudo pode ser restaurado depois.
      const { error } = await client
        .from('alunos')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('personal_trainer_id', user.id)
        .is('deleted_at', null);

      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (req.method === 'PATCH') {
      // Restaurar aluno da lixeira
      const { error } = await client
        .from('alunos')
        .update({ deleted_at: null })
        .eq('id', id)
        .eq('personal_trainer_id', user.id);

      if (error) throw error;
      return jsonResponse({ success: true });
    }

    return errorResponse('Method not allowed', 405);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return errorResponse('Unauthorized', 401);
    return errorResponse(msg, 500);
  }
});
