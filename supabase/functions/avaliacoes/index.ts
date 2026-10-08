import { handleCors, jsonResponse, errorResponse, handleError } from '../_shared/cors.ts';
import { getAuthUser } from '../_shared/supabase.ts';
import {
  calcBmi, classifyBmi, classifyBodyFat, classifyVisceral,
  calcJacksonPollock7, calcSkinfoldsSum7, calcRcq, calcAge,
} from '../_shared/calculations.ts';
import { isIsoDate, isUuid } from '../_shared/validation.ts';

// Dobras do protocolo JP7 — obrigatórias (bíceps e panturrilha são opcionais e ficam fora)
const DOBRAS_JP7 = [
  'chest_mm', 'midaxillary_mm', 'triceps_mm', 'subscapular_mm',
  'abdominal_mm', 'suprailiac_mm', 'mid_thigh_mm',
] as const;

// deno-lint-ignore no-explicit-any
function validarDobrasJp7(skinfolds: any): string | null {
  // Só o protocolo JP7 (7 dobras) está implementado; ausente = '7_dobras'
  const protocol = skinfolds?.protocol ?? '7_dobras';
  if (protocol !== '7_dobras') {
    return `Protocolo de dobras não suportado: ${protocol}. Use '7_dobras' (Jackson & Pollock 7 dobras).`;
  }
  const faltando = DOBRAS_JP7.filter((k) => {
    const v = skinfolds?.[k];
    return typeof v !== 'number' || !Number.isFinite(v) || v <= 0;
  });
  return faltando.length
    ? `Dobras cutâneas obrigatórias ausentes ou inválidas (devem ser maiores que zero): ${faltando.join(', ')}`
    : null;
}

