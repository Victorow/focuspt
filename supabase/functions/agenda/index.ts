import { handleCors, jsonResponse, errorResponse, handleError } from '../_shared/cors.ts';
import { getAuthUser } from '../_shared/supabase.ts';
import { isUuid, parseAgendaRange, todayInTimeZone, validateAgendaInput } from '../_shared/validation.ts';

// Colunas devolvidas; o join com alunos passa pela RLS (só alunos do personal logado)
const SELECT = 'id, date, time, focus, aluno_id, created_at, alunos(name, deleted_at)';

interface AgendaRow {
  id: string;
  date: string;
  time: string;
  focus: string | null;
  aluno_id: string | null;
  created_at: string;
  alunos: { name: string; deleted_at: string | null } | null;
}

// Formato de saída: achata o nome do aluno e devolve o horário como HH:MM
function toItem(row: AgendaRow) {
  return {
    id: row.id,
    date: row.date,
    time: row.time?.slice(0, 5) ?? row.time,
    focus: row.focus,
    aluno_id: row.aluno_id,
    student_name: row.alunos?.name ?? null,
    created_at: row.created_at,
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, client } = await getAuthUser(req);
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    // id aceito em /agenda/:id, em ?id= ou no corpo { id } (PUT/DELETE)
    const last = parts[parts.length - 1];
    const pathId = last && last !== 'agenda' ? last : null;
    const resolveId = (body: Record<string, unknown> | null): string | null =>
      pathId ?? url.searchParams.get('id') ?? (typeof body?.id === 'string' ? body.id : null);

    // Confere que o aluno é do personal e não está na lixeira
    const alunoValido = async (alunoId: string) => {
      const { data } = await client
        .from('alunos')
        .select('id')
        .eq('id', alunoId)
        .eq('personal_trainer_id', user.id)
        .is('deleted_at', null)
        .maybeSingle();
      return !!data;
    };

    // GET /agenda?from=YYYY-MM-DD&to=YYYY-MM-DD (padrão: hoje em America/Sao_Paulo)
    if (req.method === 'GET') {
      // ?date= mantido por compatibilidade (equivale a from=to=date)
      const legacyDate = url.searchParams.get('date');
      const range = parseAgendaRange(
        url.searchParams.get('from') ?? legacyDate,
        url.searchParams.get('to') ?? legacyDate,
        todayInTimeZone(),
      );
      if (range.error) return errorResponse(range.error);

      const { data, error } = await client
        .from('agenda')
        .select(SELECT)
        .eq('personal_trainer_id', user.id)
        .gte('date', range.from)
        .lte('date', range.to)
        .order('date')
        .order('time');
      if (error) throw error;

      // Esconde compromissos de alunos que estão na lixeira
      const items = ((data ?? []) as unknown as AgendaRow[])
        .filter((r) => !r.alunos?.deleted_at)
        .map(toItem);
      return jsonResponse(items);
    }

    // POST /agenda  { aluno_id, date, time, focus? }
    if (req.method === 'POST') {
      const body = (await req.json()) ?? {};
      const { value, error: validationErr } = validateAgendaInput(body, false);
      if (validationErr) return errorResponse(validationErr);
      if (!(await alunoValido(value.aluno_id!))) return errorResponse('Aluno não encontrado ou sem permissão', 403);

      const { data, error } = await client
        .from('agenda')
        .insert({
          personal_trainer_id: user.id,
          aluno_id: value.aluno_id,
          date: value.date,
          time: value.time,
          focus: value.focus ?? null,
        })
        .select(SELECT)
        .single();

      if (error) throw error;
      return jsonResponse(toItem(data as unknown as AgendaRow), 201);
    }

    // PUT /agenda/:id  (ou ?id= / { id } no corpo)  { aluno_id?, date?, time?, focus? }
    if (req.method === 'PUT') {
      const body = (await req.json()) ?? {};
      const id = resolveId(body);
      if (!id) return errorResponse('ID do compromisso não informado');
      if (!isUuid(id)) return errorResponse('Compromisso não encontrado', 404);

      const { value, error: validationErr } = validateAgendaInput(body, true);
      if (validationErr) return errorResponse(validationErr);
      if (value.aluno_id && !(await alunoValido(value.aluno_id))) {
        return errorResponse('Aluno não encontrado ou sem permissão', 403);
      }

      const { data, error } = await client
        .from('agenda')
        .update(value)
        .eq('id', id)
        .eq('personal_trainer_id', user.id)
        .select(SELECT)
        .maybeSingle();

      if (error) throw error;
      if (!data) return errorResponse('Compromisso não encontrado', 404);
      return jsonResponse(toItem(data as unknown as AgendaRow));
    }

    // DELETE /agenda/:id  (ou ?id= / { id } no corpo)
    if (req.method === 'DELETE') {
      // Corpo é opcional no DELETE
      let body: Record<string, unknown> | null = null;
      try { body = await req.json(); } catch { body = null; }
      const id = resolveId(body);
      if (!id) return errorResponse('ID do compromisso não informado');
      if (!isUuid(id)) return errorResponse('Compromisso não encontrado', 404);

      const { data, error } = await client
        .from('agenda')
        .delete()
        .eq('id', id)
        .eq('personal_trainer_id', user.id)
        .select('id');
      if (error) throw error;
      if (!data?.length) return errorResponse('Compromisso não encontrado', 404);
      return jsonResponse({ success: true });
    }

    return errorResponse('Method not allowed', 405);
  } catch (err) {
    return handleError(err);
  }
});
