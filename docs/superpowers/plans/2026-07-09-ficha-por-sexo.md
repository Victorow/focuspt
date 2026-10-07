# Ficha por Sexo (Coxa Medial/Distal, Busto, Ciclo Menstrual) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Coxa Medial/Distal (ambos os lados), Busto/Mamas (mulher) e ciclo menstrual (mulher) à ficha de avaliação física do FocusPT, com formulário, PDF e banco atualizados e validados end-to-end.

**Architecture:** Extensão aditiva do schema Postgres (`circunferencias`, `avaliacoes`) + da RPC `save_avaliacao`, do edge function `avaliacoes` (passthrough dos novos campos) e do formulário Angular reativo (`components.ts`), reaproveitando os helpers puros existentes de `pdf-report.ts` e adicionando dois novos helpers puros em `assessment-utils.ts`. Nenhum campo novo é obrigatório; nenhuma fórmula de cálculo é alterada.

**Tech Stack:** Angular (standalone components, Reactive Forms), Supabase (Postgres + Edge Functions Deno), Vitest (`src/tests`), MCP Supabase (projeto `qhdkacasbbfilqqywosj`).

## Global Constraints

- Nenhum campo novo é obrigatório (todos opcionais, mesmo padrão do Antebraço existente).
- Coxa Medial/Distal NÃO entram na regra de "lado completo" (`rightSideFields`/`leftSideFields` em `components.ts` não mudam).
- Busto e campos de ciclo menstrual só aparecem na UI quando `aluno.gender === 'FEMALE'`; nenhum CHECK de sexo no banco.
- Ciclo menstrual (data + regularidade) é por avaliação, não por aluno.
- Nenhuma fórmula de cálculo (BMI, % gordura, RCQ etc.) passa a usar os campos novos.
- Deno CLI não está disponível neste ambiente — mudanças no edge function são validadas por revisão de código + round-trip da RPC via MCP + smoke test manual no navegador, não por `deno test`.

---

### Task 1: Migration — colunas novas + `save_avaliacao`

**Files:**
- Create: `supabase/migrations/20260709000001_ficha_por_sexo.sql`

**Interfaces:**
- Produces: colunas `circunferencias.right_thigh_medial_cm`, `left_thigh_medial_cm`, `right_thigh_distal_cm`, `left_thigh_distal_cm`, `bust_cm` (numeric, nullable, `CHECK (> 0)`); colunas `avaliacoes.last_menstruation_date` (date, nullable), `avaliacoes.menstrual_cycle_regular` (boolean, nullable); função `public.save_avaliacao(uuid, jsonb, jsonb, jsonb, jsonb)` atualizada (mesma assinatura).

- [ ] **Step 1: Escrever o arquivo de migration**

