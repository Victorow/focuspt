-- Migração 20260709141542 — cópia exata do SQL aplicado em produção (supabase_migrations.schema_migrations). Não editar: crie uma nova migration.
-- supabase/migrations/20260709000001_ficha_por_sexo.sql

-- Coxa medial/distal (opcionais, mesmo padrão de antebraço/coxa proximal) + busto (só mulher, mas sem CHECK de sexo no banco).
ALTER TABLE public.circunferencias
  ADD COLUMN right_thigh_medial_cm numeric CHECK (right_thigh_medial_cm > 0),
  ADD COLUMN left_thigh_medial_cm  numeric CHECK (left_thigh_medial_cm > 0),
  ADD COLUMN right_thigh_distal_cm numeric CHECK (right_thigh_distal_cm > 0),
  ADD COLUMN left_thigh_distal_cm  numeric CHECK (left_thigh_distal_cm > 0),
  ADD COLUMN bust_cm               numeric CHECK (bust_cm > 0);

-- Ciclo menstrual: por avaliação (não por aluno), sem CHECK de sexo.
ALTER TABLE public.avaliacoes
  ADD COLUMN last_menstruation_date date,
  ADD COLUMN menstrual_cycle_regular boolean;

-- Recria save_avaliacao (só existia no banco, não versionada) incluindo os novos campos.
CREATE OR REPLACE FUNCTION public.save_avaliacao(
  p_avaliacao_id uuid, p_avaliacao jsonb, p_bio jsonb, p_dobras jsonb, p_circ jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_avaliacao_id IS NULL THEN
    INSERT INTO avaliacoes (
      aluno_id, date, bmi, bmi_classification, body_fat_percentage, fat_mass_kg,
      lean_mass_kg, body_fat_classification, visceral_risk, skinfolds_fat_percentage,
      skinfolds_sum_mm, rcq, last_menstruation_date, menstrual_cycle_regular
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
      (p_avaliacao->>'rcq')::numeric,
      (p_avaliacao->>'last_menstruation_date')::date,
      (p_avaliacao->>'menstrual_cycle_regular')::boolean
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
      right_thigh_medial_cm, left_thigh_medial_cm, right_thigh_distal_cm, left_thigh_distal_cm,
      right_calf_cm, left_calf_cm, rcq, bust_cm
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
      (p_circ->>'right_thigh_medial_cm')::numeric,
      (p_circ->>'left_thigh_medial_cm')::numeric,
      (p_circ->>'right_thigh_distal_cm')::numeric,
      (p_circ->>'left_thigh_distal_cm')::numeric,
      (p_circ->>'right_calf_cm')::numeric,
      (p_circ->>'left_calf_cm')::numeric,
      (p_circ->>'rcq')::numeric,
      (p_circ->>'bust_cm')::numeric
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
      rcq = (p_avaliacao->>'rcq')::numeric,
      last_menstruation_date = (p_avaliacao->>'last_menstruation_date')::date,
      menstrual_cycle_regular = (p_avaliacao->>'menstrual_cycle_regular')::boolean
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
      right_thigh_medial_cm = (p_circ->>'right_thigh_medial_cm')::numeric,
      left_thigh_medial_cm = (p_circ->>'left_thigh_medial_cm')::numeric,
      right_thigh_distal_cm = (p_circ->>'right_thigh_distal_cm')::numeric,
      left_thigh_distal_cm = (p_circ->>'left_thigh_distal_cm')::numeric,
      right_calf_cm = (p_circ->>'right_calf_cm')::numeric,
      left_calf_cm = (p_circ->>'left_calf_cm')::numeric,
      rcq = (p_circ->>'rcq')::numeric,
      bust_cm = (p_circ->>'bust_cm')::numeric
    WHERE avaliacao_id = v_id;
  END IF;

  RETURN v_id;
END;
$function$;
