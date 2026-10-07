-- supabase/migrations/20261006000002_recalculo_idade_e_classificacao.sql

-- Recalcula dados derivados de todas as avaliações usando a idade NA DATA da avaliação
-- (antes era a idade no dia do salvamento) e a tabela de % de gordura da Omron HBF-514C.
-- Idempotente: valores são determinísticos e só atualiza quando muda (IS DISTINCT FROM).
-- Não usa as funções legadas public.classify_body_fat / calc_jackson_pollock_7.

-- 1) Classificação do % de gordura (bioimpedância) — tabela Omron HBF-514C (Gallagher 2000).
--    Fonte: https://omronbrasil.com/wp-content/uploads/2023/07/balanca_HBF-514C-LA_ES_-PT_im-2.pdf
--    Limites [normal, alto, muito_alto]; menores de 20 anos usam a faixa 20–39.
WITH base AS (
  SELECT a.id,
         a.body_fat_percentage AS pct,
         al.gender,
         date_part('year', age(a.date, al.birth_date))::int AS idade
  FROM public.avaliacoes a
  JOIN public.alunos al ON al.id = a.aluno_id
  WHERE a.body_fat_percentage IS NOT NULL
),
limites AS (
  SELECT id, pct,
    CASE
      WHEN gender = 'MALE'   AND idade < 40 THEN ARRAY[8, 20, 25]
      WHEN gender = 'MALE'   AND idade < 60 THEN ARRAY[11, 22, 28]
      WHEN gender = 'MALE'                  THEN ARRAY[13, 25, 30]
      WHEN gender = 'FEMALE' AND idade < 40 THEN ARRAY[21, 33, 39]
      WHEN gender = 'FEMALE' AND idade < 60 THEN ARRAY[23, 34, 40]
      WHEN gender = 'FEMALE'                THEN ARRAY[24, 36, 42]
    END AS t
  FROM base
),
classif AS (
  SELECT id,
    CASE
      WHEN pct < t[1] THEN 'Baixo'
      WHEN pct < t[2] THEN 'Normal'
      WHEN pct < t[3] THEN 'Alto'
      ELSE 'Muito Alto'
    END AS classe
  FROM limites
  WHERE t IS NOT NULL
)
UPDATE public.avaliacoes a
SET body_fat_classification = c.classe
FROM classif c
WHERE c.id = a.id
  AND a.body_fat_classification IS DISTINCT FROM c.classe;

-- 2) % de gordura por dobras: Jackson & Pollock 7 dobras + Siri, idade na data da avaliação.
--    Mesma conta do TS (calcJacksonPollock7): float8, soma na mesma ordem e
--    arredondamento Math.round(x * 100) / 100 ≡ floor(x * 100 + 0.5) / 100.
WITH base AS (
  SELECT d.id,
         al.gender,
         date_part('year', age(a.date, al.birth_date))::int AS idade,
         ( d.chest_mm::float8 + d.midaxillary_mm::float8 + d.triceps_mm::float8
         + d.subscapular_mm::float8 + d.abdominal_mm::float8 + d.suprailiac_mm::float8
         + d.mid_thigh_mm::float8 ) AS s
  FROM public.dobras_cutaneas d
  JOIN public.avaliacoes a ON a.id = d.avaliacao_id
  JOIN public.alunos al ON al.id = a.aluno_id
),
densidade AS (
  SELECT id,
    CASE gender
      WHEN 'MALE'   THEN 1.112::float8 - (0.00043499::float8 * s) + (0.00000055::float8 * s * s) - (0.00028826::float8 * idade)
      WHEN 'FEMALE' THEN 1.097::float8 - (0.00046971::float8 * s) + (0.00000056::float8 * s * s) - (0.00012828::float8 * idade)
    END AS dc
  FROM base
  WHERE s IS NOT NULL
),
gordura AS (
  SELECT id, (floor(((495 / dc) - 450) * 100 + 0.5) / 100)::numeric AS fat
  FROM densidade
  WHERE dc IS NOT NULL
)
UPDATE public.dobras_cutaneas d
SET fat_percentage = g.fat
FROM gordura g
WHERE g.id = d.id
  AND d.fat_percentage IS DISTINCT FROM g.fat;

-- 3) Espelha o % de gordura por dobras recalculado na avaliação correspondente.
UPDATE public.avaliacoes a
SET skinfolds_fat_percentage = d.fat_percentage
FROM public.dobras_cutaneas d
WHERE d.avaliacao_id = a.id
  AND d.fat_percentage IS NOT NULL
  AND a.skinfolds_fat_percentage IS DISTINCT FROM d.fat_percentage;
