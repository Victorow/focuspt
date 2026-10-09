# Seta de comparação ao digitar e água corporal calculada

Data: 2026-10-09

## Contexto

Pedido do usuário (WhatsApp, repassado):
- Ao preencher uma lacuna da avaliação, comparar com a última avaliação: seta para cima se maior, seta para baixo se menor, sinal de igual se igual.
- Adicionar o cálculo correto da porcentagem de água corporal.

## Decisões (sessão autônoma — assumidas e documentadas)

1. **Seta em todo campo numérico** que tem "Anterior": balança, perímetros de tronco, membros (tabela D/E no desktop) e dobras. Aparece assim que o campo tem valor válido e existe avaliação anterior; some quando o campo está vazio ou não há anterior.
2. Símbolos: `↑` maior, `↓` menor, `=` igual (comparação feita no mesmo arredondamento em que o campo é exibido: 0 casas para kcal/anos/nível, 1 casa para o resto). Ao lado vem o Δ já existente (`+1,4`). A cor continua sendo a de favorável/desfavorável (`deltaClass`), não a de subiu/desceu — a seta diz a direção, a cor diz se é bom.
3. **Água corporal passa a ser calculada**, não digitada. A Omron HBF-514C não mostra água; a fórmula padrão de bioimpedância é a hidratação da massa magra: `água% = (100 − gordura%) × 0,732`, arredondada a 1 casa. Fonte da verdade: Edge Function `avaliacoes` (grava `water_percentage` sempre calculado, ignorando valor do cliente). O navegador espelha em `assessment-calc.ts` para a prévia.
4. O campo "Água corporal" sai do formulário (desktop, celular e modal de validação). No desktop, a etapa 1 mostra um bloco somente leitura "Água corporal (calculada)" com anterior e seta; na Revisão aparece uma linha com o valor e o Δ.
5. Coluna `water_percentage` e o CHECK 0–100 ficam como estão (o cálculo sempre cai nessa faixa). Avaliações antigas com água digitada permanecem; ao editar, o valor é recalculado.
6. O aviso de variação improvável (> 15 pontos) continua valendo.

## Componentes

- `supabase/functions/_shared/calculations.ts`: `calcWaterPercentage(fatPct)`.
- `supabase/functions/avaliacoes/index.ts`: `water_percentage: calcWaterPercentage(fatPct)`.
- `src/app/assessment-calc.ts`: espelho de `calcWaterPercentage` (teste de espelho cobre).
- `src/app/assessment-utils.ts`: `trend(cur, prev, digits)` → `'up' | 'down' | 'same' | null` e `trendSymbol(t)`.
- `src/app/pages/new-assessment.component.ts`: seta nos templates; remoção do input de água; bloco calculado; Revisão.
- E2E: `waterPercentage` sai dos campos preenchidos.
- `docs/SISTEMA.md`: etapa 1 com 6 campos, água calculada, seta.

## Testes

- Vitest: `calcWaterPercentage` (valores conhecidos, arredondamento), espelho front/back, `trend`/`trendSymbol`.
- Deno: `calcWaterPercentage` em `_tests/calculations.test.ts`.
