-- Migração 20260613173311 — cópia exata do SQL aplicado em produção (supabase_migrations.schema_migrations). Não editar: crie uma nova migration.
-- 1. Limpa avaliações órfãs (criadas por inserts não-atômicos que falharam no meio)
DELETE FROM avaliacoes av
WHERE NOT EXISTS (SELECT 1 FROM circunferencias c WHERE c.avaliacao_id = av.id)
   OR NOT EXISTS (SELECT 1 FROM bioimpedancias b WHERE b.avaliacao_id = av.id)
   OR NOT EXISTS (SELECT 1 FROM dobras_cutaneas d WHERE d.avaliacao_id = av.id);

-- 2. RPC atômica: cria (p_avaliacao_id NULL) ou edita uma avaliação completa.
--    Tudo em uma transação (corpo plpgsql) -> nunca deixa registro órfão.
--    SECURITY INVOKER -> respeita RLS (treinador só mexe nos próprios dados).
CREATE OR REPLACE FUNCTION public.save_avaliacao(
  p_avaliacao_id uuid,
  p_avaliacao jsonb,
  p_bio jsonb,
  p_dobras jsonb,
  p_circ jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_avaliacao_id IS NULL THEN
    INSERT INTO avaliacoes (
      aluno_id, date, bmi, bmi_classification, body_fat_percentage, fat_mass_kg,
      lean_mass_kg, body_fat_classification, visceral_risk, skinfolds_fat_percentage,
      skinfolds_sum_mm, rcq
    ) VALUES (
      (p_avaliacao->>'aluno_id')::uuid,
      (p_avaliacao->>'date')::date,
      (p_avaliacao->>'bmi')::numeric,
      p_avaliacao->>'bmi_classification',
      (p_avaliacao->>'body_fat_percentage')::numeric,
      (p_avaliacao->>'fat_mass_kg')::numeric,
      (p_avaliacao->>'lean_mass_kg')::numeric,
      p_avaliacao->>'body_fat_classification',
      p_avaliacao->>'visceral_risk',
      (p_avaliacao->>'skinfolds_fat_percentage')::numeric,
      (p_avaliacao->>'skinfolds_sum_mm')::numeric,
      (p_avaliacao->>'rcq')::numeric
    ) RETURNING id INTO v_id;

    INSERT INTO bioimpedancias (
      avaliacao_id, perfil_bioimpedancia, is_athlete, weight_kg, bmi, body_fat_percentage,
      skeletal_muscle_percentage, resting_metabolism_kcal, body_age, visceral_fat_level,
      water_percentage, fat_mass_kg, lean_mass_kg
    ) VALUES (
      v_id,
      (p_bio->>'perfil_bioimpedancia')::int,
      COALESCE((p_bio->>'is_athlete')::boolean, false),
      (p_bio->>'weight_kg')::numeric,
      (p_bio->>'bmi')::numeric,
      (p_bio->>'body_fat_percentage')::numeric,
      (p_bio->>'skeletal_muscle_percentage')::numeric,
      (p_bio->>'resting_metabolism_kcal')::int,
      (p_bio->>'body_age')::int,
      (p_bio->>'visceral_fat_level')::int,
      (p_bio->>'water_percentage')::numeric,
      (p_bio->>'fat_mass_kg')::numeric,
      (p_bio->>'lean_mass_kg')::numeric
    );

    INSERT INTO dobras_cutaneas (
      avaliacao_id, protocol, triceps_mm, biceps_mm, subscapular_mm, chest_mm,
      midaxillary_mm, suprailiac_mm, abdominal_mm, mid_thigh_mm, calf_mm, sum_mm, fat_percentage
    ) VALUES (
      v_id,
      COALESCE(p_dobras->>'protocol', '7_dobras'),
      (p_dobras->>'triceps_mm')::numeric,
      (p_dobras->>'biceps_mm')::numeric,
      (p_dobras->>'subscapular_mm')::numeric,
      (p_dobras->>'chest_mm')::numeric,
      (p_dobras->>'midaxillary_mm')::numeric,
      (p_dobras->>'suprailiac_mm')::numeric,
      (p_dobras->>'abdominal_mm')::numeric,
      (p_dobras->>'mid_thigh_mm')::numeric,
      (p_dobras->>'calf_mm')::numeric,
      (p_dobras->>'sum_mm')::numeric,
      (p_dobras->>'fat_percentage')::numeric
    );

    INSERT INTO circunferencias (
      avaliacao_id, neck_cm, shoulder_cm, chest_cm, waist_cm, abdomen_cm, hip_cm,
      right_arm_relaxed_cm, left_arm_relaxed_cm, right_arm_flexed_cm, left_arm_flexed_cm,
      right_forearm_cm, left_forearm_cm, right_thigh_proximal_cm, left_thigh_proximal_cm,
      right_calf_cm, left_calf_cm, rcq
    ) VALUES (
      v_id,
      (p_circ->>'neck_cm')::numeric,
      (p_circ->>'shoulder_cm')::numeric,
      (p_circ->>'chest_cm')::numeric,
      (p_circ->>'waist_cm')::numeric,
      (p_circ->>'abdomen_cm')::numeric,
      (p_circ->>'hip_cm')::numeric,
      (p_circ->>'right_arm_relaxed_cm')::numeric,
      (p_circ->>'left_arm_relaxed_cm')::numeric,
      (p_circ->>'right_arm_flexed_cm')::numeric,
      (p_circ->>'left_arm_flexed_cm')::numeric,
      (p_circ->>'right_forearm_cm')::numeric,
      (p_circ->>'left_forearm_cm')::numeric,
      (p_circ->>'right_thigh_proximal_cm')::numeric,
      (p_circ->>'left_thigh_proximal_cm')::numeric,
      (p_circ->>'right_calf_cm')::numeric,
      (p_circ->>'left_calf_cm')::numeric,
      (p_circ->>'rcq')::numeric
    );
  ELSE
    UPDATE avaliacoes SET
      date = (p_avaliacao->>'date')::date,
      bmi = (p_avaliacao->>'bmi')::numeric,
      bmi_classification = p_avaliacao->>'bmi_classification',
      body_fat_percentage = (p_avaliacao->>'body_fat_percentage')::numeric,
      fat_mass_kg = (p_avaliacao->>'fat_mass_kg')::numeric,
      lean_mass_kg = (p_avaliacao->>'lean_mass_kg')::numeric,
      body_fat_classification = p_avaliacao->>'body_fat_classification',
      visceral_risk = p_avaliacao->>'visceral_risk',
      skinfolds_fat_percentage = (p_avaliacao->>'skinfolds_fat_percentage')::numeric,
      skinfolds_sum_mm = (p_avaliacao->>'skinfolds_sum_mm')::numeric,
      rcq = (p_avaliacao->>'rcq')::numeric
    WHERE id = p_avaliacao_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Avaliacao nao encontrada ou sem permissao';
    END IF;
    v_id := p_avaliacao_id;

    UPDATE bioimpedancias SET
      perfil_bioimpedancia = (p_bio->>'perfil_bioimpedancia')::int,
      is_athlete = COALESCE((p_bio->>'is_athlete')::boolean, false),
      weight_kg = (p_bio->>'weight_kg')::numeric,
      bmi = (p_bio->>'bmi')::numeric,
      body_fat_percentage = (p_bio->>'body_fat_percentage')::numeric,
      skeletal_muscle_percentage = (p_bio->>'skeletal_muscle_percentage')::numeric,
      resting_metabolism_kcal = (p_bio->>'resting_metabolism_kcal')::int,
      body_age = (p_bio->>'body_age')::int,
      visceral_fat_level = (p_bio->>'visceral_fat_level')::int,
      water_percentage = (p_bio->>'water_percentage')::numeric,
      fat_mass_kg = (p_bio->>'fat_mass_kg')::numeric,
      lean_mass_kg = (p_bio->>'lean_mass_kg')::numeric
    WHERE avaliacao_id = v_id;

    UPDATE dobras_cutaneas SET
      protocol = COALESCE(p_dobras->>'protocol', '7_dobras'),
      triceps_mm = (p_dobras->>'triceps_mm')::numeric,
      biceps_mm = (p_dobras->>'biceps_mm')::numeric,
      subscapular_mm = (p_dobras->>'subscapular_mm')::numeric,
      chest_mm = (p_dobras->>'chest_mm')::numeric,
      midaxillary_mm = (p_dobras->>'midaxillary_mm')::numeric,
      suprailiac_mm = (p_dobras->>'suprailiac_mm')::numeric,
      abdominal_mm = (p_dobras->>'abdominal_mm')::numeric,
      mid_thigh_mm = (p_dobras->>'mid_thigh_mm')::numeric,
      calf_mm = (p_dobras->>'calf_mm')::numeric,
      sum_mm = (p_dobras->>'sum_mm')::numeric,
      fat_percentage = (p_dobras->>'fat_percentage')::numeric
    WHERE avaliacao_id = v_id;

    UPDATE circunferencias SET
      neck_cm = (p_circ->>'neck_cm')::numeric,
      shoulder_cm = (p_circ->>'shoulder_cm')::numeric,
      chest_cm = (p_circ->>'chest_cm')::numeric,
      waist_cm = (p_circ->>'waist_cm')::numeric,
      abdomen_cm = (p_circ->>'abdomen_cm')::numeric,
      hip_cm = (p_circ->>'hip_cm')::numeric,
      right_arm_relaxed_cm = (p_circ->>'right_arm_relaxed_cm')::numeric,
      left_arm_relaxed_cm = (p_circ->>'left_arm_relaxed_cm')::numeric,
      right_arm_flexed_cm = (p_circ->>'right_arm_flexed_cm')::numeric,
      left_arm_flexed_cm = (p_circ->>'left_arm_flexed_cm')::numeric,
      right_forearm_cm = (p_circ->>'right_forearm_cm')::numeric,
      left_forearm_cm = (p_circ->>'left_forearm_cm')::numeric,
      right_thigh_proximal_cm = (p_circ->>'right_thigh_proximal_cm')::numeric,
      left_thigh_proximal_cm = (p_circ->>'left_thigh_proximal_cm')::numeric,
      right_calf_cm = (p_circ->>'right_calf_cm')::numeric,
      left_calf_cm = (p_circ->>'left_calf_cm')::numeric,
      rcq = (p_circ->>'rcq')::numeric
    WHERE avaliacao_id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_avaliacao(uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_avaliacao(uuid, jsonb, jsonb, jsonb, jsonb) TO authenticated;