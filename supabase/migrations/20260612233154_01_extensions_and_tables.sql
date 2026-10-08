-- Migração 20260612233154 — cópia exata do SQL aplicado em produção (supabase_migrations.schema_migrations). Não editar: crie uma nova migration.

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- personal_trainers (extends Supabase Auth)
CREATE TABLE personal_trainers (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- alunos
CREATE TABLE alunos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personal_trainer_id UUID NOT NULL REFERENCES personal_trainers(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) >= 2),
  birth_date DATE NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('MALE', 'FEMALE')),
  height_cm NUMERIC(5,2) NOT NULL CHECK (height_cm BETWEEN 50 AND 250),
  goal TEXT,
  phone_number TEXT,
  lgpd_consent_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (lgpd_consent_status IN ('PENDING', 'ACCEPTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- anamneses (1:1 with alunos)
CREATE TABLE anamneses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL UNIQUE REFERENCES alunos(id) ON DELETE CASCADE,
  cardiac_condition BOOLEAN NOT NULL DEFAULT FALSE,
  joint_pain BOOLEAN NOT NULL DEFAULT FALSE,
  chest_pain_during_exercise BOOLEAN NOT NULL DEFAULT FALSE,
  recent_surgery_description TEXT NOT NULL DEFAULT '',
  active_medications TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- avaliacoes
CREATE TABLE avaliacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  bmi NUMERIC(5,2),
  bmi_classification TEXT,
  body_fat_percentage NUMERIC(5,2),
  fat_mass_kg NUMERIC(5,2),
  lean_mass_kg NUMERIC(5,2),
  body_fat_classification TEXT,
  visceral_risk TEXT CHECK (visceral_risk IN ('NORMAL', 'HIGH', 'VERY_HIGH')),
  skinfolds_fat_percentage NUMERIC(5,2),
  skinfolds_sum_mm NUMERIC(6,2),
  rcq NUMERIC(6,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- bioimpedancias (1:1 with avaliacoes) - Omron HBF-514C
CREATE TABLE bioimpedancias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliacao_id UUID NOT NULL UNIQUE REFERENCES avaliacoes(id) ON DELETE CASCADE,
  perfil_bioimpedancia INTEGER CHECK (perfil_bioimpedancia BETWEEN 1 AND 4),
  is_athlete BOOLEAN NOT NULL DEFAULT FALSE,
  weight_kg NUMERIC(5,2) NOT NULL CHECK (weight_kg > 0),
  bmi NUMERIC(5,2),
  body_fat_percentage NUMERIC(5,2) NOT NULL CHECK (body_fat_percentage BETWEEN 0 AND 80),
  skeletal_muscle_percentage NUMERIC(5,2) NOT NULL CHECK (skeletal_muscle_percentage BETWEEN 0 AND 80),
  resting_metabolism_kcal INTEGER NOT NULL CHECK (resting_metabolism_kcal > 0),
  body_age INTEGER NOT NULL CHECK (body_age BETWEEN 10 AND 100),
  visceral_fat_level INTEGER NOT NULL CHECK (visceral_fat_level BETWEEN 1 AND 30),
  water_percentage NUMERIC(5,2) CHECK (water_percentage BETWEEN 0 AND 100),
  fat_mass_kg NUMERIC(5,2),
  lean_mass_kg NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- dobras_cutaneas (1:1 with avaliacoes)
CREATE TABLE dobras_cutaneas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliacao_id UUID NOT NULL UNIQUE REFERENCES avaliacoes(id) ON DELETE CASCADE,
  protocol TEXT NOT NULL DEFAULT '7_dobras' CHECK (protocol IN ('7_dobras', '3_dobras_masc', '3_dobras_fem')),
  triceps_mm NUMERIC(5,2) NOT NULL CHECK (triceps_mm > 0),
  biceps_mm NUMERIC(5,2) NOT NULL CHECK (biceps_mm > 0),
  subscapular_mm NUMERIC(5,2) NOT NULL CHECK (subscapular_mm > 0),
  chest_mm NUMERIC(5,2) NOT NULL CHECK (chest_mm > 0),
  midaxillary_mm NUMERIC(5,2) NOT NULL CHECK (midaxillary_mm > 0),
  suprailiac_mm NUMERIC(5,2) NOT NULL CHECK (suprailiac_mm > 0),
  abdominal_mm NUMERIC(5,2) NOT NULL CHECK (abdominal_mm > 0),
  mid_thigh_mm NUMERIC(5,2) NOT NULL CHECK (mid_thigh_mm > 0),
  calf_mm NUMERIC(5,2) NOT NULL CHECK (calf_mm > 0),
  sum_mm NUMERIC(6,2),
  fat_percentage NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- circunferencias (1:1 with avaliacoes)
CREATE TABLE circunferencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliacao_id UUID NOT NULL UNIQUE REFERENCES avaliacoes(id) ON DELETE CASCADE,
  neck_cm NUMERIC(5,2) NOT NULL CHECK (neck_cm > 0),
  shoulder_cm NUMERIC(5,2) NOT NULL CHECK (shoulder_cm > 0),
  chest_cm NUMERIC(5,2) NOT NULL CHECK (chest_cm > 0),
  waist_cm NUMERIC(5,2) NOT NULL CHECK (waist_cm > 0),
  abdomen_cm NUMERIC(5,2) NOT NULL CHECK (abdomen_cm > 0),
  hip_cm NUMERIC(5,2) NOT NULL CHECK (hip_cm > 0),
  right_arm_relaxed_cm NUMERIC(5,2) NOT NULL CHECK (right_arm_relaxed_cm > 0),
  left_arm_relaxed_cm NUMERIC(5,2) NOT NULL CHECK (left_arm_relaxed_cm > 0),
  right_arm_flexed_cm NUMERIC(5,2) NOT NULL CHECK (right_arm_flexed_cm > 0),
  left_arm_flexed_cm NUMERIC(5,2) NOT NULL CHECK (left_arm_flexed_cm > 0),
  right_forearm_cm NUMERIC(5,2),
  left_forearm_cm NUMERIC(5,2),
  right_thigh_proximal_cm NUMERIC(5,2) NOT NULL CHECK (right_thigh_proximal_cm > 0),
  left_thigh_proximal_cm NUMERIC(5,2) NOT NULL CHECK (left_thigh_proximal_cm > 0),
  right_calf_cm NUMERIC(5,2) NOT NULL CHECK (right_calf_cm > 0),
  left_calf_cm NUMERIC(5,2) NOT NULL CHECK (left_calf_cm > 0),
  rcq NUMERIC(6,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- fotos
CREATE TABLE fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('FRENTE', 'PERFIL', 'COSTAS')),
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- agenda
CREATE TABLE agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personal_trainer_id UUID NOT NULL REFERENCES personal_trainers(id) ON DELETE CASCADE,
  aluno_id UUID REFERENCES alunos(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  focus TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_alunos_pt ON alunos(personal_trainer_id);
CREATE INDEX idx_avaliacoes_aluno ON avaliacoes(aluno_id);
CREATE INDEX idx_avaliacoes_date ON avaliacoes(aluno_id, date DESC);
CREATE INDEX idx_fotos_aluno ON fotos(aluno_id);
CREATE INDEX idx_agenda_pt_date ON agenda(personal_trainer_id, date);
