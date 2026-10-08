-- Migração 20260617011708 — cópia exata do SQL aplicado em produção (supabase_migrations.schema_migrations). Não editar: crie uma nova migration.
-- 1) Coluna de soft-delete
ALTER TABLE public.avaliacoes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2) Index parcial: acelera as leituras que só querem avaliações ativas
CREATE INDEX IF NOT EXISTS idx_avaliacoes_aluno_active
  ON public.avaliacoes (aluno_id)
  WHERE deleted_at IS NULL;

-- 3) View de resumo: ignorar avaliações na lixeira ao calcular a "última avaliação"
CREATE OR REPLACE VIEW public.aluno_summary WITH (security_invoker=on) AS
SELECT a.id,
    a.personal_trainer_id,
    a.name,
    a.birth_date,
    a.gender,
    a.height_cm,
    a.goal,
    a.phone_number,
    a.lgpd_consent_status,
    a.created_at,
    date_part('year'::text, age(a.birth_date::timestamp with time zone)) AS age,
    latest.date AS last_assessment_date,
    latest.weight_kg AS last_weight,
    latest.body_fat_percentage AS last_fat_percentage,
    latest.visceral_fat_level AS last_visceral_level,
    lg.signed_at AS lgpd_signed_at,
    lg.signature_url AS lgpd_signature_url
   FROM alunos a
     LEFT JOIN LATERAL ( SELECT av.date,
            b.weight_kg,
            av.body_fat_percentage,
            b.visceral_fat_level
           FROM avaliacoes av
             JOIN bioimpedancias b ON b.avaliacao_id = av.id
          WHERE av.aluno_id = a.id AND av.deleted_at IS NULL
          ORDER BY av.date DESC
         LIMIT 1) latest ON true
     LEFT JOIN lgpd_assinaturas lg ON lg.aluno_id = a.id;

-- 4) Dashboard: contagens e alertas ignoram a lixeira
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
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
    'totalAssessments', (SELECT COUNT(*) FROM avaliacoes av INNER JOIN alunos a ON av.aluno_id = a.id WHERE a.personal_trainer_id = pt_id AND av.deleted_at IS NULL),
    'visceralAlerts', (
      SELECT COUNT(*) FROM (
        SELECT DISTINCT ON (av.aluno_id) b.visceral_fat_level
        FROM avaliacoes av
        INNER JOIN alunos a ON av.aluno_id = a.id
        INNER JOIN bioimpedancias b ON b.avaliacao_id = av.id
        WHERE a.personal_trainer_id = pt_id AND av.deleted_at IS NULL
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