```sql
-- supabase/migrations/20260709000001_ficha_por_sexo.sql

-- Coxa medial/distal (opcionais, mesmo padrão de antebraço/coxa proximal) + busto (só mulher, mas sem CHECK de sexo no banco).
ALTER TABLE public.circunferencias
  ADD COLUMN right_thigh_medial_cm numeric CHECK (right_thigh_medial_cm > 0),
  ADD COLUMN left_thigh_medial_cm  numeric CHECK (left_thigh_medial_cm > 0),
  ADD COLUMN right_thigh_distal_cm numeric CHECK (right_thigh_distal_cm > 0),
  ADD COLUMN left_thigh_distal_cm  numeric CHECK (left_thigh_distal_cm > 0),
  ADD COLUMN bust_cm               numeric CHECK (bust_cm > 0);

-- Ciclo menstrual: por avaliação (não por aluno), sem CHECK de sexo.
ALTER TABLE public.avaliacoes
  ADD COLUMN last_menstruation_date date,
  ADD COLUMN menstrual_cycle_regular boolean;

-- Recria save_avaliacao (só existia no banco, não versionada) incluindo os novos campos.
CREATE OR REPLACE FUNCTION public.save_avaliacao(
  p_avaliacao_id uuid, p_avaliacao jsonb, p_bio jsonb, p_dobras jsonb, p_circ jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_avaliacao_id IS NULL THEN
    INSERT INTO avaliacoes (
      aluno_id, date, bmi, bmi_classification, body_fat_percentage, fat_mass_kg,
      lean_mass_kg, body_fat_classification, visceral_risk, skinfolds_fat_percentage,
      skinfolds_sum_mm, rcq, last_menstruation_date, menstrual_cycle_regular
    ) VALUES (
      (p_avaliacao->>'aluno_id')::uuid,
      (p_avaliacao->>'date')::date,
      (p_avaliacao->>'bmi')::numeric,
      p_avaliacao->>'bmi_classification',
      (p_avaliacao->>'body_fat_percentage')::numeric,
      (p_avaliacao->>'fat_mass_kg')::numeric,
      (p_avaliacao->>'lean_mass_kg')::numeric,
      p_avaliacao->>'body_fat_classification',
      p_avaliacao->>'visceral_risk',
      (p_avaliacao->>'skinfolds_fat_percentage')::numeric,
      (p_avaliacao->>'skinfolds_sum_mm')::numeric,
      (p_avaliacao->>'rcq')::numeric,
      (p_avaliacao->>'last_menstruation_date')::date,
      (p_avaliacao->>'menstrual_cycle_regular')::boolean
    ) RETURNING id INTO v_id;

    INSERT INTO bioimpedancias (
      avaliacao_id, perfil_bioimpedancia, is_athlete, weight_kg, bmi, body_fat_percentage,
      skeletal_muscle_percentage, resting_metabolism_kcal, body_age, visceral_fat_level,
      water_percentage, fat_mass_kg, lean_mass_kg
    ) VALUES (
      v_id,
      (p_bio->>'perfil_bioimpedancia')::int,
      COALESCE((p_bio->>'is_athlete')::boolean, false),
      (p_bio->>'weight_kg')::numeric,
      (p_bio->>'bmi')::numeric,
      (p_bio->>'body_fat_percentage')::numeric,
      (p_bio->>'skeletal_muscle_percentage')::numeric,
      (p_bio->>'resting_metabolism_kcal')::int,
      (p_bio->>'body_age')::int,
      (p_bio->>'visceral_fat_level')::int,
      (p_bio->>'water_percentage')::numeric,
      (p_bio->>'fat_mass_kg')::numeric,
      (p_bio->>'lean_mass_kg')::numeric
    );

    INSERT INTO dobras_cutaneas (
      avaliacao_id, protocol, triceps_mm, biceps_mm, subscapular_mm, chest_mm,
      midaxillary_mm, suprailiac_mm, abdominal_mm, mid_thigh_mm, calf_mm, sum_mm, fat_percentage
    ) VALUES (
      v_id,
      COALESCE(p_dobras->>'protocol', '7_dobras'),
      (p_dobras->>'triceps_mm')::numeric,
      (p_dobras->>'biceps_mm')::numeric,
      (p_dobras->>'subscapular_mm')::numeric,
      (p_dobras->>'chest_mm')::numeric,
      (p_dobras->>'midaxillary_mm')::numeric,
      (p_dobras->>'suprailiac_mm')::numeric,
      (p_dobras->>'abdominal_mm')::numeric,
      (p_dobras->>'mid_thigh_mm')::numeric,
      (p_dobras->>'calf_mm')::numeric,
      (p_dobras->>'sum_mm')::numeric,
      (p_dobras->>'fat_percentage')::numeric
    );

    INSERT INTO circunferencias (
      avaliacao_id, neck_cm, shoulder_cm, chest_cm, waist_cm, abdomen_cm, hip_cm,
      right_arm_relaxed_cm, left_arm_relaxed_cm, right_arm_flexed_cm, left_arm_flexed_cm,
      right_forearm_cm, left_forearm_cm, right_thigh_proximal_cm, left_thigh_proximal_cm,
      right_thigh_medial_cm, left_thigh_medial_cm, right_thigh_distal_cm, left_thigh_distal_cm,
      right_calf_cm, left_calf_cm, rcq, bust_cm
    ) VALUES (
      v_id,
      (p_circ->>'neck_cm')::numeric,
      (p_circ->>'shoulder_cm')::numeric,
      (p_circ->>'chest_cm')::numeric,
      (p_circ->>'waist_cm')::numeric,
      (p_circ->>'abdomen_cm')::numeric,
      (p_circ->>'hip_cm')::numeric,
      (p_circ->>'right_arm_relaxed_cm')::numeric,
      (p_circ->>'left_arm_relaxed_cm')::numeric,
      (p_circ->>'right_arm_flexed_cm')::numeric,
      (p_circ->>'left_arm_flexed_cm')::numeric,
      (p_circ->>'right_forearm_cm')::numeric,
      (p_circ->>'left_forearm_cm')::numeric,
      (p_circ->>'right_thigh_proximal_cm')::numeric,
      (p_circ->>'left_thigh_proximal_cm')::numeric,
      (p_circ->>'right_thigh_medial_cm')::numeric,
      (p_circ->>'left_thigh_medial_cm')::numeric,
      (p_circ->>'right_thigh_distal_cm')::numeric,
      (p_circ->>'left_thigh_distal_cm')::numeric,
      (p_circ->>'right_calf_cm')::numeric,
      (p_circ->>'left_calf_cm')::numeric,
      (p_circ->>'rcq')::numeric,
      (p_circ->>'bust_cm')::numeric
    );
  ELSE
    UPDATE avaliacoes SET
      date = (p_avaliacao->>'date')::date,
      bmi = (p_avaliacao->>'bmi')::numeric,
      bmi_classification = p_avaliacao->>'bmi_classification',
      body_fat_percentage = (p_avaliacao->>'body_fat_percentage')::numeric,
      fat_mass_kg = (p_avaliacao->>'fat_mass_kg')::numeric,
      lean_mass_kg = (p_avaliacao->>'lean_mass_kg')::numeric,
      body_fat_classification = p_avaliacao->>'body_fat_classification',
      visceral_risk = p_avaliacao->>'visceral_risk',
      skinfolds_fat_percentage = (p_avaliacao->>'skinfolds_fat_percentage')::numeric,
      skinfolds_sum_mm = (p_avaliacao->>'skinfolds_sum_mm')::numeric,
      rcq = (p_avaliacao->>'rcq')::numeric,
      last_menstruation_date = (p_avaliacao->>'last_menstruation_date')::date,
      menstrual_cycle_regular = (p_avaliacao->>'menstrual_cycle_regular')::boolean
    WHERE id = p_avaliacao_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Avaliacao nao encontrada ou sem permissao';
    END IF;
    v_id := p_avaliacao_id;

    UPDATE bioimpedancias SET
      perfil_bioimpedancia = (p_bio->>'perfil_bioimpedancia')::int,
      is_athlete = COALESCE((p_bio->>'is_athlete')::boolean, false),
      weight_kg = (p_bio->>'weight_kg')::numeric,
      bmi = (p_bio->>'bmi')::numeric,
      body_fat_percentage = (p_bio->>'body_fat_percentage')::numeric,
      skeletal_muscle_percentage = (p_bio->>'skeletal_muscle_percentage')::numeric,
      resting_metabolism_kcal = (p_bio->>'resting_metabolism_kcal')::int,
      body_age = (p_bio->>'body_age')::int,
      visceral_fat_level = (p_bio->>'visceral_fat_level')::int,
      water_percentage = (p_bio->>'water_percentage')::numeric,
      fat_mass_kg = (p_bio->>'fat_mass_kg')::numeric,
      lean_mass_kg = (p_bio->>'lean_mass_kg')::numeric
    WHERE avaliacao_id = v_id;

    UPDATE dobras_cutaneas SET
      protocol = COALESCE(p_dobras->>'protocol', '7_dobras'),
      triceps_mm = (p_dobras->>'triceps_mm')::numeric,
      biceps_mm = (p_dobras->>'biceps_mm')::numeric,
      subscapular_mm = (p_dobras->>'subscapular_mm')::numeric,
      chest_mm = (p_dobras->>'chest_mm')::numeric,
      midaxillary_mm = (p_dobras->>'midaxillary_mm')::numeric,
      suprailiac_mm = (p_dobras->>'suprailiac_mm')::numeric,
      abdominal_mm = (p_dobras->>'abdominal_mm')::numeric,
      mid_thigh_mm = (p_dobras->>'mid_thigh_mm')::numeric,
      calf_mm = (p_dobras->>'calf_mm')::numeric,
      sum_mm = (p_dobras->>'sum_mm')::numeric,
      fat_percentage = (p_dobras->>'fat_percentage')::numeric
    WHERE avaliacao_id = v_id;

    UPDATE circunferencias SET
      neck_cm = (p_circ->>'neck_cm')::numeric,
      shoulder_cm = (p_circ->>'shoulder_cm')::numeric,
      chest_cm = (p_circ->>'chest_cm')::numeric,
      waist_cm = (p_circ->>'waist_cm')::numeric,
      abdomen_cm = (p_circ->>'abdomen_cm')::numeric,
      hip_cm = (p_circ->>'hip_cm')::numeric,
      right_arm_relaxed_cm = (p_circ->>'right_arm_relaxed_cm')::numeric,
      left_arm_relaxed_cm = (p_circ->>'left_arm_relaxed_cm')::numeric,
      right_arm_flexed_cm = (p_circ->>'right_arm_flexed_cm')::numeric,
      left_arm_flexed_cm = (p_circ->>'left_arm_flexed_cm')::numeric,
      right_forearm_cm = (p_circ->>'right_forearm_cm')::numeric,
      left_forearm_cm = (p_circ->>'left_forearm_cm')::numeric,
      right_thigh_proximal_cm = (p_circ->>'right_thigh_proximal_cm')::numeric,
      left_thigh_proximal_cm = (p_circ->>'left_thigh_proximal_cm')::numeric,
      right_thigh_medial_cm = (p_circ->>'right_thigh_medial_cm')::numeric,
      left_thigh_medial_cm = (p_circ->>'left_thigh_medial_cm')::numeric,
      right_thigh_distal_cm = (p_circ->>'right_thigh_distal_cm')::numeric,
      left_thigh_distal_cm = (p_circ->>'left_thigh_distal_cm')::numeric,
      right_calf_cm = (p_circ->>'right_calf_cm')::numeric,
      left_calf_cm = (p_circ->>'left_calf_cm')::numeric,
      rcq = (p_circ->>'rcq')::numeric,
      bust_cm = (p_circ->>'bust_cm')::numeric
    WHERE avaliacao_id = v_id;
  END IF;

  RETURN v_id;
END;
$function$;
```

- [ ] **Step 2: Aplicar a migration no projeto real via MCP**

Chamar `mcp__supabase__apply_migration` com `name: "ficha_por_sexo"` e `query` = conteúdo do arquivo acima.

- [ ] **Step 3: Verificar as colunas novas via MCP**

Chamar `mcp__supabase__list_tables` (schemas `["public"]`, `verbose: true`) e confirmar que `circunferencias` tem `right_thigh_medial_cm`, `left_thigh_medial_cm`, `right_thigh_distal_cm`, `left_thigh_distal_cm`, `bust_cm`, e que `avaliacoes` tem `last_menstruation_date`, `menstrual_cycle_regular`.
Expected: as 7 colunas aparecem, todas `"nullable"`.

- [ ] **Step 4: Round-trip da RPC (INSERT) via MCP `execute_sql`**

```sql
-- usa o personal_trainer_id real já existente no projeto (há só 1 hoje)
WITH pt AS (SELECT id FROM personal_trainers LIMIT 1)
INSERT INTO alunos (personal_trainer_id, name, birth_date, gender, height_cm, goal)
SELECT id, 'TESTE MCP - APAGAR', '1995-01-01', 'FEMALE', 165, 'teste automatizado'
FROM pt
RETURNING id;
```

Anotar o `id` retornado como `<aluno_teste_id>`, depois:

```sql
SELECT save_avaliacao(
  NULL,
  jsonb_build_object(
    'aluno_id', '<aluno_teste_id>', 'date', '2026-07-09',
    'bmi', 22.5, 'bmi_classification', 'Normal', 'body_fat_percentage', 24.0,
    'fat_mass_kg', 15.0, 'lean_mass_kg', 48.0, 'body_fat_classification', 'Normal',
    'visceral_risk', 'NORMAL', 'skinfolds_fat_percentage', 23.5, 'skinfolds_sum_mm', 120,
    'rcq', 0.8, 'last_menstruation_date', '2026-06-20', 'menstrual_cycle_regular', true
  ),
  jsonb_build_object(
    'weight_kg', 63, 'body_fat_percentage', 24.0, 'skeletal_muscle_percentage', 30,
    'resting_metabolism_kcal', 1400, 'body_age', 30, 'visceral_fat_level', 4
  ),
  jsonb_build_object(
    'triceps_mm', 15, 'biceps_mm', 8, 'subscapular_mm', 12, 'chest_mm', 10,
    'midaxillary_mm', 11, 'suprailiac_mm', 14, 'abdominal_mm', 20, 'mid_thigh_mm', 18, 'calf_mm', 9
  ),
  jsonb_build_object(
    'neck_cm', 32, 'shoulder_cm', 100, 'chest_cm', 88, 'waist_cm', 70, 'abdomen_cm', 75, 'hip_cm', 95,
    'right_thigh_medial_cm', 48.5, 'left_thigh_medial_cm', 48.2,
    'right_thigh_distal_cm', 40.1, 'left_thigh_distal_cm', 39.8,
    'bust_cm', 92.0
  )
) AS avaliacao_id;
```

Anotar o `avaliacao_id` retornado, depois:

```sql
SELECT a.last_menstruation_date, a.menstrual_cycle_regular,
       c.right_thigh_medial_cm, c.left_thigh_medial_cm,
       c.right_thigh_distal_cm, c.left_thigh_distal_cm, c.bust_cm
FROM avaliacoes a JOIN circunferencias c ON c.avaliacao_id = a.id
WHERE a.id = '<avaliacao_id>';
```

Expected: `last_menstruation_date = 2026-06-20`, `menstrual_cycle_regular = true`, `right_thigh_medial_cm = 48.5`, `left_thigh_medial_cm = 48.2`, `right_thigh_distal_cm = 40.1`, `left_thigh_distal_cm = 39.8`, `bust_cm = 92.0`.

- [ ] **Step 5: Round-trip da RPC (UPDATE) via MCP `execute_sql`**

```sql
SELECT save_avaliacao(
  '<avaliacao_id>',
  jsonb_build_object(
    'date', '2026-07-09', 'bmi', 22.5, 'bmi_classification', 'Normal', 'body_fat_percentage', 24.0,
    'fat_mass_kg', 15.0, 'lean_mass_kg', 48.0, 'body_fat_classification', 'Normal',
    'visceral_risk', 'NORMAL', 'skinfolds_fat_percentage', 23.5, 'skinfolds_sum_mm', 120,
    'rcq', 0.8, 'last_menstruation_date', '2026-07-01', 'menstrual_cycle_regular', false
  ),
  jsonb_build_object(
    'weight_kg', 63, 'body_fat_percentage', 24.0, 'skeletal_muscle_percentage', 30,
    'resting_metabolism_kcal', 1400, 'body_age', 30, 'visceral_fat_level', 4
  ),
  jsonb_build_object(
    'triceps_mm', 15, 'biceps_mm', 8, 'subscapular_mm', 12, 'chest_mm', 10,
    'midaxillary_mm', 11, 'suprailiac_mm', 14, 'abdominal_mm', 20, 'mid_thigh_mm', 18, 'calf_mm', 9
  ),
  jsonb_build_object(
    'neck_cm', 32, 'shoulder_cm', 100, 'chest_cm', 88, 'waist_cm', 70, 'abdomen_cm', 75, 'hip_cm', 95,
    'right_thigh_medial_cm', 49.0, 'left_thigh_medial_cm', 48.7,
    'bust_cm', 93.0
  )
) AS avaliacao_id;
```

Note: no update, `right_thigh_distal_cm`/`left_thigh_distal_cm` foram omitidos de propósito — devem virar `NULL` (confirma que campo opcional realmente aceita ausência).

Repetir a query de verificação do Step 4. Expected: `menstrual_cycle_regular = false`, `last_menstruation_date = 2026-07-01`, `right_thigh_medial_cm = 49.0`, `bust_cm = 93.0`, e `right_thigh_distal_cm`/`left_thigh_distal_cm` agora `NULL`.

- [ ] **Step 6: Limpar os dados de teste via MCP `execute_sql`**

```sql
DELETE FROM circunferencias WHERE avaliacao_id = '<avaliacao_id>';
DELETE FROM bioimpedancias WHERE avaliacao_id = '<avaliacao_id>';
DELETE FROM dobras_cutaneas WHERE avaliacao_id = '<avaliacao_id>';
DELETE FROM avaliacoes WHERE id = '<avaliacao_id>';
DELETE FROM alunos WHERE id = '<aluno_teste_id>';
```

Expected: todas as 5 queries retornam sem erro; uma última `SELECT * FROM alunos WHERE name = 'TESTE MCP - APAGAR'` retorna zero linhas.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260709000001_ficha_por_sexo.sql
git commit -m "feat(db): coxa medial/distal, busto e ciclo menstrual + versiona save_avaliacao"
```

---

### Task 2: Backend — Edge Function `avaliacoes`

**Files:**
- Modify: `supabase/functions/avaliacoes/index.ts:75-93` (bloco `p_circ` dentro de `buildPayloads`)
- Modify: `supabase/functions/avaliacoes/index.ts:32-46` (bloco `p_avaliacao` dentro de `buildPayloads`)

**Interfaces:**
- Consumes: `body.circumferences.{right,left}_thigh_{medial,distal}_cm`, `body.circumferences.bust_cm`, `body.last_menstruation_date`, `body.menstrual_cycle_regular` (vindos do payload JSON enviado pelo frontend).
- Produces: `p_avaliacao.last_menstruation_date`, `p_avaliacao.menstrual_cycle_regular`, `p_circ.right_thigh_medial_cm`, `p_circ.left_thigh_medial_cm`, `p_circ.right_thigh_distal_cm`, `p_circ.left_thigh_distal_cm`, `p_circ.bust_cm` — todos passados para a RPC `save_avaliacao` (Task 1).

- [ ] **Step 1: Editar `p_avaliacao` para incluir os campos de ciclo menstrual**

Em `supabase/functions/avaliacoes/index.ts`, dentro de `buildPayloads`, o `return` de `p_avaliacao` (linhas ~33-46) passa a:

```typescript
    p_avaliacao: {
      aluno_id: aluno.id,
      date,
      bmi,
      bmi_classification: classifyBmi(bmi),
      body_fat_percentage: fatPct,
      fat_mass_kg: fatMassKg,
      lean_mass_kg: leanMassKg,
      body_fat_classification: classifyBodyFat(gender, age, fatPct),
      visceral_risk: visceralRisk,
      skinfolds_fat_percentage: skinfoldsFatPct,
      skinfolds_sum_mm: skinfoldsSum,
      rcq,
      last_menstruation_date: body.last_menstruation_date ?? null,
      menstrual_cycle_regular: body.menstrual_cycle_regular ?? null,
    },
```

- [ ] **Step 2: Editar `p_circ` para incluir os 5 campos novos**

No mesmo `buildPayloads`, o `p_circ` (linhas ~75-93) passa a:

```typescript
    p_circ: {
      neck_cm: circumferences.neck_cm,
      shoulder_cm: circumferences.shoulder_cm,
      chest_cm: circumferences.chest_cm,
      waist_cm: circumferences.waist_cm,
      abdomen_cm: circumferences.abdomen_cm,
      hip_cm: circumferences.hip_cm,
      right_arm_relaxed_cm: circumferences.right_arm_relaxed_cm ?? null,
      left_arm_relaxed_cm: circumferences.left_arm_relaxed_cm ?? null,
      right_arm_flexed_cm: circumferences.right_arm_flexed_cm ?? null,
      left_arm_flexed_cm: circumferences.left_arm_flexed_cm ?? null,
      right_forearm_cm: circumferences.right_forearm_cm ?? null,
      left_forearm_cm: circumferences.left_forearm_cm ?? null,
      right_thigh_proximal_cm: circumferences.right_thigh_proximal_cm ?? null,
      left_thigh_proximal_cm: circumferences.left_thigh_proximal_cm ?? null,
      right_thigh_medial_cm: circumferences.right_thigh_medial_cm ?? null,
      left_thigh_medial_cm: circumferences.left_thigh_medial_cm ?? null,
      right_thigh_distal_cm: circumferences.right_thigh_distal_cm ?? null,
      left_thigh_distal_cm: circumferences.left_thigh_distal_cm ?? null,
      right_calf_cm: circumferences.right_calf_cm ?? null,
      left_calf_cm: circumferences.left_calf_cm ?? null,
      rcq,
      bust_cm: circumferences.bust_cm ?? null,
    },