// Medida opcional: ausente/vazia/zero/não numérica vira null (0 violaria o CHECK > 0)
function toNullable(v: unknown): number | null {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// deno-lint-ignore no-explicit-any
function buildPayloads(aluno: any, body: any) {
  const { date, bioimpedance, circumferences, skinfolds } = body;
  // Idade NA DATA da avaliação (não hoje) — importa para avaliações retroativas
  const age = calcAge(aluno.birth_date, date);
  const gender = aluno.gender as 'MALE' | 'FEMALE';

  const bmi = calcBmi(bioimpedance.weight_kg, aluno.height_cm);
  const fatPct = bioimpedance.body_fat_percentage;
  const fatMassKg = Math.round((bioimpedance.weight_kg * fatPct / 100) * 100) / 100;
  const leanMassKg = Math.round((bioimpedance.weight_kg - fatMassKg) * 100) / 100;
  const visceralRisk = classifyVisceral(bioimpedance.visceral_fat_level);
  const rcq = calcRcq(circumferences.waist_cm, circumferences.hip_cm);
  const skinfoldsFatPct = calcJacksonPollock7(
    gender, age,
    skinfolds.chest_mm, skinfolds.midaxillary_mm, skinfolds.triceps_mm,
    skinfolds.subscapular_mm, skinfolds.abdominal_mm, skinfolds.suprailiac_mm,
    skinfolds.mid_thigh_mm,
  );
  // Somatório = só as 7 dobras do JP7 (mesma soma usada no % de gordura)
  const skinfoldsSum = calcSkinfoldsSum7(
    skinfolds.chest_mm, skinfolds.midaxillary_mm, skinfolds.triceps_mm,
    skinfolds.subscapular_mm, skinfolds.abdominal_mm, skinfolds.suprailiac_mm,
    skinfolds.mid_thigh_mm,
  );

  return {
    p_avaliacao: {
      aluno_id: aluno.id,
      date,
      bmi,
      bmi_classification: classifyBmi(bmi),
      body_fat_percentage: fatPct,
      fat_mass_kg: fatMassKg,
      lean_mass_kg: leanMassKg,
      body_fat_classification: classifyBodyFat(gender, age, fatPct),
      visceral_risk: visceralRisk,
      skinfolds_fat_percentage: skinfoldsFatPct,
      skinfolds_sum_mm: skinfoldsSum,
      rcq,
      last_menstruation_date: body.last_menstruation_date ?? null,
      menstrual_cycle_regular: body.menstrual_cycle_regular ?? null,
    },
    p_bio: {
      perfil_bioimpedancia: bioimpedance.perfil_bioimpedancia ?? null,
      is_athlete: bioimpedance.is_athlete ?? false,
      weight_kg: bioimpedance.weight_kg,
      bmi,
      body_fat_percentage: bioimpedance.body_fat_percentage,
      skeletal_muscle_percentage: bioimpedance.skeletal_muscle_percentage,
      resting_metabolism_kcal: bioimpedance.resting_metabolism_kcal,
      body_age: bioimpedance.body_age,
      visceral_fat_level: bioimpedance.visceral_fat_level,
      water_percentage: bioimpedance.water_percentage ?? null,
      fat_mass_kg: fatMassKg,
      lean_mass_kg: leanMassKg,
    },
    p_dobras: {
      protocol: skinfolds.protocol ?? '7_dobras',
      triceps_mm: skinfolds.triceps_mm,
      biceps_mm: toNullable(skinfolds.biceps_mm),
      subscapular_mm: skinfolds.subscapular_mm,
      chest_mm: skinfolds.chest_mm,
      midaxillary_mm: skinfolds.midaxillary_mm,
      suprailiac_mm: skinfolds.suprailiac_mm,
      abdominal_mm: skinfolds.abdominal_mm,
      mid_thigh_mm: skinfolds.mid_thigh_mm,
      calf_mm: toNullable(skinfolds.calf_mm),
      sum_mm: skinfoldsSum,
      fat_percentage: skinfoldsFatPct,
    },
    p_circ: {
      neck_cm: circumferences.neck_cm,
      shoulder_cm: circumferences.shoulder_cm,
      chest_cm: circumferences.chest_cm,
      waist_cm: circumferences.waist_cm,
      abdomen_cm: circumferences.abdomen_cm,
      hip_cm: circumferences.hip_cm,
      right_arm_relaxed_cm: circumferences.right_arm_relaxed_cm ?? null,
      left_arm_relaxed_cm: circumferences.left_arm_relaxed_cm ?? null,
      right_arm_flexed_cm: circumferences.right_arm_flexed_cm ?? null,
      left_arm_flexed_cm: circumferences.left_arm_flexed_cm ?? null,
      right_forearm_cm: circumferences.right_forearm_cm ?? null,
      left_forearm_cm: circumferences.left_forearm_cm ?? null,
      right_thigh_proximal_cm: circumferences.right_thigh_proximal_cm ?? null,
      left_thigh_proximal_cm: circumferences.left_thigh_proximal_cm ?? null,
      right_thigh_medial_cm: circumferences.right_thigh_medial_cm ?? null,
      left_thigh_medial_cm: circumferences.left_thigh_medial_cm ?? null,
      right_thigh_distal_cm: circumferences.right_thigh_distal_cm ?? null,
      left_thigh_distal_cm: circumferences.left_thigh_distal_cm ?? null,
      right_calf_cm: circumferences.right_calf_cm ?? null,
      left_calf_cm: circumferences.left_calf_cm ?? null,
      rcq,
      bust_cm: circumferences.bust_cm ?? null,
    },
  };
}

// Traduz erros de CHECK constraint em mensagens amigáveis
function friendlyError(msg: string): string {
  if (msg.includes('violates check constraint')) {
    if (msg.includes('circunferencias') || msg.includes('dobras') || msg.includes('weight') || msg.includes('_cm') || msg.includes('_mm')) {
      return 'Há medidas inválidas (zero ou negativas). Todas as medidas devem ser maiores que zero.';
    }
    return 'Algum valor está fora do intervalo permitido. Verifique os campos.';
  }
  return msg;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return errorResponse('Method not allowed', 405);

    const { user, client } = await getAuthUser(req);
    const body = (await req.json()) ?? {};

    // ---- CRIAR ----
    if (req.method === 'POST') {
      const { aluno_id, date, bioimpedance, circumferences, skinfolds } = body;
      if (!aluno_id || !date || !bioimpedance || !circumferences || !skinfolds) {
        return errorResponse('Campos obrigatórios: aluno_id, date, bioimpedance, circumferences, skinfolds');
      }
      if (!isIsoDate(date)) return errorResponse('date inválida (use YYYY-MM-DD)');
      if (!isUuid(aluno_id)) return errorResponse('Aluno não encontrado ou sem permissão', 403);
      const dobrasErr = validarDobrasJp7(skinfolds);
      if (dobrasErr) return errorResponse(dobrasErr, 400);

      const { data: aluno, error: alunoErr } = await client
        .from('alunos').select('id, gender, birth_date, height_cm')
        .eq('id', aluno_id).eq('personal_trainer_id', user.id).is('deleted_at', null).maybeSingle();
      if (alunoErr || !aluno) return errorResponse('Aluno não encontrado ou sem permissão', 403);

      const p = buildPayloads(aluno, body);
      const { data: newId, error } = await client.rpc('save_avaliacao', {
        p_avaliacao_id: null, p_avaliacao: p.p_avaliacao, p_bio: p.p_bio, p_dobras: p.p_dobras, p_circ: p.p_circ,
      });
      if (error) return errorResponse(friendlyError(error.message), 400);

      const { data: saved } = await client.from('avaliacoes').select('*').eq('id', newId).single();
      return jsonResponse(saved ?? { id: newId }, 201);
    }

    // ---- EDITAR ----
    if (req.method === 'PUT') {
      const { avaliacao_id, bioimpedance, circumferences, skinfolds } = body;
      if (!avaliacao_id || !bioimpedance || !circumferences || !skinfolds) {
        return errorResponse('Campos obrigatórios: avaliacao_id, bioimpedance, circumferences, skinfolds');
      }
      if (!isUuid(avaliacao_id)) return errorResponse('Avaliação não encontrada ou sem permissão', 403);
      if (body.date !== undefined && body.date !== null && !isIsoDate(body.date)) {
        return errorResponse('date inválida (use YYYY-MM-DD)');
      }
      const dobrasErr = validarDobrasJp7(skinfolds);
      if (dobrasErr) return errorResponse(dobrasErr, 400);

      // Resolve o aluno dono desta avaliação (e valida posse via RLS no join)
      const { data: aval, error: avErr } = await client
        .from('avaliacoes')
        .select('id, date, alunos!inner(id, gender, birth_date, height_cm, personal_trainer_id)')
        .eq('id', avaliacao_id)
        .is('deleted_at', null)
        .single();
      // deno-lint-ignore no-explicit-any
      const alunoRel: any = (aval as any)?.alunos;
      if (avErr || !aval || !alunoRel || alunoRel.personal_trainer_id !== user.id) {
        return errorResponse('Avaliação não encontrada ou sem permissão', 403);
      }

      const effectiveBody = { ...body, date: body.date ?? aval.date };
      const p = buildPayloads({ id: alunoRel.id, gender: alunoRel.gender, birth_date: alunoRel.birth_date, height_cm: alunoRel.height_cm }, effectiveBody);

      const { data: updatedId, error } = await client.rpc('save_avaliacao', {
        p_avaliacao_id: avaliacao_id, p_avaliacao: p.p_avaliacao, p_bio: p.p_bio, p_dobras: p.p_dobras, p_circ: p.p_circ,
      });
      if (error) return errorResponse(friendlyError(error.message), 400);

      const { data: saved } = await client.from('avaliacoes').select('*').eq('id', updatedId).single();
      return jsonResponse(saved ?? { id: updatedId });
    }

    // ---- OBSERVAÇÕES DO RELATÓRIO (atualização leve) ----
    if (req.method === 'PATCH') {
      const { avaliacao_id, observacoes } = body;
      if (!avaliacao_id) return errorResponse('Campo obrigatório: avaliacao_id');
      if (!isUuid(avaliacao_id)) return errorResponse('Avaliação não encontrada ou sem permissão', 403);

      // Valida posse via join com alunos (RLS) antes de atualizar
      const { data: aval, error: avErr } = await client
        .from('avaliacoes')
        .select('id, alunos!inner(personal_trainer_id)')
        .eq('id', avaliacao_id)
        .is('deleted_at', null)
        .single();
      // deno-lint-ignore no-explicit-any
      const dono: any = (aval as any)?.alunos;
      if (avErr || !aval || !dono || dono.personal_trainer_id !== user.id) {
        return errorResponse('Avaliação não encontrada ou sem permissão', 403);
      }

      const texto = typeof observacoes === 'string' ? observacoes.trim() : '';
      const { data: saved, error } = await client
        .from('avaliacoes')
        .update({ observacoes: texto.length ? texto : null })
        .eq('id', avaliacao_id)
        .select('*')
        .single();
      if (error) return errorResponse(friendlyError(error.message), 400);
      return jsonResponse(saved);
    }

    return errorResponse('Method not allowed', 405);
  } catch (err) {
    // Violação de CHECK vira mensagem amigável (400); o resto, erro genérico sem detalhes internos
    const msg = (err as { message?: string })?.message ?? '';
    if (msg.includes('violates check constraint')) return errorResponse(friendlyError(msg), 400);
    return handleError(err);
  }
});
