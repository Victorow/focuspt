-- Migração 20260620142826 — cópia exata do SQL aplicado em produção (supabase_migrations.schema_migrations). Não editar: crie uma nova migration.
alter table public.fotos drop constraint if exists fotos_category_check;

alter table public.fotos add constraint fotos_category_check
  check (category in ('FRENTE', 'LADO_DIREITO', 'LADO_ESQUERDO', 'COSTAS', 'PERFIL'));