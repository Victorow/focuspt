import { handleCors, jsonResponse, errorResponse, handleError } from '../_shared/cors.ts';
import { getAuthUser } from '../_shared/supabase.ts';
import { sanitizeSearchTerm, validateAlunoFields } from '../_shared/validation.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, client } = await getAuthUser(req);

    if (req.method === 'GET') {
      const url = new URL(req.url);
      // Termo saneado: impede injetar filtros extras na sintaxe do .or() do PostgREST
      const search = sanitizeSearchTerm(url.searchParams.get('search'));

      // Lixeira: alunos soft-deletados (lidos da tabela, pois a view os oculta)
      if (url.searchParams.get('trash') === '1') {
        const { data, error } = await client
          .from('alunos')
          .select('id, name, goal, gender, deleted_at')
          .eq('personal_trainer_id', user.id)
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false });
        if (error) throw error;
        return jsonResponse(data ?? []);
      }

      let query = client
        .from('aluno_summary')
        .select('*')
        .eq('personal_trainer_id', user.id)
        .order('name');

      if (search) {
        query = query.or(
          `name.ilike.%${search}%,goal.ilike.%${search}%,phone_number.ilike.%${search}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      // lgpd_signature_url (da view) pode conter URL assinada de longa duração de registros
      // antigos — não é usada pela lista e não deve sair para o cliente.
      const rows = (data ?? []).map(({ lgpd_signature_url: _omit, ...rest }: Record<string, unknown>) => rest);
      return jsonResponse(rows);
    }

    if (req.method === 'POST') {
      const body = (await req.json()) ?? {};

      const { anamnesis } = body;
      const { value: fields, error: validationErr } = validateAlunoFields(body, false);
      if (validationErr) return errorResponse(validationErr);

      const { data: aluno, error: alunoError } = await client
        .from('alunos')
        .insert({
          personal_trainer_id: user.id,
          name: fields.name,
          birth_date: fields.birth_date,
          gender: fields.gender,
          height_cm: fields.height_cm,
          goal: fields.goal ?? '',
          phone_number: fields.phone_number ?? null,
          // Todo aluno novo começa PENDING; o valor enviado pelo cliente é ignorado.
          // Só o lgpd-sign muda para ACCEPTED, após a assinatura do termo.
          lgpd_consent_status: 'PENDING',
        })
        .select()
        .single();

      if (alunoError) throw alunoError;

      if (anamnesis && typeof anamnesis === 'object') {
        const texto = (v: unknown) => (typeof v === 'string' ? v.slice(0, 2000) : '');
        const { error: anaError } = await client.from('anamneses').insert({
          aluno_id: aluno.id,
          cardiac_condition: anamnesis.cardiac_condition === true,
          joint_pain: anamnesis.joint_pain === true,
          chest_pain_during_exercise: anamnesis.chest_pain_during_exercise === true,
          recent_surgery_description: texto(anamnesis.recent_surgery_description),
          active_medications: texto(anamnesis.active_medications),
          notes: texto(anamnesis.notes),
        });
        if (anaError) throw anaError;
      }

      return jsonResponse(aluno, 201);
    }

    return errorResponse('Method not allowed', 405);
  } catch (err) {
    return handleError(err);
  }
});
