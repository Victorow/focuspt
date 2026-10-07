-- supabase/migrations/20261006000001_dobras_biceps_panturrilha_opcionais.sql

-- Bíceps e panturrilha passam a ser opcionais (não fazem parte do JP7).
-- Os CHECKs (> 0) continuam valendo: NULL é aceito, zero/negativo não.
ALTER TABLE public.dobras_cutaneas
  ALTER COLUMN biceps_mm DROP NOT NULL,
  ALTER COLUMN calf_mm   DROP NOT NULL;

-- Recalcula o somatório com apenas as 7 dobras do Jackson & Pollock
-- (antes somava 9, incluindo bíceps e panturrilha). fat_percentage já estava correto.
UPDATE public.dobras_cutaneas
SET sum_mm = triceps_mm + subscapular_mm + chest_mm + midaxillary_mm
           + suprailiac_mm + abdominal_mm + mid_thigh_mm;

-- Espelha o somatório corrigido na avaliação correspondente.
UPDATE public.avaliacoes a
SET skinfolds_sum_mm = d.sum_mm
FROM public.dobras_cutaneas d
WHERE d.avaliacao_id = a.id;
