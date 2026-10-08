-- Migração 20260613000620 — cópia exata do SQL aplicado em produção (supabase_migrations.schema_migrations). Não editar: crie uma nova migration.

CREATE TABLE lgpd_assinaturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL UNIQUE REFERENCES alunos(id) ON DELETE CASCADE,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signature_storage_path TEXT NOT NULL,
  signature_url TEXT NOT NULL,
  term_version TEXT NOT NULL DEFAULT '1.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE lgpd_assinaturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pt_all_lgpd_assinaturas" ON lgpd_assinaturas FOR ALL USING (
  aluno_id IN (SELECT id FROM alunos WHERE personal_trainer_id = auth.uid())
);

CREATE INDEX idx_lgpd_aluno ON lgpd_assinaturas(aluno_id);

-- Expose signature info on the aluno_summary view
-- (re-creates the view adding lgpd_signed_at)
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
  latest.visceral_fat_level AS last_visceral_level,
  lg.signed_at AS lgpd_signed_at,
  lg.signature_url AS lgpd_signature_url
FROM alunos a
LEFT JOIN LATERAL (
  SELECT av.date, b.weight_kg, av.body_fat_percentage, b.visceral_fat_level
  FROM avaliacoes av
  INNER JOIN bioimpedancias b ON b.avaliacao_id = av.id
  WHERE av.aluno_id = a.id
  ORDER BY av.date DESC
  LIMIT 1
) latest ON TRUE
LEFT JOIN lgpd_assinaturas lg ON lg.aluno_id = a.id;
