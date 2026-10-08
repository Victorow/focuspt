-- Migração 20260613043901 — cópia exata do SQL aplicado em produção (supabase_migrations.schema_migrations). Não editar: crie uma nova migration.
-- ============================================================
-- 1. IDOR FIX: get_dashboard_stats agora usa auth.uid() (não aceita pt_id arbitrário)
-- ============================================================
DROP FUNCTION IF EXISTS public.get_dashboard_stats(uuid);

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  pt_id uuid := auth.uid();
  result JSON;
BEGIN
  IF pt_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT json_build_object(
    'activeStudents', (SELECT COUNT(*) FROM alunos WHERE personal_trainer_id = pt_id),
    'totalAssessments', (SELECT COUNT(*) FROM avaliacoes av INNER JOIN alunos a ON av.aluno_id = a.id WHERE a.personal_trainer_id = pt_id),
    'visceralAlerts', (
      SELECT COUNT(*) FROM (
        SELECT DISTINCT ON (av.aluno_id) b.visceral_fat_level
        FROM avaliacoes av
        INNER JOIN alunos a ON av.aluno_id = a.id
        INNER JOIN bioimpedancias b ON b.avaliacao_id = av.id
        WHERE a.personal_trainer_id = pt_id
        ORDER BY av.aluno_id, av.date DESC
      ) sub WHERE sub.visceral_fat_level >= 10
    ),
    'todayAgenda', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', ag.id,
        'time', ag.time,
        'studentName', al.name,
        'focus', ag.focus
      ) ORDER BY ag.time), '[]'::json)
      FROM agenda ag
      LEFT JOIN alunos al ON ag.aluno_id = al.id
      WHERE ag.personal_trainer_id = pt_id AND ag.date = CURRENT_DATE
    )
  ) INTO result;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

-- ============================================================
-- 2. IDOR FIX: aluno_summary view respeita RLS do usuário (security_invoker)
-- ============================================================
ALTER VIEW public.aluno_summary SET (security_invoker = on);

-- ============================================================
-- 3. handle_new_user: é trigger, não deve ser chamável via RPC
-- ============================================================
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 4. HARDENING: search_path imutável em todas as funções
-- ============================================================
ALTER FUNCTION public.calc_jackson_pollock_7(gender text, age integer, chest_mm numeric, midaxillary_mm numeric, triceps_mm numeric, subscapular_mm numeric, abdominal_mm numeric, suprailiac_mm numeric, mid_thigh_mm numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.classify_bmi(bmi numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.classify_body_fat(gender text, age integer, fat_pct numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.classify_rcq(gender text, age integer, rcq numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.classify_skeletal_muscle(gender text, age integer, muscle_pct numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.classify_visceral(level integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at() SET search_path = public, pg_temp;

-- ============================================================
-- 5. Bucket de fotos: impede enumeração/listagem por anônimos.
--    (Acesso por URL pública continua funcionando — bucket é público.)
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view photos (public bucket)" ON storage.objects;

CREATE POLICY "PT can list own student photos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'fotos-alunos'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );