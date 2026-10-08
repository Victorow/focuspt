-- Migração 20260613050122 — cópia exata do SQL aplicado em produção (supabase_migrations.schema_migrations). Não editar: crie uma nova migration.
-- LGPD: fotos de evolução são dados pessoais sensíveis.
-- Torna o bucket privado; o acesso passa a ser via URL assinada temporária.
UPDATE storage.buckets SET public = false WHERE id = 'fotos-alunos';