```

- [ ] **Step 3: Revisão manual do diff**

Confirmar (leitura do arquivo) que os 7 campos novos seguem exatamente o padrão `campo ?? null` já usado por `right_forearm_cm`, e que nenhum campo existente foi removido ou reordenado de forma que quebre a RPC (a RPC lê por nome via `->>'campo'`, então ordem não importa, mas nomes têm que casar com os da migration da Task 1).

- [ ] **Step 4: Deploy via MCP**

Chamar `mcp__supabase__deploy_edge_function` com:
- `name`: `"avaliacoes"`
- `entrypoint_path`: `"index.ts"`
- `verify_jwt`: `true`
- `files`: conteúdo atual de `supabase/functions/avaliacoes/index.ts`, `supabase/functions/_shared/cors.ts`, `supabase/functions/_shared/supabase.ts`, `supabase/functions/_shared/calculations.ts` (nomes relativos: `index.ts`, `_shared/cors.ts`, `_shared/supabase.ts`, `_shared/calculations.ts` — mesmo layout já ativo hoje, sem import map).

Expected: resposta com `status: "ACTIVE"` e `version` incrementada em relação à atual (hoje é `6`).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/avaliacoes/index.ts
git commit -m "feat(api): repassa coxa medial/distal, busto e ciclo menstrual na avaliacao"
```

---

### Task 3: Frontend — Modelos de dados (`data.ts`)

**Files:**
- Modify: `src/app/data.ts:42-61` (`Circumferences`)
- Modify: `src/app/data.ts:93-111` (`Assessment`)
- Modify: `src/app/data.ts:151-176` (`CreateStudentPayload` fica igual; `CreateAssessmentPayload`/`UpdateAssessmentPayload` mudam)

**Interfaces:**
- Produces: `Circumferences.right_thigh_medial_cm?`, `left_thigh_medial_cm?`, `right_thigh_distal_cm?`, `left_thigh_distal_cm?`, `bust_cm?` (todos `number`); `Assessment.last_menstruation_date?: string | null`, `Assessment.menstrual_cycle_regular?: boolean | null`; `CreateAssessmentPayload`/`UpdateAssessmentPayload` ganham `last_menstruation_date?: string | null` e `menstrual_cycle_regular?: boolean | null` no nível raiz.

- [ ] **Step 1: Atualizar `Circumferences`**

```typescript
export interface Circumferences {
  neck_cm: number;
  shoulder_cm: number;
  chest_cm: number;
  waist_cm: number;
  abdomen_cm: number;
  hip_cm: number;
  bust_cm?: number;
  // Membros bilaterais opcionais: o personal pode medir só o lado predominante.
  right_arm_relaxed_cm?: number;
  left_arm_relaxed_cm?: number;
  right_arm_flexed_cm?: number;
  left_arm_flexed_cm?: number;
  right_forearm_cm?: number;
  left_forearm_cm?: number;
  right_thigh_proximal_cm?: number;
  left_thigh_proximal_cm?: number;
  right_thigh_medial_cm?: number;
  left_thigh_medial_cm?: number;
  right_thigh_distal_cm?: number;
  left_thigh_distal_cm?: number;
  right_calf_cm?: number;
  left_calf_cm?: number;
  rcq?: number;
}
```

- [ ] **Step 2: Atualizar `Assessment`**

```typescript
export interface Assessment {
  id: string;
  date: string;
  bmi: number;
  bmi_classification: string;
  body_fat_percentage: number;
  fat_mass_kg: number;
  lean_mass_kg: number;
  body_fat_classification: string;
  visceral_risk: 'NORMAL' | 'HIGH' | 'VERY_HIGH';
  skinfolds_fat_percentage: number;
  skinfolds_sum_mm: number;
  rcq: number;
  last_menstruation_date?: string | null;
  menstrual_cycle_regular?: boolean | null;
  bioimpedancias: Bioimpedance;
  dobras_cutaneas: Skinfolds;
  circunferencias: Circumferences;
  observacoes?: string | null;
  deleted_at?: string | null;
}
```

- [ ] **Step 3: Atualizar `CreateAssessmentPayload` e `UpdateAssessmentPayload`**

```typescript
export interface CreateAssessmentPayload {
  aluno_id: string;
  date: string;
  last_menstruation_date?: string | null;
  menstrual_cycle_regular?: boolean | null;
  bioimpedance: Omit<Bioimpedance, 'bmi' | 'fat_mass_kg' | 'lean_mass_kg'>;
  circumferences: Omit<Circumferences, 'rcq'>;
  skinfolds: Omit<Skinfolds, 'sum_mm' | 'fat_percentage'>;
}

export interface UpdateAssessmentPayload {
  avaliacao_id: string;
  date?: string;
  last_menstruation_date?: string | null;
  menstrual_cycle_regular?: boolean | null;
  bioimpedance: Omit<Bioimpedance, 'bmi' | 'fat_mass_kg' | 'lean_mass_kg'>;
  circumferences: Omit<Circumferences, 'rcq'>;
  skinfolds: Omit<Skinfolds, 'sum_mm' | 'fat_percentage'>;
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npm run build`
Expected: build finaliza sem erro de TypeScript (os campos são todos opcionais, então nenhum uso existente de `Circumferences`/`Assessment`/`CreateAssessmentPayload`/`UpdateAssessmentPayload` quebra).

- [ ] **Step 5: Commit**

```bash
git add src/app/data.ts
git commit -m "feat(types): coxa medial/distal, busto e ciclo menstrual nos modelos de avaliacao"
```

---

### Task 4: Frontend — Helpers puros (`assessment-utils.ts`)

**Files:**
- Modify: `src/app/assessment-utils.ts`
- Test: `src/tests/assessment-utils.spec.ts`

**Interfaces:**
- Produces: `toOptionalNumber(value: string | number | null | undefined): number | undefined`, `toOptionalBoolean(value: string | null | undefined): boolean | undefined`.
- Consumes (por Task 5, 6, 7): esses dois helpers, importados de `../app/assessment-utils` (nos specs) ou `./assessment-utils` (em `components.ts`).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/tests/assessment-utils.spec.ts`:

```typescript
import {
  shouldConvertCmToMm,
  cmToMm,
  fieldRangeHint,
  FIELD_RANGES,
  toOptionalNumber,
  toOptionalBoolean,
} from '../app/assessment-utils';

// =============================================
// toOptionalNumber
// =============================================
describe('toOptionalNumber', () => {
  it('string numérica não vazia retorna number', () => {
    expect(toOptionalNumber('48.5')).toBe(48.5);
    expect(toOptionalNumber(48.5)).toBe(48.5);
  });

  it('string vazia, null, undefined e "0" retornam undefined', () => {
    expect(toOptionalNumber('')).toBeUndefined();
    expect(toOptionalNumber(null)).toBeUndefined();
    expect(toOptionalNumber(undefined)).toBeUndefined();
    expect(toOptionalNumber('0')).toBeUndefined();
    expect(toOptionalNumber(0)).toBeUndefined();
  });
});

