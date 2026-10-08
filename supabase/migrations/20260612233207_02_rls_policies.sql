-- Migração 20260612233207 — cópia exata do SQL aplicado em produção (supabase_migrations.schema_migrations). Não editar: crie uma nova migration.

-- Enable RLS on all tables
ALTER TABLE personal_trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE anamneses ENABLE ROW LEVEL SECURITY;
ALTER TABLE avaliacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bioimpedancias ENABLE ROW LEVEL SECURITY;
ALTER TABLE dobras_cutaneas ENABLE ROW LEVEL SECURITY;
ALTER TABLE circunferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda ENABLE ROW LEVEL SECURITY;

-- personal_trainers
CREATE POLICY "pt_select_own" ON personal_trainers FOR SELECT USING (auth.uid() = id);
CREATE POLICY "pt_insert_own" ON personal_trainers FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "pt_update_own" ON personal_trainers FOR UPDATE USING (auth.uid() = id);

-- alunos
CREATE POLICY "pt_all_alunos" ON alunos FOR ALL USING (personal_trainer_id = auth.uid());

-- anamneses
CREATE POLICY "pt_all_anamneses" ON anamneses FOR ALL USING (
  aluno_id IN (SELECT id FROM alunos WHERE personal_trainer_id = auth.uid())
);

-- avaliacoes
CREATE POLICY "pt_all_avaliacoes" ON avaliacoes FOR ALL USING (
  aluno_id IN (SELECT id FROM alunos WHERE personal_trainer_id = auth.uid())
);

-- bioimpedancias
CREATE POLICY "pt_all_bioimpedancias" ON bioimpedancias FOR ALL USING (
  avaliacao_id IN (
    SELECT av.id FROM avaliacoes av
    INNER JOIN alunos a ON av.aluno_id = a.id
    WHERE a.personal_trainer_id = auth.uid()
  )
);

-- dobras_cutaneas
CREATE POLICY "pt_all_dobras" ON dobras_cutaneas FOR ALL USING (
  avaliacao_id IN (
    SELECT av.id FROM avaliacoes av
    INNER JOIN alunos a ON av.aluno_id = a.id
    WHERE a.personal_trainer_id = auth.uid()
  )
);

-- circunferencias
CREATE POLICY "pt_all_circunferencias" ON circunferencias FOR ALL USING (
  avaliacao_id IN (
    SELECT av.id FROM avaliacoes av
    INNER JOIN alunos a ON av.aluno_id = a.id
    WHERE a.personal_trainer_id = auth.uid()
  )
);

-- fotos
CREATE POLICY "pt_all_fotos" ON fotos FOR ALL USING (
  aluno_id IN (SELECT id FROM alunos WHERE personal_trainer_id = auth.uid())
);

-- agenda
CREATE POLICY "pt_all_agenda" ON agenda FOR ALL USING (personal_trainer_id = auth.uid());
