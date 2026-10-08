import { handleCors, jsonResponse, errorResponse, handleError } from '../_shared/cors.ts';
import { getAuthUser } from '../_shared/supabase.ts';
import { isUuid, validateAlunoFields } from '../_shared/validation.ts';

const BUCKET = 'fotos-alunos';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, client } = await getAuthUser(req);
    const url = new URL(req.url);
    const id = url.pathname.split('/').filter(Boolean).pop();
    if (!id) return errorResponse('ID do aluno não informado');
    if (!isUuid(id)) return errorResponse('Aluno não encontrado', 404);

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
        // Ignora itens sem caminho/URL (ex.: objeto ausente no Storage) — a foto sai com url: null
        const urlByPath = new Map<string, string>();
        for (const s of signed ?? []) {
          if (s.path && s.signedUrl && !s.error) urlByPath.set(s.path, s.signedUrl);
        }
        aluno.fotos = aluno.fotos.map((foto: { storage_path: string }) => ({
          ...foto,
          url: urlByPath.get(foto.storage_path) ?? null,
        }));
      }

      return jsonResponse(aluno);
    }

    if (req.method === 'PUT') {
      const body = (await req.json()) ?? {};
      // Whitelist sem lgpd_consent_status: o consentimento só muda via lgpd-sign,
      // depois de uma assinatura real do aluno (o valor enviado pelo cliente é ignorado).
      const { value: updates, error: validationErr } = validateAlunoFields(body, true);
      if (validationErr) return errorResponse(validationErr);

      // Confirma que o aluno é do personal e não está na lixeira antes de mexer em qualquer coisa
      const { data: existingAluno } = await client
        .from('alunos')
        .select('id')
        .eq('id', id)
        .eq('personal_trainer_id', user.id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!existingAluno) return errorResponse('Aluno não encontrado', 404);

      let data: unknown = existingAluno;
      if (Object.keys(updates).length) {
        const { data: updated, error } = await client
          .from('alunos')
          .update(updates)
          .eq('id', id)
          .eq('personal_trainer_id', user.id)
          .select()
          .single();
        if (error) throw error;
        data = updated;
      } else {
        const { data: current, error } = await client.from('alunos').select().eq('id', id).single();
        if (error) throw error;
        data = current;
      }

      if (body.anamnesis && typeof body.anamnesis === 'object') {
        const ana = body.anamnesis;
        const texto = (v: unknown) => (typeof v === 'string' ? v.slice(0, 2000) : '');
        const anaFields = {
          cardiac_condition: ana.cardiac_condition === true,
          joint_pain: ana.joint_pain === true,
          chest_pain_during_exercise: ana.chest_pain_during_exercise === true,
          recent_surgery_description: texto(ana.recent_surgery_description),
          active_medications: texto(ana.active_medications),
          notes: texto(ana.notes),
        };
        // aluno_id é UNIQUE em anamneses: upsert substitui o update/insert em duas etapas
        const { error: anaErr } = await client
          .from('anamneses')
          .upsert({ aluno_id: id, ...anaFields }, { onConflict: 'aluno_id' });
        if (anaErr) throw anaErr;
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
    return handleError(err);
  }
});
