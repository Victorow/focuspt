-- Migração 20260612233256 — cópia exata do SQL aplicado em produção (supabase_migrations.schema_migrations). Não editar: crie uma nova migration.

-- View: aluno_summary (for list endpoints)
CREATE OR REPLACE VIEW aluno_summary AS
SELECT
  a.id,
  a.personal_trainer_id,
  a.name,
  a.birth_date,
  a.gender,
  a.height_cm,
  a.goal,
  a.phone_number,
  a.lgpd_consent_status,
  a.created_at,
  DATE_PART('year', AGE(a.birth_date)) AS age,
  latest.date AS last_assessment_date,
  latest.weight_kg AS last_weight,
  latest.body_fat_percentage AS last_fat_percentage,
  latest.visceral_fat_level AS last_visceral_level
FROM alunos a
LEFT JOIN LATERAL (
  SELECT av.date, b.weight_kg, av.body_fat_percentage, b.visceral_fat_level
  FROM avaliacoes av
  INNER JOIN bioimpedancias b ON b.avaliacao_id = av.id
  WHERE av.aluno_id = a.id
  ORDER BY av.date DESC
  LIMIT 1
) latest ON TRUE;

-- Function: get dashboard stats for a PT
CREATE OR REPLACE FUNCTION get_dashboard_stats(pt_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
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
$$;