// =============================================
// toOptionalBoolean
// =============================================
describe('toOptionalBoolean', () => {
  it('"true" retorna true, "false" retorna false', () => {
    expect(toOptionalBoolean('true')).toBe(true);
    expect(toOptionalBoolean('false')).toBe(false);
  });

  it('string vazia, null e undefined retornam undefined (não informado)', () => {
    expect(toOptionalBoolean('')).toBeUndefined();
    expect(toOptionalBoolean(null)).toBeUndefined();
    expect(toOptionalBoolean(undefined)).toBeUndefined();
  });
});
```

(Import já existia com os 4 primeiros nomes — só adicionar `toOptionalNumber, toOptionalBoolean` na lista e os dois blocos `describe` novos.)

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm run test:unit -- assessment-utils`
Expected: FAIL — `toOptionalNumber is not exported` / `toOptionalBoolean is not exported`.

- [ ] **Step 3: Implementar os helpers**

Adicionar ao final de `src/app/assessment-utils.ts`:

```typescript
/** Converte valor de campo numérico opcional do form: vazio/0/inválido → undefined (NULL no banco). */
export function toOptionalNumber(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = +value;
  return n ? n : undefined;
}

/** Converte select tri-estado ('', 'true', 'false') em boolean opcional. */
export function toOptionalBoolean(value: string | null | undefined): boolean | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return value === 'true';
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm run test:unit -- assessment-utils`
Expected: PASS (todos os testes do arquivo, incluindo os pré-existentes).

- [ ] **Step 5: Commit**

```bash
git add src/app/assessment-utils.ts src/tests/assessment-utils.spec.ts
git commit -m "test: helpers toOptionalNumber/toOptionalBoolean para campos opcionais do form"
```

---

### Task 5: Frontend — Formulário: Coxa Medial e Distal

**Files:**
- Modify: `src/app/components.ts:1747-1748` (form group `circumferences`)
- Modify: `src/app/components.ts:1449-1451` (template — bloco "Membros Direitos")
- Modify: `src/app/components.ts:1476-1478` (template — bloco "Membros Esquerdos")
- Modify: `src/app/components.ts:1857` (`prefillForEdit`)
- Modify: `src/app/components.ts:1907-1908` (`onSubmit`)

**Interfaces:**
- Consumes: `toOptionalNumber` de `./assessment-utils` (Task 4).
- Produces: controles de form `rightThighMedialCm`, `leftThighMedialCm`, `rightThighDistalCm`, `leftThighDistalCm`; campos de payload `right_thigh_medial_cm`, `left_thigh_medial_cm`, `right_thigh_distal_cm`, `left_thigh_distal_cm`.

- [ ] **Step 1: Import do helper**

No topo de `src/app/components.ts`, localizar o import existente de `assessment-utils` (usado por `shouldConvertCmToMm`/`cmToMm`/`fieldRangeHint`) e adicionar `toOptionalNumber` à lista de nomes importados.

- [ ] **Step 2: Adicionar os 4 controles ao FormGroup `circumferences`**

Em `assessmentForm` (linha ~1732), dentro do `circumferences` group, trocar:

```typescript
      rightThighProximalCm: ['', [Validators.min(0.1)]],
      leftThighProximalCm: ['', [Validators.min(0.1)]],
      rightCalfCm: ['', [Validators.min(0.1)]],
      leftCalfCm: ['', [Validators.min(0.1)]]
```

por:

```typescript
      rightThighProximalCm: ['', [Validators.min(0.1)]],
      leftThighProximalCm: ['', [Validators.min(0.1)]],
      rightThighMedialCm: ['', [Validators.min(0.1)]],   // Coxa medial D (sempre opcional)
      leftThighMedialCm: ['', [Validators.min(0.1)]],    // Coxa medial E (sempre opcional)
      rightThighDistalCm: ['', [Validators.min(0.1)]],   // Coxa distal D (sempre opcional)
      leftThighDistalCm: ['', [Validators.min(0.1)]],    // Coxa distal E (sempre opcional)
      rightCalfCm: ['', [Validators.min(0.1)]],
      leftCalfCm: ['', [Validators.min(0.1)]]
```

Não adicionar esses 4 nomes em `rightSideFields`/`leftSideFields` (linhas 1793-1794) — eles ficam de fora da regra de "lado completo", igual ao Antebraço.

- [ ] **Step 3: Template — bloco "Membros Direitos"**

Depois do campo "Coxa Proximal" (linhas 1448-1451), adicionar:

```html
                    <div class="space-y-1">
                      <label class="text-[9px] uppercase font-bold text-slate-500">Coxa Medial <span class="text-slate-600">(opc.)</span></label>
                      <input type="number" step="0.1" inputMode="decimal" formControlName="rightThighMedialCm" class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-lg text-xs text-slate-200" placeholder="—" />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[9px] uppercase font-bold text-slate-500">Coxa Distal <span class="text-slate-600">(opc.)</span></label>
                      <input type="number" step="0.1" inputMode="decimal" formControlName="rightThighDistalCm" class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-lg text-xs text-slate-200" placeholder="—" />
                    </div>
```

- [ ] **Step 4: Template — bloco "Membros Esquerdos"**

Mesma coisa, depois do "Coxa Proximal" esquerdo (linhas 1476-1478), com `formControlName="leftThighMedialCm"` e `formControlName="leftThighDistalCm"` (mesmo HTML, troca só o `formControlName`).

- [ ] **Step 5: `prefillForEdit`**

Na linha 1857, trocar:

```typescript
        rightThighProximalCm: c?.right_thigh_proximal_cm ?? '', leftThighProximalCm: c?.left_thigh_proximal_cm ?? '',
```

por:

```typescript
        rightThighProximalCm: c?.right_thigh_proximal_cm ?? '', leftThighProximalCm: c?.left_thigh_proximal_cm ?? '',
        rightThighMedialCm: c?.right_thigh_medial_cm ?? '', leftThighMedialCm: c?.left_thigh_medial_cm ?? '',
        rightThighDistalCm: c?.right_thigh_distal_cm ?? '', leftThighDistalCm: c?.left_thigh_distal_cm ?? '',
```

- [ ] **Step 6: `onSubmit`**

Nas linhas 1907-1908, trocar:

```typescript
      right_thigh_proximal_cm: v.circumferences.rightThighProximalCm ? +v.circumferences.rightThighProximalCm : undefined,
      left_thigh_proximal_cm: v.circumferences.leftThighProximalCm ? +v.circumferences.leftThighProximalCm : undefined,
```

