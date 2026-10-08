-- Migração 20260613043949 — cópia exata do SQL aplicado em produção (supabase_migrations.schema_migrations). Não editar: crie uma nova migration.
-- RLS já escopa cada treinador aos próprios dados; SECURITY INVOKER respeita o RLS
-- do chamador (defesa em profundidade) e remove o aviso de SECURITY DEFINER.
ALTER FUNCTION public.get_dashboard_stats() SECURITY INVOKER;