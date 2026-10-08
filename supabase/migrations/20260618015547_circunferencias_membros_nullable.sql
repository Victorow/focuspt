-- Migração 20260618015547 — cópia exata do SQL aplicado em produção (supabase_migrations.schema_migrations). Não editar: crie uma nova migration.
ALTER TABLE public.circunferencias
  ALTER COLUMN right_arm_relaxed_cm     DROP NOT NULL,
  ALTER COLUMN left_arm_relaxed_cm      DROP NOT NULL,
  ALTER COLUMN right_arm_flexed_cm      DROP NOT NULL,
  ALTER COLUMN left_arm_flexed_cm       DROP NOT NULL,
  ALTER COLUMN right_thigh_proximal_cm  DROP NOT NULL,
  ALTER COLUMN left_thigh_proximal_cm   DROP NOT NULL,
  ALTER COLUMN right_calf_cm            DROP NOT NULL,
  ALTER COLUMN left_calf_cm             DROP NOT NULL;