por:

```typescript
      right_thigh_proximal_cm: v.circumferences.rightThighProximalCm ? +v.circumferences.rightThighProximalCm : undefined,
      left_thigh_proximal_cm: v.circumferences.leftThighProximalCm ? +v.circumferences.leftThighProximalCm : undefined,
      right_thigh_medial_cm: toOptionalNumber(v.circumferences.rightThighMedialCm),
      left_thigh_medial_cm: toOptionalNumber(v.circumferences.leftThighMedialCm),
      right_thigh_distal_cm: toOptionalNumber(v.circumferences.rightThighDistalCm),
      left_thigh_distal_cm: toOptionalNumber(v.circumferences.leftThighDistalCm),
```

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: sem erros de compilação.

- [ ] **Step 8: Commit**

```bash
git add src/app/components.ts
git commit -m "feat(form): coxa medial e distal (D/E) opcionais no passo de perimetros"
```

---

### Task 6: Frontend — Formulário: Busto/Mamas (mulher)

**Files:**
- Modify: `src/app/components.ts:1732-1751` (form group `circumferences`)
- Modify: `src/app/components.ts:1405-1408` (template — grid geral, ao lado de Tórax)
- Modify: `src/app/components.ts` (`prefillForEdit`, `onSubmit`)

**Interfaces:**
- Consumes: `toOptionalNumber` (Task 4), `student()` signal (já existente, expõe `gender`).
- Produces: controle de form `bustCm`; campo de payload `bust_cm`.

- [ ] **Step 1: Adicionar o controle ao FormGroup**

No `circumferences` group (linha ~1738), depois de `hipCm`, adicionar:

```typescript
      hipCm: ['', [Validators.required, Validators.min(0.1)]],
      bustCm: ['', [Validators.min(0.1)]],   // Busto/mamas — só relevante para mulher, sempre opcional
```

- [ ] **Step 2: Template — campo condicional**

Depois do campo "Quadril (Glúteos)" (linhas 1417-1420), adicionar:

```html
                @if (student()?.gender === 'FEMALE') {
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Busto/Mamas <span class="text-slate-600">(opc.)</span></label>
                    <input type="number" step="0.1" inputMode="decimal" formControlName="bustCm" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" placeholder="Ex: 92.0" />
                  </div>
                }
```

- [ ] **Step 3: `prefillForEdit`**

Na linha do bloco `circumferences` de `prefillForEdit`, adicionar `bustCm: c?.bust_cm ?? '',` junto dos demais campos gerais (ex.: ao lado de `hipCm: c?.hip_cm ?? ''`).

- [ ] **Step 4: `onSubmit`**

No bloco `circumferences` de `onSubmit`, adicionar:

