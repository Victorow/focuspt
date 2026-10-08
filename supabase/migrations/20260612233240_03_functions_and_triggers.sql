-- Migração 20260612233240 — cópia exata do SQL aplicado em produção (supabase_migrations.schema_migrations). Não editar: crie uma nova migration.

-- =============================================
-- CALCULATION FUNCTIONS
-- =============================================

-- BMI Classification
CREATE OR REPLACE FUNCTION classify_bmi(bmi NUMERIC)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF bmi < 18.5 THEN RETURN 'Abaixo do peso';
  ELSIF bmi < 25.0 THEN RETURN 'Peso normal';
  ELSIF bmi < 30.0 THEN RETURN 'Sobrepeso';
  ELSIF bmi < 35.0 THEN RETURN 'Obesidade Grau I';
  ELSIF bmi < 40.0 THEN RETURN 'Obesidade Grau II';
  ELSE RETURN 'Obesidade Grau III';
  END IF;
END;
$$;

-- Body Fat Classification (gender + age based - ACSM guidelines)
CREATE OR REPLACE FUNCTION classify_body_fat(gender TEXT, age INTEGER, fat_pct NUMERIC)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF gender = 'MALE' THEN
    IF age < 30 THEN
      IF fat_pct < 12 THEN RETURN 'Excelente';
      ELSIF fat_pct < 17 THEN RETURN 'Bom';
      ELSIF fat_pct < 22 THEN RETURN 'Normal';
      ELSIF fat_pct < 27 THEN RETURN 'Alto';
      ELSE RETURN 'Muito Alto';
      END IF;
    ELSIF age < 40 THEN
      IF fat_pct < 13 THEN RETURN 'Excelente';
      ELSIF fat_pct < 18 THEN RETURN 'Bom';
      ELSIF fat_pct < 23 THEN RETURN 'Normal';
      ELSIF fat_pct < 28 THEN RETURN 'Alto';
      ELSE RETURN 'Muito Alto';
      END IF;
    ELSIF age < 50 THEN
      IF fat_pct < 15 THEN RETURN 'Excelente';
      ELSIF fat_pct < 20 THEN RETURN 'Bom';
      ELSIF fat_pct < 25 THEN RETURN 'Normal';
      ELSIF fat_pct < 30 THEN RETURN 'Alto';
      ELSE RETURN 'Muito Alto';
      END IF;
    ELSE
      IF fat_pct < 17 THEN RETURN 'Excelente';
      ELSIF fat_pct < 22 THEN RETURN 'Bom';
      ELSIF fat_pct < 27 THEN RETURN 'Normal';
      ELSIF fat_pct < 32 THEN RETURN 'Alto';
      ELSE RETURN 'Muito Alto';
      END IF;
    END IF;
  ELSE -- FEMALE
    IF age < 30 THEN
      IF fat_pct < 17 THEN RETURN 'Excelente';
      ELSIF fat_pct < 21 THEN RETURN 'Bom';
      ELSIF fat_pct < 26 THEN RETURN 'Normal';
      ELSIF fat_pct < 31 THEN RETURN 'Alto';
      ELSE RETURN 'Muito Alto';
      END IF;
    ELSIF age < 40 THEN
      IF fat_pct < 18 THEN RETURN 'Excelente';
      ELSIF fat_pct < 23 THEN RETURN 'Bom';
      ELSIF fat_pct < 28 THEN RETURN 'Normal';
      ELSIF fat_pct < 33 THEN RETURN 'Alto';
      ELSE RETURN 'Muito Alto';
      END IF;
    ELSIF age < 50 THEN
      IF fat_pct < 20 THEN RETURN 'Excelente';
      ELSIF fat_pct < 25 THEN RETURN 'Bom';
      ELSIF fat_pct < 30 THEN RETURN 'Normal';
      ELSIF fat_pct < 35 THEN RETURN 'Alto';
      ELSE RETURN 'Muito Alto';
      END IF;
    ELSE
      IF fat_pct < 22 THEN RETURN 'Excelente';
      ELSIF fat_pct < 27 THEN RETURN 'Bom';
      ELSIF fat_pct < 32 THEN RETURN 'Normal';
      ELSIF fat_pct < 37 THEN RETURN 'Alto';
      ELSE RETURN 'Muito Alto';
      END IF;
    END IF;
  END IF;
