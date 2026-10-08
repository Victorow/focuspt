-- Sincroniza objetos que existem em produção mas foram criados fora das migrations
-- (pelo dashboard): os 2 buckets do Storage e 4 policies de storage.objects.
--
-- Em PRODUÇÃO esta migration é um NO-OP: tudo é condicional (só cria se não existir)
-- e as definições são idênticas às de produção. Num banco NOVO, ela deixa o schema
-- igual ao de produção. Idempotente (pode rodar mais de uma vez).

-- 1) Buckets (privados; acesso via URL assinada)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT v.id, v.name, v.public, v.file_size_limit, v.allowed_mime_types
FROM (VALUES
  ('fotos-alunos',     'fotos-alunos',     false, 5242880::bigint, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('lgpd-assinaturas', 'lgpd-assinaturas', false, 2097152::bigint, ARRAY['image/png']::text[])
) AS v(id, name, public, file_size_limit, allowed_mime_types)
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = v.id)
ON CONFLICT (id) DO NOTHING;

-- 2) Policies de storage.objects (cada treinador só acessa a pasta <auth.uid()>/...)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                 AND policyname = 'PT can upload own student photos') THEN
    CREATE POLICY "PT can upload own student photos"
      ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'fotos-alunos'
        AND (auth.uid())::text = (storage.foldername(name))[1]
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                 AND policyname = 'PT can delete own student photos') THEN
    CREATE POLICY "PT can delete own student photos"
      ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'fotos-alunos'
        AND (auth.uid())::text = (storage.foldername(name))[1]
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                 AND policyname = 'PT upload lgpd signature') THEN
    CREATE POLICY "PT upload lgpd signature"
      ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'lgpd-assinaturas'
        AND (auth.uid())::text = (storage.foldername(name))[1]
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                 AND policyname = 'PT view lgpd signatures') THEN
    CREATE POLICY "PT view lgpd signatures"
      ON storage.objects
      FOR SELECT
      USING (
        bucket_id = 'lgpd-assinaturas'
        AND (auth.uid())::text = (storage.foldername(name))[1]
      );
  END IF;
END
$$;