```typescript
      bust_cm: toOptionalNumber(v.circumferences.bustCm),
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: sem erros de compilação.

- [ ] **Step 6: Commit**

```bash
git add src/app/components.ts
git commit -m "feat(form): busto/mamas opcional para alunas mulheres"
```

---

### Task 7: Frontend — Formulário: Saúde Feminina (ciclo menstrual)

**Files:**
- Modify: `src/app/components.ts:1719-1731` (`assessmentForm` raiz)
- Modify: `src/app/components.ts:1374-1381` (template — fim do Passo 1)
- Modify: `src/app/components.ts` (`prefillForEdit`, `onSubmit`)

**Interfaces:**
- Consumes: `toOptionalBoolean` (Task 4), `student()` signal.
- Produces: controles de form `lastMenstruationDate`, `menstrualCycleRegular` (raiz de `assessmentForm`, irmãos de `date`); campos de payload `last_menstruation_date`, `menstrual_cycle_regular` (raiz do payload enviado ao backend).

- [ ] **Step 1: Adicionar os controles à raiz do `assessmentForm`**

Na declaração de `assessmentForm` (linha ~1719), trocar:

```typescript
  assessmentForm: FormGroup = this.fb.group({
    date: [new Date().toISOString().substring(0, 10), [Validators.required]],
    bioimpedance: this.fb.group({
```

por:

```typescript
  assessmentForm: FormGroup = this.fb.group({
    date: [new Date().toISOString().substring(0, 10), [Validators.required]],
    lastMenstruationDate: [''],       // Saúde feminina — opcional, só exibido para mulher
    menstrualCycleRegular: [''],      // '' | 'true' | 'false' — opcional, só exibido para mulher
    bioimpedance: this.fb.group({
```

- [ ] **Step 2: Template — bloco condicional no fim do Passo 1**

Depois do bloco do checkbox "Modo Atleta Omron" (linhas 1374-1380), mas ainda dentro do `@if (activeStep() === 1) { ... }` e FORA da `<div formGroupName="bioimpedance">` (para que os `formControlName` resolvam contra a raiz de `assessmentForm`), adicionar:

```html
            </div>

            @if (student()?.gender === 'FEMALE') {
              <div class="bg-[#141417] p-6 rounded-2xl border border-white/5 space-y-4 animate-fade-in mt-6">
                <div class="border-b border-white/5 pb-3">
                  <h3 class="text-sm font-bold text-white flex items-center gap-2">
                    <mat-icon class="text-pink-400">favorite</mat-icon>
                    Saúde Feminina
                  </h3>
                  <p class="text-[11px] text-slate-400 mt-1">Campos opcionais, específicos desta avaliação.</p>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Data da Última Menstruação <span class="text-slate-600">(opc.)</span></label>
                    <input type="date" formControlName="lastMenstruationDate" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ciclo Regular <span class="text-slate-600">(opc.)</span></label>
                    <select formControlName="menstrualCycleRegular" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white">
                      <option value="">Não informado</option>
                      <option value="true">Sim, regular</option>
                      <option value="false">Não, irregular</option>
                    </select>
                  </div>
                </div>
              </div>
            }
          }
```

Note: a última linha (`}`) fecha o `@if (activeStep() === 1)`; a `</div>` isolada logo antes do bloco condicional fecha a `<div formGroupName="bioimpedance">` que antes só fechava depois do template inteiro do Passo 1 — mover essa `</div>` para fechar imediatamente após o checkbox "Modo Atleta Omron" é a mudança estrutural desta task.

- [ ] **Step 3: Import do helper**

No import de `assessment-utils` (mesmo import da Task 5), adicionar `toOptionalBoolean` à lista.

- [ ] **Step 4: `prefillForEdit`**

No `patchValue` de `prefillForEdit` (linha ~1839), adicionar as duas chaves na raiz do objeto (irmãs de `date`):

```typescript
    this.assessmentForm.patchValue({
      date: aval.date,
      lastMenstruationDate: aval.last_menstruation_date ?? '',
      menstrualCycleRegular: aval.menstrual_cycle_regular === true ? 'true' : aval.menstrual_cycle_regular === false ? 'false' : '',
      bioimpedance: {
```

- [ ] **Step 5: `onSubmit`**

No `onSubmit`, junto de onde `date`/`aluno_id` são montados para o payload de create/update (não dentro de `circumferences` nem `bioimpedance`), adicionar:

```typescript
    const lastMenstruationDate = v.lastMenstruationDate || null;
    const menstrualCycleRegular = toOptionalBoolean(v.menstrualCycleRegular) ?? null;
```

E incluir `last_menstruation_date: lastMenstruationDate, menstrual_cycle_regular: menstrualCycleRegular,` no objeto de payload enviado para `dataService.addAssessment(...)`/`updateAssessment(...)` (raiz do payload, junto de `date`).

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: sem erros de compilação.

- [ ] **Step 7: Commit**

```bash
git add src/app/components.ts
git commit -m "feat(form): saude feminina (ultima menstruacao + ciclo regular) por avaliacao"
```

---

### Task 8: Relatório PDF

**Files:**
- Modify: `src/app/pdf-report.ts:590-608` (tabela de Circunferências)
- Modify: `src/app/pdf-report.ts` (nova seção "Saúde Feminina", inserida perto da tabela de Circunferências)

**Interfaces:**
- Consumes: `pdfFormatDate`, `pdfBoolLabel` (já existentes em `pdf-report.ts`), `Assessment.last_menstruation_date`, `Assessment.menstrual_cycle_regular`, `Circumferences.right_thigh_medial_cm` etc., `Circumferences.bust_cm`, `Student.gender`.

- [ ] **Step 1: Novas linhas na tabela de Circunferências**

Em `drawTable('Circunferências (cm)', [...])` (linhas 590-608), depois de `cRow('Coxa E. (proximal)', 'left_thigh_proximal_cm')`, adicionar:

```typescript
    cRow('Coxa D. (medial)', 'right_thigh_medial_cm'),
    cRow('Coxa E. (medial)', 'left_thigh_medial_cm'),
    cRow('Coxa D. (distal)', 'right_thigh_distal_cm'),
    cRow('Coxa E. (distal)', 'left_thigh_distal_cm'),
```

E, antes da linha de `RCQ` (para não deixar linha vazia em homens), adicionar condicionalmente:

```typescript
    ...(cir?.bust_cm || pcir?.bust_cm ? [cRow('Busto', 'bust_cm')] : []),
```

- [ ] **Step 2: Nova seção "Saúde Feminina"**

Imediatamente depois do `drawTable('Circunferências (cm)', [...], true);` (fim do bloco da Task, linha ~608), adicionar:

```typescript
  // ---- Saúde Feminina (só quando há dado preenchido) ----
  if (student.gender === 'FEMALE' && (a.last_menstruation_date || a.menstrual_cycle_regular !== null && a.menstrual_cycle_regular !== undefined)) {
    drawTable('Saúde Feminina', [
      { label: 'Última Menstruação', cur: pdfFormatDate(a.last_menstruation_date), prevVal: pdfFormatDate(prev?.last_menstruation_date) },
      { label: 'Ciclo Regular', cur: pdfBoolLabel(a.menstrual_cycle_regular), prevVal: pdfBoolLabel(prev?.menstrual_cycle_regular) },
    ], true);
  }
```

- [ ] **Step 3: Rodar a suíte de testes existente (regressão)**

Run: `npm run test:unit -- pdf-report`
Expected: PASS — nenhuma das funções puras testadas (`pdfFormatDate`, `pdfBoolLabel` etc.) foi alterada, só o corpo de `generatePdfReport` que as consome; o spec existente deve continuar verde sem alteração.

- [ ] **Step 4: Commit**

```bash
git add src/app/pdf-report.ts
git commit -m "feat(pdf): coxa medial/distal, busto e saude feminina no relatorio"
```

---

### Task 9: Validação final end-to-end + push

**Files:** nenhum arquivo novo — só execução e verificação.

- [ ] **Step 1: Suíte completa de testes unitários**

Run: `npm run test:unit`
Expected: todos os arquivos em `src/tests/` passam, incluindo os novos testes da Task 4.

- [ ] **Step 2: Build de produção**

Run: `npm run build`
Expected: build completo sem erros/warnings de tipo.

- [ ] **Step 3: Smoke test manual no navegador**

Run: `npm run dev` (ou `npm start`), abrir o app localmente.
1. Abrir uma aluna do sexo Feminino (ou criar uma de teste).
2. Iniciar uma nova avaliação: no Passo 1, preencher o bloco "Saúde Feminina" (data + ciclo regular); no Passo 2, preencher Coxa Medial/Distal em pelo menos um lado e o campo Busto/Mamas.
3. Salvar a avaliação e confirmar que não há erro e que os valores aparecem corretamente ao reabrir a avaliação para edição.
4. Gerar o PDF da avaliação e confirmar visualmente as novas linhas (Coxa medial/distal, Busto, Saúde Feminina).
5. Abrir um aluno do sexo Masculino e confirmar que os campos "Busto/Mamas" e "Saúde Feminina" **não aparecem** no formulário, e que a linha "Busto" não aparece no PDF dele.

Expected: os 5 pontos acima se comportam como descrito, sem erros no console do navegador.

- [ ] **Step 4: Verificação final via MCP**

Chamar `mcp__supabase__get_advisors` com `type: "security"` e confirmar que não há novos lints introduzidos pelas colunas/migration desta feature.
Chamar `mcp__supabase__execute_sql` com:

```sql
SELECT id, last_menstruation_date, menstrual_cycle_regular FROM avaliacoes ORDER BY created_at DESC LIMIT 1;
```

para confirmar que a avaliação real criada no Step 3 persistiu os campos corretamente, depois (se foi uma aluna de teste criada só para esta verificação) apagar os dados de teste como no Task 1 Step 6.

- [ ] **Step 5: Push**

```bash
git push
```

Expected: push concluído sem conflito; `git log --oneline -10` mostra os commits das Tasks 1-9 no topo do branch `main`.