END;
$$;

-- Classify Skeletal Muscle (Omron guidelines)
CREATE OR REPLACE FUNCTION classify_skeletal_muscle(gender TEXT, age INTEGER, muscle_pct NUMERIC)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF gender = 'MALE' THEN
    IF age < 40 THEN
      IF muscle_pct >= 40 THEN RETURN 'Alto'; ELSIF muscle_pct >= 33 THEN RETURN 'Normal'; ELSE RETURN 'Baixo'; END IF;
    ELSE
      IF muscle_pct >= 37 THEN RETURN 'Alto'; ELSIF muscle_pct >= 30 THEN RETURN 'Normal'; ELSE RETURN 'Baixo'; END IF;
    END IF;
  ELSE
    IF age < 40 THEN
      IF muscle_pct >= 34 THEN RETURN 'Alto'; ELSIF muscle_pct >= 28 THEN RETURN 'Normal'; ELSE RETURN 'Baixo'; END IF;
    ELSE
      IF muscle_pct >= 32 THEN RETURN 'Alto'; ELSIF muscle_pct >= 26 THEN RETURN 'Normal'; ELSE RETURN 'Baixo'; END IF;
    END IF;
  END IF;
END;
$$;

-- Visceral Fat Classification (Omron scale 1-30)
CREATE OR REPLACE FUNCTION classify_visceral(level INTEGER)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF level <= 9 THEN RETURN 'NORMAL';
  ELSIF level <= 14 THEN RETURN 'HIGH';
  ELSE RETURN 'VERY_HIGH';
  END IF;
END;
$$;

-- Jackson & Pollock 7-site body fat (gender-specific)
CREATE OR REPLACE FUNCTION calc_jackson_pollock_7(
  gender TEXT, age INTEGER,
  chest_mm NUMERIC, midaxillary_mm NUMERIC, triceps_mm NUMERIC,
  subscapular_mm NUMERIC, abdominal_mm NUMERIC, suprailiac_mm NUMERIC,
  mid_thigh_mm NUMERIC
)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  sum7 NUMERIC;
  density NUMERIC;
  fat_pct NUMERIC;
BEGIN
  sum7 := chest_mm + midaxillary_mm + triceps_mm + subscapular_mm + abdominal_mm + suprailiac_mm + mid_thigh_mm;
  IF gender = 'MALE' THEN
    density := 1.112 - (0.00043499 * sum7) + (0.00000055 * sum7 * sum7) - (0.00028826 * age);
  ELSE
    density := 1.097 - (0.00046971 * sum7) + (0.00000056 * sum7 * sum7) - (0.00012828 * age);
  END IF;
  fat_pct := (495.0 / density) - 450.0;
  RETURN ROUND(fat_pct::NUMERIC, 2);
END;
$$;

-- RCQ Classification
CREATE OR REPLACE FUNCTION classify_rcq(gender TEXT, age INTEGER, rcq NUMERIC)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF gender = 'MALE' THEN
    IF rcq < 0.83 THEN RETURN 'Baixo'; ELSIF rcq < 0.88 THEN RETURN 'Moderado'; ELSIF rcq < 0.95 THEN RETURN 'Alto'; ELSE RETURN 'Muito Alto'; END IF;
  ELSE
    IF rcq < 0.71 THEN RETURN 'Baixo'; ELSIF rcq < 0.77 THEN RETURN 'Moderado'; ELSIF rcq < 0.82 THEN RETURN 'Alto'; ELSE RETURN 'Muito Alto'; END IF;
  END IF;
END;
$$;

-- =============================================
-- TRIGGER: auto-update updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_alunos_updated_at BEFORE UPDATE ON alunos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_anamneses_updated_at BEFORE UPDATE ON anamneses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pt_updated_at BEFORE UPDATE ON personal_trainers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- TRIGGER: auto-create personal_trainer on user signup
-- =============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO personal_trainers (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
