# FocusPT — Documentação do Sistema

> Documento de referência para desenvolvedores novos no código e para o proprietário.
> Tudo aqui foi verificado no código (`src/app`, `supabase/functions`, `supabase/migrations`) e no
> banco do projeto Supabase `qhdkacasbbfilqqywosj` (inspeção somente leitura) em 07/10/2026.

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Arquitetura](#2-arquitetura)
3. [Mapa de telas](#3-mapa-de-telas)
4. [Fluxos principais](#4-fluxos-principais)
5. [Modelo de dados](#5-modelo-de-dados)
6. [Edge Functions](#6-edge-functions)
7. [Regras de cálculo](#7-regras-de-cálculo)
8. [Relatório PDF](#8-relatório-pdf)
9. [Testes, build, deploy e armadilhas](#9-testes-build-deploy-e-armadilhas)
10. [Segurança & LGPD](#10-segurança--lgpd)
11. [Pendências e inconsistências conhecidas](#11-pendências-e-inconsistências-conhecidas)

---

## 1. Visão geral

O **FocusPT** é um painel web para um **personal trainer** gerenciar seus alunos e as avaliações físicas deles.
Cada personal (usuário do Supabase Auth) só enxerga os próprios alunos (RLS).

| Funcionalidade | Resumo |
|---|---|
| Alunos | Cadastro com dados pessoais, objetivo, telefone (WhatsApp) e **anamnese** (PAR-Q simplificado). Busca, exclusão para a **lixeira** e restauração. |
| Avaliação física | Formulário em 3 passos: **bioimpedância Omron HBF-514C** (peso, % gordura, % músculo, metabolismo basal, idade corporal, gordura visceral, % água, modo atleta), **circunferências** (tronco + membros por lado) e **dobras cutâneas** (Jackson & Pollock 7 dobras + bíceps/panturrilha opcionais). Para alunas há campos de saúde feminina e busto. |
| Cálculos | IMC, massa gorda/magra, classificação Omron do % de gordura, risco visceral, RCQ, somatório das 7 dobras e % de gordura por JP7 + Siri (idade **na data** da avaliação). Feitos no servidor (Edge Function). |
| Relatório | Tela de relatório da avaliação (cards, radar de perímetros, adipometria, simetria, observações) + **exportação PDF** (jsPDF) e atalho de **WhatsApp**. |
| Fotos de evolução | Upload por ângulo (Frente, Lado Direito, Lado Esquerdo, Costas) em bucket privado; galeria; comparativo "Início × Recente" no PDF. |
| LGPD | Termo de consentimento v1.0 assinado pelo aluno num canvas (mouse/toque); a imagem fica em bucket privado e o status do aluno passa a `ACCEPTED`. |
| Agenda | Tela `/agenda` com visão semanal (segunda a domingo): criar, editar e excluir atendimentos (aluno, data, horário, foco). O dashboard mostra a "Agenda do Dia". |
| Dashboard | KPIs (alunos ativos, avaliações feitas, risco visceral alto), card **"Pedem atenção"** (reavaliação vencida, termo LGPD pendente, gordura visceral alta), agenda do dia e legenda dos níveis viscerais Omron. |

---

## 2. Arquitetura

```
Navegador (Angular 21 SPA, Tailwind 4)
   │  supabase-js: Auth (e-mail/senha) + 1 leitura direta (alunos.name na tela LGPD)
   │  fetch → https://qhdkacasbbfilqqywosj.supabase.co/functions/v1/<função>
   ▼
Supabase Edge Functions (Deno)  ── client com o JWT do usuário → Postgres (RLS)
   │                             └─ client service-role → Storage (upload/remoção/URLs assinadas)
   ▼
Postgres (tabelas + RLS + view aluno_summary + RPCs)   Storage: fotos-alunos, lgpd-assinaturas (privados)
```

### 2.1 Frontend

| Item | Detalhe |
|---|---|
| Framework | Angular 21, componentes **standalone**, signals, Reactive Forms, `@angular/material/icon` (Material Icons via Google Fonts). |
| Estilo | Tailwind CSS 4 (`@tailwindcss/postcss`), tema escuro; fontes **Inter** (sans) e **JetBrains Mono** (mono) em `src/styles.css`. |
| Arquivos | `components.ts` (~2950 linhas, 8 telas), `lgpd-sign.component.ts`, `app.ts`/`app.html` (shell + sidebar), `data.ts` (interfaces + `DataService`), `supabase.service.ts`, `toast.*`, `dialog.*`, `assessment-utils.ts`, `lgpd-utils.ts`, `pdf-report.ts`. |
| Configuração | `src/environments/environment.ts`: `supabaseUrl`, `supabaseAnonKey` (chave pública anon), `functionsUrl`. Só existe esse arquivo (sem variante de produção). |
| SSR | **Não está ativo.** Existem `main.server.ts`, `app.config.server.ts` e `app.routes.server.ts` (todas as rotas com `RenderMode.Client`), mas o `angular.json` não configura `server`/`ssr` — o build gera só `dist/app/browser` (SPA). |
| `src/server.ts` | **Legado/mock** do template AI Studio: Express com API fake (`/api/students`, etc.) gravando em `database.json`. Não é usado pelo app nem pelo deploy. |
| Dependências não usadas | `@google/genai`, `motion`, `html2canvas`, `express` (resíduos do template). O `README.md` e o `.env.example` ainda são do template AI Studio (GEMINI_API_KEY) e não se aplicam. |

**Camada de dados (`DataService` → `SupabaseService`)**: `callFunction(name, body, method)` e `callFunctionGet(name, params)`
obtêm a sessão (`auth.getSession()`), enviam `Authorization: Bearer <access_token>` + `apikey` e lançam `Error(json.error)` se `!res.ok`.
Sem sessão → `Error('Não autenticado')`.

**Guarda de autenticação** (`app.ts`): não há `CanActivate`. O `App` verifica a cada `NavigationEnd` se existe token no
`localStorage` (`sb-*-auth-token`, função `getTrainerToken()`); sem token → `/login`; com token em `/login` → `/`.
Além disso, assina `onAuthStateChange` e redireciona para `/login` em `SIGNED_OUT` ou sessão nula.

### 2.2 Backend (Supabase)

| Recurso | Detalhe |
|---|---|
| Auth | E-mail + senha (`signInWithPassword`). Não há tela de cadastro; o usuário é criado fora do app (existe uma função `setup-admin-user` implantada, **não versionada** no repo). Trigger `on_auth_user_created` → `handle_new_user()` cria a linha em `personal_trainers` (nome = `raw_user_meta_data.name` ou parte do e-mail). |
| RLS | Todas as tabelas de domínio filtram por `personal_trainer_id = auth.uid()` (direta ou via `alunos`). Ver §5.3. |
| Storage | `fotos-alunos` (privado, 5 MB, `image/jpeg|png|webp`) e `lgpd-assinaturas` (privado, 2 MB, `image/png`). Caminho: `<uid>/<aluno_id>/...`. |
| Edge Functions | `dashboard`, `alunos`, `aluno-detail`, `avaliacoes`, `avaliacao-detail`, `fotos`, `lgpd-sign`, `agenda` (+ `setup-admin-user`, só no projeto). Todas com `verify_jwt = true`. |
| Plano | **Free** — sem backups/PITR. Por isso alunos e avaliações usam *soft delete*. |

### 2.3 Deploy

| Parte | Como |
|---|---|
| Frontend | **Vercel**, projeto `alexandre-site`, a partir do GitHub (branch `main`). `vercel.json`: `npm run build`, saída `dist/app/browser`, rewrite de tudo para `/index.html`. O remote local aponta para `github.com/Victorow/AlexandreSite` (informado também como `Victorow/focuspt`). Há um `netlify.toml` equivalente, não usado. |
| Edge Functions | **Deploy manual** (MCP `deploy_edge_function` ou CLI). **Não** são publicadas no push — o código do git pode divergir do implantado. Ver §9.4. |
| Banco | Migrations em `supabase/migrations`, espelhando exatamente o histórico de produção (`supabase_migrations.schema_migrations`, mesmas versões e SQL) + `20261008014409_sync_drift.sql` (buckets e policies de Storage criados pelo dashboard). Recriam o banco do zero — ver §9.5. |

---

## 3. Mapa de telas

### 3.0 Shell, navegação e componentes globais

**Rotas** (`src/app/app.routes.ts`):

| Rota | Componente | Arquivo |
|---|---|---|
| `/login` | `LoginComponent` | components.ts |
| `/` | `DashboardComponent` | components.ts |
| `/agenda` | `AgendaComponent` | agenda.component.ts |
| `/alunos` | `StudentsListComponent` | components.ts |
| `/alunos/novo` | `NewStudentComponent` (modo criar) | components.ts |
| `/alunos/:id/editar` | `NewStudentComponent` (modo editar) | components.ts |
| `/alunos/:id` | `StudentProfileComponent` | components.ts |
| `/alunos/:id/lgpd` | `LgpdSignComponent` | lgpd-sign.component.ts |
| `/alunos/:id/avaliacoes/nova` | `NewAssessmentComponent` (criar) | components.ts |
| `/alunos/:id/avaliacoes/:id_aval/editar` | `NewAssessmentComponent` (editar) | components.ts |
| `/alunos/:id/avaliacoes/:id_aval` | `AssessmentReportComponent` | components.ts |
| `/alunos/:id/galeria` | `StudentGalleryComponent` | components.ts |
| `**` | redireciona para `/` | — |

**Shell (`app.html`)** — fora do login:
- **Sidebar** (desktop, `w-64`, fundo `#141417`): logo (quadrado azul `bg-blue-600` com ícone `fitness_center`) + texto **"FocusPT"**; links **"Dashboard"** (ícone `dashboard`), **"Alunos & Controle"** (ícone `assignment_ind`) e **"Agenda"** (ícone `calendar_month`), item ativo com `bg-blue-600/10 text-blue-400`; rodapé com avatar de iniciais (gradiente azul→índigo), nome do personal (de `user_metadata.name` ou e-mail) e legenda "Personal Trainer"; botão **"Sair do Sistema"**.
- **Mobile**: barra superior com logo e ícones Dashboard / Alunos / Agenda / Sair.
- Conteúdo: `max-w-7xl`, padding responsivo, animação `animate-fade-in`.
- **Sair**: diálogo de confirmação "Sair do sistema" / "Deseja realmente sair do sistema de Personal Trainer?" — botões **Ficar** / **Sair**.

**Toast** (`toast.component.ts`): pilha no canto superior direito, some em 4 s; tipos `success` (verde), `info` (azul), `warning` (âmbar), `error` (vermelho); botão fechar.

**Dialog** (`dialog.service.ts`): modal único com `confirm()` (botões cancelar/confirmar, tom padrão `danger`) e `alert()` (botão "Entendi", tom padrão `info`). Tons: info/danger/error/success.

**Estilo visual atual**: fundo `#0A0A0B`, cards `#141417` com borda `white/5` e `rounded-2xl`, inputs `#1C1C21`, hover `#25252B`, primária `blue-600` (#2563EB), sucesso `emerald`, alerta `amber`, erro `red`, feminino `pink`. Rótulos em caixa alta, 10 px, `tracking-wider`. Texto base `#E2E8F0`. `index.html`: `lang="en"`, título "Alexandre Daniel dos Santos — FocusPT".

### 3.1 Login — `/login`

| Item | Detalhe |
|---|---|
| Propósito | Autenticar o personal (Supabase Auth). |
| Seções | Logo + "FocusPT" + "Dashboard Antropométrico e Gestão"; caixa info "Acesso FocusPT — Utilize seu e-mail e senha cadastrados para acessar o sistema." |
| Campos | **E-mail do Personal** (obrigatório, e-mail válido; placeholder `exemplo@focuspt.com`); **Senha Secreta** (obrigatória, mín. 6; botão mostrar/ocultar). |
| Ações | **Entrar no Painel** (desabilitado se inválido/carregando; carregando: "Autenticando..."). |
| Estados | Erros de validação ("Insira um e-mail válido.", "A senha deve ter pelo menos 6 caracteres."); erro de login "E-mail ou senha inválidos.". Sucesso → `/`. |
| Dados | `supabase.auth.signInWithPassword`. |

### 3.2 Dashboard — `/`

| Item | Detalhe |
|---|---|
| Propósito | Painel inicial. |
| Cabeçalho | "Bem-vindo, {nome}!" + "Painel Geral de Atendimento • {data por extenso pt-BR}"; botão **Novo Aluno** → `/alunos/novo`. |
| KPIs (3 cards) | **Alunos Ativos** (`activeStudents`; subtítulo "{n} avaliado(s) nos últimos 90 dias", calculado da lista de alunos); **Avaliações Feitas** (`totalAssessments`, "Dobras & Bioimpedância"); **Risco Visceral Alto** (`visceralAlerts`, "Omron visceral ≥ 10", número em âmbar). Não há KPI de receita. |
| Pedem atenção | Card largo com 3 grupos (até 5 linhas cada + **Ver todos (n)**), badge "{n} aluno(s)" distintos. **Reavaliação vencida**: última avaliação há **mais de 90 dias** ("Última em 22/06 · 107 dias"; ano exibido se diferente do atual) ou "Sem avaliação" (no topo), mais atrasados primeiro → link para `/alunos/:id/avaliacoes/nova`. **Termo LGPD pendente**: "Termo não assinado" → `/alunos/:id/lgpd`. **Gordura visceral alta**: último nível ≥ 10 ("Nível 12 · Alto", ≥ 15 "Muito Alto"), maior primeiro → `/alunos/:id`. Vazio: "Nada pendente hoje.". Lógica pura em `attention-utils.ts` (dias por partes Y/M/D com `Date.UTC`, "hoje" = data **local** do navegador; testes em `src/tests/attention-utils.spec.ts`). |
| Agenda do Dia | Card "Agenda do Dia • Atendimentos" com badge "{n} Treinos Agendados" e link **Ver agenda** → `/agenda`; lista: horário (mono, HH:MM), nome do aluno, foco; cada linha abre `/agenda`. Vazio: "Nenhum atendimento agendado para hoje.". |
| Card Omron | "Monitoramento Balança Omron" — texto sobre a HBF-514C e legenda: 1-9 Normal (verde), 10-14 Alto (Atenção) (âmbar), 15-30 Muito Alto (Risco Elevado) (vermelho); botão **Gerenciar Lista de Alunos** → `/alunos`. |
| Dados | `GET dashboard` → RPC `get_dashboard_stats()`; `GET alunos` (view `aluno_summary`: `last_assessment_date`, `lgpd_consent_status`, `last_visceral_level`) para "Pedem atenção" e o subtítulo de Alunos Ativos. |
| Estados | Carregando: spinner "Carregando estatísticas..."; erro: "Falha ao carregar estatísticas. Verifique sua conexão e recarregue."; "Pedem atenção": "Carregando alunos..." / "Falha ao carregar a lista de alunos.". |

### 3.3 Lista de alunos — `/alunos`

| Item | Detalhe |
|---|---|
| Propósito | Listar, buscar, excluir (lixeira) e restaurar alunos. |
| Cabeçalho | "Gestão de Alunos" / "Visualize, busque e gerencie todos os alunos ativos."; botões **Lixeira (n)** (alterna painel) e **Novo Aluno**. |
| Painel Lixeira | "Alunos na Lixeira": linhas com nome • objetivo e botão **Restaurar** (verde). Vazio: "Nenhum aluno na lixeira." |
| Busca | Campo "Buscar aluno por nome, objetivo, telefone..." — filtro **no cliente** (nome/objetivo case-insensitive, telefone substring). |
| Card do aluno (grid 1/2/3 col.) | Nome, objetivo, badge **Masc**/**Fem** (azul/rosa); **Último Peso** (`last_weight` kg ou `--`), **Gordura Est.** (`last_fat_percentage` % ou `--`); "Altura: {height_cm}cm"; "LGPD: Permitido/Pendente" (verde/âmbar). Rodapé: ícone excluir, botão **Ver Perfil**. |
| Excluir | Confirmação "Excluir aluno" / "O aluno {nome} vai para a Lixeira (com fotos e avaliações) e pode ser restaurado depois. Deseja continuar?" → **Excluir**. Erro: alerta "Erro ao excluir aluno. Tente novamente." |
| Dados | `GET alunos` (view `aluno_summary`) e `GET alunos?trash=1`; `DELETE`/`PATCH aluno-detail/:id`. |
| Estados | Carregando "Carregando lista de alunos..."; vazio: "Nenhum aluno encontrado" + "Tente ajustar a busca ou cadastre um novo aluno para começar a gestão." + **Cadastrar Agora**. Erro de carga: só `console.error` (aparece como vazio). |

### 3.4 Cadastrar / editar aluno — `/alunos/novo`, `/alunos/:id/editar`

Título: "Cadastrar Aluno & Anamnese" / "Editar Cadastro do Aluno".

**Seção 1 — Dados Pessoais & Objetivo**

| Campo | Tipo | Regra |
|---|---|---|
| Nome Completo | texto | obrigatório, mín. 2 |
| Data de Nascimento | data | obrigatório |
| Gênero Biológico | select Masculino/Feminino | obrigatório (padrão Masculino) |
| Altura (cm) | número | obrigatório, 50–250 |
| Objetivo do Aluno | texto | opcional |
| Nº de Telefone (WhatsApp) | texto | opcional ("DDD + Número (Apenas números)") |

**Seção 2 — Anamnese Rápida (Termo PAR-Q & Histórico)** (todos opcionais)

| Campo | Tipo |
|---|---|
| Algum problema cardíaco diagnosticado? | checkbox |
| Sente dores articulares ou ósseas? | checkbox |
| Sente dor no peito durante a prática de exercícios? | checkbox |
| Cirurgias Recentes (Detalhar se houver) | texto |
| Medicamentos contínuos ativos | texto |
| Observações adicionais do Aluno | textarea |

**Seção 3 — Consentimento de Proteção de Dados (LGPD)**: texto informativo + badge fixo **Pendente** ("O aceite é registrado somente pela assinatura digital do aluno, feita no perfil dele.").

| Item | Detalhe |
|---|---|
| Ações | **Cancelar** (volta para lista ou perfil); **Salvar Cadastro** / **Salvar Alterações** (desabilitado se inválido; "Adicionando..."/"Salvando..."). |
| Dados | Criar: `POST alunos`. Editar: `GET aluno-detail/:id` (prefill) + `PUT aluno-detail/:id`. |
| Estados | Sucesso: toast "Aluno cadastrado com sucesso!"/"Cadastro atualizado com sucesso!" e vai para o perfil. Erros: "Erro ao criar aluno. Tente novamente mais tarde.", "Erro ao atualizar cadastro.", "Erro ao carregar dados do aluno." |

### 3.5 Perfil do aluno — `/alunos/:id`

| Seção | Conteúdo |
|---|---|
| Hero | Nome, badge Masculino/Feminino, "Objetivo: {goal ou 'A definir'} • Altura: {x} cm • Idade: {n} anos" (idade hoje). Botões: **Galeria Evolução**, **Editar Cadastro**, **Assinar LGPD** (só se pendente, âmbar), **Nova Avaliação Física** (primário). |
| Linha do Tempo de Avaliações | Contador "{n} Avaliações". Tabela: **Data** (dd/MM/yyyy) · **Peso** · **Músculo%** · **Gordura %** (`body_fat_percentage`) · **Idade Corp.** · **Ação** (ícone excluir + botão **Relatório**). Ordem: mais recente primeiro. Vazio: "Nenhuma avaliação cadastrada." + **Cadastrar Primeira agora**. |
| Lixeira de avaliações | Só se houver: botão expansível "Lixeira (n)"; linhas "dd/MM/yyyy • {peso} kg • {gordura}% gordura" + **Restaurar**. |
| Resultados da Anamnese Inicial | 3 mini-cards: Problema Cardíaco ("Sim (Exige Liberação)" vermelho / "Não Relatado"), Dor Articular ("Sim (Cuidados com Carga)" âmbar), Dor no peito sob esforço ("Sim (Risco Clínico)" vermelho); "Medicamentos Contínuos: … / Nenhum"; "Observações Clínicas / Restrições adicionais: … / Nenhuma restrição identificada." (cirurgia recente **não** é exibida). |
| Apoio de Proteção LGPD | Ponto verde/âmbar, "Consentimento Assinado"/"Aceite Pendente", link **Assinar agora** se pendente; "Telefone: …" se houver. |
| Mídia Recente | As 2 fotos **mais recentes** (`selectRecentPhotos` em `media-utils.ts`: `date` desc, depois `created_at` desc — independe da ordem da API) com etiqueta de ângulo; link **Ver Tudo**. Vazio: "Nenhuma evolução anexada." |
| Dados | `GET aluno-detail/:id`; `DELETE`/`PATCH avaliacao-detail/:id`. |
| Estados | "Carregando informações do aluno..."; não encontrado: "Aluno não encontrado ou inexistente."; confirmação de exclusão "Excluir avaliação" / "Esta avaliação vai para a Lixeira e pode ser restaurada depois. Deseja continuar?". |

### 3.6 Nova / editar avaliação — `/alunos/:id/avaliacoes/nova`, `.../:id_aval/editar`

Título "Nova Avaliação Física"/"Editar Avaliação Física" + "Registrar medições para o aluno {nome}".
Stepper de 3 abas clicáveis (livre navegação): **Passo 1: Balança Omron**, **Passo 2: Circunferências**, **Passo 3: Dobras Cutâneas**.
Barra geral: **Data da Medição** (obrigatória, padrão hoje) + prévia "Massa Corporal Prevista: {peso} kg" / "Altura: {x} cm".

**Passo 1 — Dados Omron HBF-514C**

| Campo | Regra (front) |
|---|---|
| Peso Total (kg) | obrigatório, ≥ 1 |
| IMC Balança (Opcional) | opcional — **ignorado** no envio (o servidor recalcula) |
| Gordura Corporal (%) | obrigatório, 0,1–80 |
| Músculo Esquelético (%) | obrigatório, 0,1–80 |
| Metabolismo Basal (kcal) | obrigatório, ≥ 1 |
| Idade Biológica Corporal | obrigatório, 10–100 |
| Nível de Gordura Visceral (1 a 30) | obrigatório, 1–30 |
| % Água Corporal (opcional) | 0–100 |
| Modo Atleta Omron | checkbox |

Só para **FEMALE** — card **Saúde Feminina** ("Campos opcionais, específicos desta avaliação."): **Data da Última Menstruação (opc.)**, **Ciclo Regular (opc.)** (Não informado / Sim, regular / Não, irregular).

**Passo 2 — Circunferências Corporais (cm)**

| Grupo | Campos |
|---|---|
| Tronco (obrigatórios, > 0) | Pescoço, Ombros, Tórax, Cintura, Abdomen, Quadril (Glúteos) |
| Só FEMALE (opcional) | Busto/Mamas |
| Membros Direitos / Membros Esquerdos | Braço Relaxado, Braço Contraído, Antebraço (opc.), Coxa Proximal, Coxa Medial (opc.), Coxa Distal (opc.), Panturrilha |

**Regra do lado predominante** ("Mapeamento de Simetria"): pelo menos um lado completo. Se um lado tem qualquer valor entre
Braço Relaxado/Contraído, Coxa Proximal e Panturrilha, esses 4 ficam obrigatórios nesse lado; se nenhum lado foi preenchido, exige o direito.
Antebraço, coxa medial e coxa distal são sempre opcionais.

**Passo 3 — Dobras Cutâneas (mm)**: Tríceps, Bíceps (opc.), Subescapular, Peitoral, Axilar Média, Supra-ilíaca, Abdominal, Coxa Média, Panturrilha Média (opc.).
Obrigatórias (> 0): as 7 do JP7. Ao sair de um campo, valores entre 0 e 6 são convertidos de cm para mm (×10) com toast "Medida {x} cm convertida para {y} mm.".

| Item | Detalhe |
|---|---|
| Ações | **Anterior**, **Cancelar** (volta ao perfil), **Próximo Passo**, no passo 3 **Concluir Avaliação**/**Salvar Alterações** (verde; "Calculando..."). |
| Modal de validação | Se o form é inválido ao enviar: "Revise os campos obrigatórios" / "{n} campo(s) faltando ou fora da faixa permitida. Corrija abaixo para concluir." — lista editável (rótulo, passo, dica de faixa, input, ícone ✓); botões **Voltar ao formulário** e **Preencher e Concluir Avaliação**. |
| Dados | `GET aluno-detail/:id` (aluno + avaliações para prefill); `POST avaliacoes` ou `PUT avaliacoes`. |
| Estados | Sucesso: toast "Avaliação salva com sucesso!"/"Avaliação atualizada com sucesso!" → perfil. Erro: toast com a mensagem do servidor ou "Erro ao guardar a avaliação."; edição de id inexistente: toast "Avaliação não encontrada para edição.". Enquanto o aluno carrega, nada é renderizado. |

### 3.7 Relatório da avaliação — `/alunos/:id/avaliacoes/:id_aval`

| Seção | Conteúdo |
|---|---|
| Cabeçalho | "Relatório de Avaliação Física", "Aluno: {nome} • Período: {data}". Botões **Enviar WhatsApp**, **Editar**, **Exportar PDF** ("Gerando..."). |
| KPIs (4) | **Peso Corporal** (kg, delta vs anterior verde se caiu / vermelho se subiu, ou "Estável"); **Gordura Corporal** (% bioimp. + "Classificação (bioimp.): Baixo/Normal/Alto/Muito Alto" colorido); **Massa Músculo** (% + "Massa Magra: x kg"); **Gordura Visceral** (nível + badge Normal/Alto/Muito Alto, "Nível Omron ideal: menor que 10"). |
| Antropometria (Perímetros) | Radar SVG de 6 eixos (TÓRAX, CINTURA, ABDOMEN, QUADRIL, BRAÇO R., COXA R.), escala máx. 130 cm; polígono atual azul e anterior cinza (legenda Anterior/Atual). Valores ausentes usam padrões fixos (90/80/85/100/38/55). |
| Adipometria (Dobra Cutânea mm) | Barras para Abdominal, Supra-ilíaca, Peitoral (valor anterior em cinza ao lado); mini-cards Tríceps, Bíceps (— se vazio), Coxa; "Metabolismo Basal (Gerado no Exame)" e "Idade Biológica Corpórea". |
| História Comparativa de Membros de Controle | Tabela **Membro / Lado Direito (Cm) / Lado Esquerdo (Cm) / Diferença Simetria** para Braço Relaxado, Braço Contraído, Coxa Proximal, Panturrilha. Diferença: "Simétrico", "Dir. +x cm", "Esq. +x cm" ou "—"; cor verde ≤ 0,5, neutra ≤ 1,5, âmbar > 1,5. |
| Observações do Relatório | Textarea ("Aparece no PDF exportado") + **Salvar Observações** ("Salvando..."), confirmação inline "Observações salvas". |
| Rodapé | Link "Voltar para o Perfil do Aluno". |
| Dados | `GET aluno-detail/:id` (a avaliação anterior = próxima da lista decrescente); `PATCH avaliacoes` (observações). Fotos: `fetch` das URLs assinadas para embutir no PDF. |
| Estados | "Carregando relatório de avaliação..."; se a avaliação não existe, a tela fica em branco (sem mensagem). Alertas: "Aguarde" (dados incompletos), "Erro ao gerar PDF", "Erro ao salvar". |

WhatsApp: abre `https://api.whatsapp.com/send?phone={dígitos}&text=` com
"Olá {nome}, sua nova avaliação está pronta! Resumo: Peso: {x}kg, Gordura: {y}%. Veja mais detalhes na nossa plataforma.".

Há um bloco "print-branding" (FPT / "FocusPT Personal" / "Relatório Oficial de Estudo Antropométrico") sempre oculto (`hidden`) — resíduo.

### 3.8 Galeria de evolução — `/alunos/:id/galeria`

| Seção | Conteúdo |
|---|---|
| Cabeçalho | "Galeria de Evolução por Fotos", "Aluno: {nome} • {n} Fotos salvas"; botão **Voltar Perfil**. |
| Enviar Nova Foto | **Categoria de Ângulo** (Frente / Lado Direito / Lado Esquerdo / Costas); **Data da Foto** (padrão hoje); zona de arrastar/clicar "Arraste a foto ou clique para escolher" ("JPG, PNG, WEBP, GIF, BMP ou AVIF"); prévia ("Previsualização" + **Remover**); "Salvando arquivo de imagem..."; botão **Salvar Imagem na Galeria** (desabilitado sem prévia). |
| Fotos Cadastradas | Grade 2/3 col. de quadrados; no hover: botão excluir, etiqueta do ângulo e data. Vazio: "Nenhuma imagem carregada na galeria. Envie uma imagem de controle ao lado." |
| Processamento | A imagem é redimensionada (máx. 1600 px), achatada em fundo branco e convertida para **JPEG 90%** no navegador. Erros: "O arquivo selecionado não é uma imagem.", "Este formato não é suportado pelo navegador (ex: HEIC/TIFF). Converta para JPG ou PNG.", "Falha ao ler o arquivo.". |
| Dados | `GET aluno-detail/:id`; `POST fotos`; `DELETE fotos/:id` (confirmação "Remover foto" / "Deseja realmente remover esta foto de evolução?"). |
| Estados | "Carregando galeria do aluno..."; sucesso: toast "Foto adicionada à galeria!"; erro: "Erro ao carregar a foto do aluno." / "Erro ao remover foto. Tente novamente." |

### 3.9 Consentimento LGPD — `/alunos/:id/lgpd`

| Item | Detalhe |
|---|---|
| Cabeçalho | "Consentimento LGPD", "Aluno: {nome} • Versão do Termo: 1.0"; botão **Voltar**. |
| Já assinado | Caixa verde "Termo já assinado", "Assinado em: dd/mm/aaaa hh:mm", imagem da assinatura, botão **Voltar ao Perfil**. |
| Não assinado | Card "Leia o Termo antes de assinar" (texto do termo em mono, rolável); card "Assine com o mouse ou toque na tela" com botão **Limpar**, canvas branco 700×200 (placeholder "Assine aqui"), aviso legal e botão **Confirmar Assinatura LGPD** ("Registrando assinatura..."). |
| Dados | Nome: leitura direta `alunos.select('name')` (supabase-js). `GET lgpd-sign/:id`; `POST lgpd-sign`. |
| Estados | "A assinatura está em branco. Por favor, assine no campo acima."; erro do servidor exibido em caixa vermelha. Sucesso → perfil (sem toast). |

### 3.10 Agenda — `/agenda`

| Item | Detalhe |
|---|---|
| Propósito | Agendar e gerenciar os atendimentos da semana. |
| Cabeçalho | "Agenda" + "Atendimentos da semana • {05/10 – 11/10/2026}"; navegação **‹** (semana anterior) / **Hoje** (desabilitado na semana atual) / **›** (próxima); botão **Novo Atendimento**. |
| Semana | 7 blocos (segunda a domingo; padrão = semana de hoje), cada um "Segunda-feira · 06/10" + contador; o dia de hoje fica destacado com badge **Hoje**; botão **+** por dia abre o formulário com a data preenchida. Itens ordenados por horário: horário (mono), nome do aluno (link para o perfil), foco; ícones **editar** e **excluir**. Dia vazio: "Sem atendimentos." |
| Formulário (inline) | "Novo Atendimento"/"Editar Atendimento": **Aluno** (select com os alunos do personal, obrigatório), **Data** (obrigatória, padrão hoje), **Horário** (obrigatório), **Foco / Observação (opcional)** (máx. 500). Botões **Cancelar** e **Agendar**/**Salvar Alterações** ("Salvando..."). Após salvar, a tela vai para a semana da data salva. |
| Excluir | Confirmação "Excluir atendimento" / "Remover o atendimento de {aluno} em dd/mm/aaaa às HH:MM?" → **Excluir**. |
| Dados | `GET agenda?from=<segunda>&to=<domingo>`, `POST agenda`, `PUT agenda/:id`, `DELETE agenda/:id` (contrato em §6). Contrato isolado em `AGENDA_API` / `normalizeAgendaItem` (`agenda-utils.ts`); chamadas em `DataService` (`getAgenda`, `createAgendaItem`, `updateAgendaItem`, `deleteAgendaItem`). Alunos: `GET alunos`. |
| Estados | "Carregando agenda..."; erro: "Falha ao carregar a agenda. Verifique sua conexão e tente de novo." + **Tentar de novo**; toasts "Atendimento agendado!", "Atendimento atualizado!", "Atendimento excluído.", "Erro ao salvar atendimento: {msg}". |

---

## 4. Fluxos principais

| Fluxo | Passos |
|---|---|
| **Login** | `/login` → `signInWithPassword` → sessão salva no `localStorage` (`sb-qhdkacasbbfilqqywosj-auth-token`) → `/`. Logout: diálogo → `signOut()` → `/login`. Sessão expirada → `onAuthStateChange` redireciona. |
| **Cadastrar aluno + anamnese** | `/alunos/novo` → `POST alunos` (insere `alunos` com `lgpd_consent_status='PENDING'` e, se enviada, `anamneses`) → toast → `/alunos/:id`. |
| **Editar aluno** | `/alunos/:id/editar` → prefill via `aluno-detail` → `PUT aluno-detail/:id` (campos permitidos + upsert manual da anamnese). |
| **Nova avaliação** | Perfil → **Nova Avaliação Física** → passos 1–3 → **Concluir** → validação (modal) → `POST avaliacoes` → função valida JP7, busca aluno, calcula derivados, chama RPC `save_avaliacao` (insere `avaliacoes` + `bioimpedancias` + `dobras_cutaneas` + `circunferencias` numa transação) → toast → perfil. |
| **Editar avaliação** | Relatório → **Editar** → `PUT avaliacoes` (recalcula tudo com a data efetiva) → `save_avaliacao(p_avaliacao_id)` atualiza as 4 tabelas. |
| **Lixeira / restaurar** | Aluno: `DELETE aluno-detail/:id` grava `alunos.deleted_at`; some da view `aluno_summary`, do dashboard e do `aluno-detail`; `PATCH` restaura. Avaliação: `DELETE avaliacao-detail/:id` grava `avaliacoes.deleted_at`; aparece na "Lixeira" do perfil; `PATCH` restaura. Não há exclusão definitiva pela UI. |
| **Fotos** | Galeria → escolhe ângulo/data/arquivo → conversão JPEG no navegador → `POST fotos` (base64) → função confere posse, sobe em `fotos-alunos/<uid>/<aluno>/<data>_<cat>_<ts>.jpg` com service role e grava `fotos`. Leitura: `aluno-detail` gera URL assinada (1 h) por foto. Exclusão: **definitiva** (remove objeto e linha). |
| **LGPD** | Perfil → **Assinar LGPD** → aluno lê o termo e assina no canvas → `POST lgpd-sign` (PNG base64) → upload em `lgpd-assinaturas`, URL assinada de 10 anos, upsert em `lgpd_assinaturas` (1 por aluno) e `alunos.lgpd_consent_status='ACCEPTED'` → perfil. |
| **Exportar PDF** | Relatório → **Exportar PDF** → baixa cada foto (URL assinada) como dataURL → `generateAssessmentPDF()` → `Avaliacao_Fisica_{Nome}_{AAAA-MM-DD}.pdf`. Tudo no navegador. |
| **Agenda** | `/agenda` (menu **Agenda** ou **Ver agenda** no dashboard) → semana atual via `GET agenda?from&to` → **Novo Atendimento** (ou **+** num dia) → aluno/data/horário/foco → `POST agenda` → recarrega a semana. Editar: ícone lápis → `PUT agenda/:id`. Excluir: ícone lixeira → confirmação → `DELETE agenda/:id`. O card "Agenda do Dia" do dashboard continua vindo de `get_dashboard_stats().todayAgenda` (`date = CURRENT_DATE`). |
| **Pedem atenção** | Dashboard → `GET alunos` → `buildAttentionGroups(alunos, hoje)` → cada linha leva à ação: nova avaliação, assinatura LGPD ou perfil. |

---

## 5. Modelo de dados

### 5.1 Tabelas (schema `public`)

| Tabela | Colunas principais | Restrições |
|---|---|---|
| `personal_trainers` | `id` (= `auth.users.id`), `name`, `email`, `plan` (`free`/`pro`), `created_at`, `updated_at` | `email` UNIQUE; FK `auth.users` ON DELETE CASCADE |
| `alunos` | `id`, `personal_trainer_id`, `name`, `birth_date`, `gender`, `height_cm`, `goal?`, `phone_number?`, `lgpd_consent_status`, `created_at`, `updated_at`, `deleted_at?` | `gender ∈ {MALE,FEMALE}`; `height_cm` 50–250; `length(trim(name)) ≥ 2`; `lgpd_consent_status ∈ {PENDING,ACCEPTED}` (padrão PENDING) |
| `anamneses` | `aluno_id` (UNIQUE), `cardiac_condition`, `joint_pain`, `chest_pain_during_exercise` (bool, padrão false), `recent_surgery_description`, `active_medications`, `notes` (texto, padrão '') | FK `alunos` CASCADE |
| `avaliacoes` | `aluno_id`, `date`, `bmi`, `bmi_classification`, `body_fat_percentage`, `fat_mass_kg`, `lean_mass_kg`, `body_fat_classification`, `visceral_risk`, `skinfolds_fat_percentage`, `skinfolds_sum_mm`, `rcq`, `observacoes?`, `last_menstruation_date?`, `menstrual_cycle_regular?`, `deleted_at?` | `visceral_risk ∈ {NORMAL,HIGH,VERY_HIGH}`; índice parcial `deleted_at IS NULL` |
| `bioimpedancias` | `avaliacao_id` (UNIQUE), `perfil_bioimpedancia?`, `is_athlete`, `weight_kg`, `bmi`, `body_fat_percentage`, `skeletal_muscle_percentage`, `resting_metabolism_kcal`, `body_age`, `visceral_fat_level`, `water_percentage?`, `fat_mass_kg`, `lean_mass_kg` | `weight_kg > 0`; % gordura e % músculo 0–80; `resting_metabolism_kcal > 0`; `body_age` 10–100; `visceral_fat_level` 1–30; `water_percentage` 0–100; `perfil_bioimpedancia` 1–4 |
| `circunferencias` | `avaliacao_id` (UNIQUE), `neck_cm`, `shoulder_cm`, `chest_cm`, `waist_cm`, `abdomen_cm`, `hip_cm` (NOT NULL); `right/left_arm_relaxed_cm`, `right/left_arm_flexed_cm`, `right/left_forearm_cm`, `right/left_thigh_proximal_cm`, `right/left_thigh_medial_cm`, `right/left_thigh_distal_cm`, `right/left_calf_cm`, `bust_cm` (NULL permitido); `rcq` | todas as medidas `> 0` (NULL satisfaz o CHECK) |
| `dobras_cutaneas` | `avaliacao_id` (UNIQUE), `protocol`, `triceps_mm`, `subscapular_mm`, `chest_mm`, `midaxillary_mm`, `suprailiac_mm`, `abdominal_mm`, `mid_thigh_mm` (NOT NULL), `biceps_mm?`, `calf_mm?`, `sum_mm`, `fat_percentage` | todas `> 0`; `protocol ∈ {7_dobras, 3_dobras_masc, 3_dobras_fem}` (só `7_dobras` implementado) |
| `fotos` | `aluno_id`, `date`, `category`, `storage_path`, `created_at` | `category ∈ {FRENTE, LADO_DIREITO, LADO_ESQUERDO, COSTAS, PERFIL}` (PERFIL legado, exibido como "Lateral") |
| `lgpd_assinaturas` | `aluno_id` (UNIQUE), `signed_at`, `signature_storage_path`, `signature_url`, `term_version` (padrão '1.0') | FK `alunos` CASCADE |
| `agenda` | `personal_trainer_id`, `aluno_id?`, `date`, `time`, `focus?` | FK aluno ON DELETE SET NULL |

Todas as FKs filho→pai usam `ON DELETE CASCADE` (exceto `agenda.aluno_id`). Como o app usa soft delete, o cascade só ocorreria numa exclusão física manual.
Triggers `update_updated_at` em `alunos`, `anamneses`, `personal_trainers`.

### 5.2 View e funções

| Objeto | Descrição |
|---|---|
| `aluno_summary` (view, `security_invoker=on`) | Alunos não excluídos + `age` (hoje) + dados da última avaliação não excluída (`last_assessment_date`, `last_weight`, `last_fat_percentage`, `last_visceral_level`) + `lgpd_signed_at`, `lgpd_signature_url`. |
| `get_dashboard_stats()` | JSON `{activeStudents, totalAssessments, visceralAlerts, todayAgenda[]}` para `auth.uid()`; ignora itens na lixeira; `visceralAlerts` = alunos cuja **última** avaliação tem visceral ≥ 10. |
| `save_avaliacao(p_avaliacao_id, p_avaliacao, p_bio, p_dobras, p_circ)` | Insere (id nulo) ou atualiza as 4 tabelas da avaliação numa única transação; retorna o id. `SECURITY INVOKER` (RLS se aplica). |
| `handle_new_user()` | `SECURITY DEFINER`, trigger em `auth.users`: cria `personal_trainers`. |
| `calc_jackson_pollock_7`, `classify_bmi`, `classify_body_fat`, `classify_rcq`, `classify_skeletal_muscle`, `classify_visceral` | **Legadas**, não usadas pelo app (os cálculos vivem em `_shared/calculations.ts`). |

### 5.3 RLS (resumo)

| Tabela | Política | Regra |
|---|---|---|
| `alunos`, `agenda` | `pt_all_*` (ALL) | `personal_trainer_id = auth.uid()` |
| `anamneses`, `avaliacoes`, `fotos`, `lgpd_assinaturas` | `pt_all_*` (ALL) | `aluno_id IN (alunos do auth.uid())` |
| `bioimpedancias`, `circunferencias`, `dobras_cutaneas` | `pt_all_*` (ALL) | `avaliacao_id IN (avaliações de alunos do auth.uid())` |
| `personal_trainers` | select/insert/update próprios | `auth.uid() = id` |
| `storage.objects` (`fotos-alunos`) | select (authenticated) / insert / delete | 1ª pasta do caminho = `auth.uid()` |
| `storage.objects` (`lgpd-assinaturas`) | select / insert | 1ª pasta do caminho = `auth.uid()` |

Consequência importante: com sessão inválida as consultas **não falham**, retornam listas vazias (HTTP 200) — ver §9.4.

---

## 6. Edge Functions

Comuns: CORS aberto (`*`), `OPTIONS` → 204; `getAuthUser()` valida o JWT (`auth.getUser()`), erro → **401** `{"error":"Unauthorized"}`;
erros genéricos → 500 `{"error": msg}`; método não suportado → 405. O client usa o JWT do usuário (RLS ativa); uploads usam service role.

| Função | Método / caminho | Payload | Validações | Resposta |
|---|---|---|---|---|
| `dashboard` | GET | — | só GET | JSON de `get_dashboard_stats()` |
| `alunos` | GET `?search=` | — | filtro `ilike` em nome/objetivo/telefone (não usado pela UI) | `aluno_summary[]` ordenado por nome |
| | GET `?trash=1` | — | — | `[{id,name,goal,gender,deleted_at}]` excluídos |
| | POST | `{name, birth_date, gender, height_cm, goal?, phone_number?, lgpd_consent_status?, anamnesis?}` | obrigatórios name/birth_date/gender/height_cm; gender MALE/FEMALE; altura 50–250 | 201 + linha de `alunos` |
| `aluno-detail` | GET `/:id` | — | dono + não excluído | aluno + `anamneses` + `avaliacoes` (não excluídas, `date` desc, com `bioimpedancias`, `dobras_cutaneas`, `circunferencias`) + `avaliacoes_trash` + `fotos` (`date` desc, com `url` assinada 1 h); 404 "Aluno não encontrado" |
| | PUT `/:id` | campos de aluno permitidos + `anamnesis?` | whitelist: name, birth_date, gender, height_cm, goal, phone_number, lgpd_consent_status | linha atualizada |
| | DELETE `/:id` | — | — | soft delete → `{success:true}` |
| | PATCH `/:id` | — | — | restaura → `{success:true}` |
| `avaliacoes` | POST | `{aluno_id, date, last_menstruation_date?, menstrual_cycle_regular?, bioimpedance{}, circumferences{}, skinfolds{}}` | blocos obrigatórios; protocolo só `7_dobras`; 7 dobras JP7 numéricas > 0; aluno do personal (403) | 201 + linha de `avaliacoes` |
| | PUT | `{avaliacao_id, date?, ...mesmos blocos}` | idem; avaliação não excluída e do personal (403) | linha atualizada |
| | PATCH | `{avaliacao_id, observacoes}` | posse; texto vazio → NULL | linha atualizada |
| `avaliacao-detail` | GET `/:id` | — | posse | avaliação com sub-tabelas + aluno (não usado pela UI) |
| | DELETE `/:id` | — | posse (403) | soft delete |
| | PATCH `/:id` | — | posse (403) | restaura |
| `fotos` | POST | `{aluno_id, date, category, image_base64, mime_type?}` | category ∈ FRENTE/LADO_DIREITO/LADO_ESQUERDO/COSTAS; posse (403) | 201 + linha + `url` assinada 1 h |
| | DELETE `/:id` | — | posse (403) | remove objeto e linha |
| `lgpd-sign` | GET `/:alunoId` | — | — | `{signed:false}` ou `{signed:true, id, signed_at, signature_url, term_version}` |
| | POST | `{aluno_id, signature_base64}` | posse (403); base64 ≥ 100 caracteres | 201 `{success, signed_at, term_version, signature_url}` |
| `agenda` | GET `?from=YYYY-MM-DD&to=YYYY-MM-DD` | — | datas ISO; `to ≥ from`; intervalo **máx. 92 dias**; sem parâmetros = hoje (America/Sao_Paulo); só `from` = um dia; `?date=` legado = `from=to=date`; esconde itens de alunos na lixeira | `[{id, date, time 'HH:MM', focus \| null, aluno_id, student_name, created_at}]` por data e horário |
| | POST | `{aluno_id, date, time, focus?}` | `aluno_id` (UUID, **não nulo**), `date`, `time` obrigatórios; `focus` ≤ 500; aluno do personal e fora da lixeira (403) | 201 + item (mesmo formato) |
| | PUT `/:id` | `{aluno_id?, date?, time?, focus?}` (ao menos um) | mesmas regras; id também aceito em `?id=` ou no corpo | item atualizado; 404 se não existir |
| | DELETE `/:id` | — | id também aceito em `?id=` ou no corpo | `{success:true}`; 404 se não existir |

Erros de CHECK na `avaliacoes` viram mensagens amigáveis: "Há medidas inválidas (zero ou negativas). Todas as medidas devem ser maiores que zero." ou "Algum valor está fora do intervalo permitido. Verifique os campos.".

Exemplo de corpo `POST avaliacoes` (dados fictícios):

```json
{
  "aluno_id": "uuid", "date": "2026-09-15",
  "last_menstruation_date": null, "menstrual_cycle_regular": null,
  "bioimpedance": { "weight_kg": 82.4, "body_fat_percentage": 21.3, "skeletal_muscle_percentage": 36.1,
                    "resting_metabolism_kcal": 1780, "body_age": 34, "visceral_fat_level": 9,
                    "water_percentage": 54.2, "is_athlete": false },
  "circumferences": { "neck_cm": 39, "shoulder_cm": 118, "chest_cm": 101, "waist_cm": 88, "abdomen_cm": 92,
                      "hip_cm": 103, "right_arm_relaxed_cm": 34, "right_arm_flexed_cm": 37.5,
                      "right_thigh_proximal_cm": 58, "right_calf_cm": 38.5 },
  "skinfolds": { "protocol": "7_dobras", "triceps_mm": 12, "subscapular_mm": 18, "chest_mm": 10,
                 "midaxillary_mm": 14, "suprailiac_mm": 20, "abdominal_mm": 26, "mid_thigh_mm": 15 }
}
```

---

## 7. Regras de cálculo

Implementação única em `supabase/functions/_shared/calculations.ts` (usada pela função `avaliacoes`). Os valores derivados são **gravados** no banco na criação/edição.

| Indicador | Fórmula / tabela | Observações |
|---|---|---|
| Idade | anos completos na **data da avaliação** (`calcAge(birth, date)`, sem conversão UTC) | Antes usava a idade no dia do salvamento; migration `20261007005236` recalculou o histórico. O PDF usa a mesma regra; perfil/lista mostram idade de hoje. |
| IMC | `peso / (altura_m)²`, 2 casas | Sempre recalculado; o "IMC Balança" digitado é ignorado. Classes OMS: < 18,5 Abaixo do peso; < 25 Peso normal; < 30 Sobrepeso; < 35 Obesidade Grau I; < 40 Grau II; ≥ 40 Grau III. |
| Massa gorda / magra | `peso × %gordura(bioimp.) / 100`; magra = peso − gorda | 2 casas. Usa o % da **balança**, não o das dobras. |
| Classificação % gordura (bioimp.) | Tabela Omron HBF-514C (Gallagher et al., 2000), limites [Normal, Alto, Muito Alto]: | Abaixo do 1º limite = **Baixo**. < 20 anos usa a faixa 20–39. Fonte: manual Omron HBF-514C (omronbrasil.com, PDF `balanca_HBF-514C-LA_ES_-PT_im-2.pdf`). |
| | Homem 20–39: 8 / 20 / 25 · 40–59: 11 / 22 / 28 · 60+: 13 / 25 / 30 | |
| | Mulher 20–39: 21 / 33 / 39 · 40–59: 23 / 34 / 40 · 60+: 24 / 36 / 42 | |
| Classificação % músculo esquelético | Omron: H 18–39: 33,3/39,4/44,1 · 40–59: 33,1/39,2/43,9 · 60+: 32,9/39,0/43,7; M 18–39: 24,3/30,4/35,4 · 40–59: 24,1/30,2/35,2 · 60+: 23,9/30,0/35,0 | Implementada e testada, mas **não gravada nem exibida** atualmente. |
| Gordura visceral | 1–9 `NORMAL`, 10–14 `HIGH`, 15–30 `VERY_HIGH` (escala Omron) | Rótulos na UI: Normal / Alto / Muito Alto. Dashboard conta ≥ 10. |
| Somatório de dobras | **7 dobras JP7**: peitoral + axilar média + tríceps + subescapular + abdominal + supra-ilíaca + coxa | Bíceps e panturrilha são opcionais e **não entram** (migration `20261007004326` corrigiu somas antigas de 9 dobras). |
| Densidade (Jackson & Pollock 7) | H: `1,112 − 0,00043499·S + 0,00000055·S² − 0,00028826·idade`; M: `1,097 − 0,00046971·S + 0,00000056·S² − 0,00012828·idade` | Jackson & Pollock (1978, homens) e Jackson, Pollock & Ward (1980, mulheres). |
| % gordura (dobras) | Siri: `(495 / D) − 450`, 2 casas | Gravado em `avaliacoes.skinfolds_fat_percentage` e `dobras_cutaneas.fat_percentage`. |
| RCQ | `cintura / quadril`, 4 casas | Classificação (`classifyRcq`: H 0,83/0,88/0,95; M 0,71/0,77/0,82 → Baixo/Moderado/Alto/Muito Alto) existe mas não é gravada nem exibida. |
| Simetria (tela) | `|D − E|`: ≤ 0,5 verde, ≤ 1,5 neutro, > 1,5 âmbar | Só na tela do relatório. |
| Conversão cm→mm (form) | valor entre 0 e 6 nas dobras → ×10 | `assessment-utils.ts`. |

---

## 8. Relatório PDF

Gerado no navegador por `generateAssessmentPDF()` (`src/app/pdf-report.ts`, jsPDF, A4 retrato, margens 14 mm, documento **claro** com azul `#2563EB` / `#1E3A8A`).

| # | Seção | Conteúdo |
|---|---|---|
| 1 | Cabeçalho | Faixa azul-escura: "FocusPT", "Gestão de Avaliação Física", "RELATÓRIO DE AVALIAÇÃO FÍSICA", "Emitido em dd/mm/aaaa". Páginas seguintes: cabeçalho corrido (FocusPT + nome do aluno). |
| 2 | Dados do aluno | Aluno, Idade (na data da avaliação), Sexo, Altura, Nascimento, Data da Avaliação, Avaliação Anterior, Telefone, Objetivo, Status LGPD. |
| 3 | Indicadores Principais | 6 cards: Peso, IMC (+classe), % Gordura (bioimp.) (+classe), Massa Magra, Idade Corporal, Gordura Visceral (+risco), cada um com variação colorida (verde = melhora, vermelho = piora, conforme o sentido de cada indicador). |
| 4 | Comparativo — Atual vs. Avaliação Anterior | Barras: Peso, % Gord. (bioimp.), % Músculo, M. Magra, M. Gorda. |
| 5 | Evolução Histórica | Linhas de Peso (kg) e % Gordura Corporal, com avaliações até a data da exportada. |
| 6 | Tabelas (Parâmetro / Atual / Anterior / Variação) | Composição Corporal — Bioimpedância (Omron HBF-514C); Circunferências (cm) (busto só se houver; RCQ); Saúde Feminina (só mulher com dado); Dobras Cutâneas (mm) (bíceps/panturrilha só se houver; somatório 7 dobras; % gordura por dobras); Anamnese / Histórico de Saúde (sem comparação). |
| 7 | Observações | Texto do campo "Observações do Relatório", se preenchido. |
| 8 | Evolução Visual — Comparativo de Fotos | Nova página; por ângulo (Frente, Lado Direito, Lado Esquerdo, Costas, Lateral): "Início" × "Recente" lado a lado (ou uma foto centralizada), com data. |
| — | Rodapé | "Personal Trainer: {nome}", "FocusPT — Documento gerado automaticamente", "Página X de Y". |

**Regra de seleção das fotos (`pdfSelectPhotos`)**: fotos não têm `avaliacao_id`. Cada foto é atribuída à avaliação (não excluída) de **data mais próxima** (empate → a anterior).
"Recente" = foto atribuída à avaliação exportada (a mais próxima da data dela; empate → a mais nova). "Início" = foto mais antiga atribuída a uma avaliação **anterior**.
Fotos atribuídas a avaliações posteriores à exportada são ignoradas. Fotos são baixadas via URL assinada; se falhar, são puladas.

**Garantia de layout**: `src/tests/pdf-layout.spec.ts` intercepta `doc.text()`/`doc.addImage()` e verifica, em vários cenários (nomes longos, valores extremos, muitas avaliações, fotos), que nenhum texto se sobrepõe a outro ou a uma foto, que tudo está dentro das margens e que não há título órfão no fim da página.

---

## 9. Testes, build, deploy e armadilhas

### 9.1 Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | `ng serve` na porta 3000 (host 0.0.0.0). `npm start` = `ng serve` padrão (4200). |
| `npm run build` | `ng build` (produção) → `dist/app/browser`. Budgets: inicial 2 MB aviso / 3 MB erro. |
| `npm run test:unit` | **Vitest** (`vitest.config.ts`, ambiente node, `src/tests/**/*.spec.ts`): `calculations`, `assessment-utils`, `lgpd-utils`, `pdf-report`, `pdf-layout`. Em 07/10/2026: 5 arquivos, 182 testes passando. |
| `npm run test:unit:watch` / `test:unit:coverage` | Modo watch / cobertura (cobertura medida em `supabase/functions/_shared`). |
| `npm test` | `ng test` (builder `@angular/build:unit-test`) — só `src/app/app.spec.ts`. |
| `npm run lint` | angular-eslint. |
| `deno test supabase/functions/_tests/` | Testes Deno das fórmulas (`calculations.test.ts`), requer Deno instalado. |

### 9.2 Build e deploy do frontend
Push na `main` → Vercel (`alexandre-site`) roda `npm run build` e publica `dist/app/browser` com fallback SPA.

### 9.3 Deploy das Edge Functions
Manual. Ao usar o MCP `deploy_edge_function`, replicar o layout do repositório:
- entrypoint em **subpasta** (`avaliacoes/index.ts`, não `index.ts`) para os imports `../_shared/*.ts` resolverem;
- incluir os arquivos `_shared/*` importados (`cors.ts`, `supabase.ts`, `calculations.ts`);
- funções com import map (`aluno-detail`, `avaliacoes`) precisam do `deno.json` no payload + `import_map_path`.

Depois de alterar `_shared/calculations.ts`, **redeployar `avaliacoes`**. Mudanças de enums (ex.: `fotos.category`) exigem alterar **o CHECK no banco e a validação na função**.

### 9.4 Armadilhas conhecidas

| Sintoma | Causa / ação |
|---|---|
| "O código está certo mas o erro continua" | Função implantada desatualizada. Conferir com `get_edge_function` e redeployar. |
| Telas vazias, "sumiram os alunos" | Sessão expirada/revogada: RLS devolve lista vazia com 200. Os dados estão intactos; refazer login. O `App` já redireciona em `SIGNED_OUT`. |
| Item "apagado" ainda no banco | Soft delete (`deleted_at`). Restaurar pela Lixeira. Fotos são exceção (exclusão definitiva). |
| Sem backup | Plano free do Supabase não tem backups/PITR. Não rodar `DELETE` físico em produção; considerar dump periódico (`pg_dump`). |
| Agenda "de hoje" errada à noite | `CURRENT_DATE` do Postgres e o padrão da função `agenda` usam UTC. |
| Mudança feita pelo dashboard | Vira "drift": um banco novo não terá o objeto. Toda alteração de schema/Storage deve virar migration em `supabase/migrations`. |

### 9.5 Recriar o banco do zero

`supabase/migrations` contém o histórico completo de produção (mesmas versões de `supabase_migrations.schema_migrations`, com o SQL exato aplicado) + `20261008014409_sync_drift.sql`, que cria o que havia sido feito pelo dashboard: buckets `fotos-alunos` (privado, 5 MB, jpeg/png/webp) e `lgpd-assinaturas` (privado, 2 MB, png) e 4 policies de `storage.objects`. Os buckets **vêm das migrations** — não é preciso criá-los à mão.

1. Criar um projeto novo no Supabase (dashboard) e anotar o *project ref* e a senha do banco.
2. Na raiz do repo: `supabase login` → `supabase link --project-ref <ref>` → `supabase db push` (aplica todas as migrations em ordem).
3. Implantar as Edge Functions do repo: `dashboard`, `alunos`, `aluno-detail`, `avaliacoes`, `avaliacao-detail`, `fotos`, `lgpd-sign`, `agenda` (`supabase functions deploy <nome>`; cuidados de layout em §9.3).
4. Atualizar a URL do projeto, a chave anon e `functionsUrl` em `src/environments/environment.ts`.
5. Criar o usuário do personal em Authentication (o trigger `on_auth_user_created` cria a linha em `personal_trainers`).

Observações: em produção existe também a Edge Function `setup-admin-user`, que **não está no repositório**. A pasta `supabase/.temp/` (cache da CLI) é ignorada pelo git. A migration de sync é um no-op em produção (só cria o que não existe), então `supabase db push` no projeto atual apenas registra essa versão no histórico.

---

## 10. Segurança & LGPD

| Tema | Situação |
|---|---|
| Isolamento entre personais | RLS em todas as tabelas + checagem explícita de `personal_trainer_id` nas funções; `get_dashboard_stats` deriva o id de `auth.uid()` (sem IDOR). |
| JWT | `verify_jwt = true` em todas as funções + `auth.getUser()`. |
| Service role | Usada só dentro das funções `fotos` e `lgpd-sign` (Storage), depois de validar a posse do aluno. |
| Fotos | Bucket privado; URLs assinadas de **1 hora** geradas a cada leitura; caminho prefixado pelo uid. |
| Assinaturas LGPD | Bucket privado; URL assinada de **10 anos** gravada em `lgpd_assinaturas.signature_url` (quem tiver a URL acessa a imagem até expirar). Re-assinar substitui o registro (upsert por aluno). |
| Termo | `LGPD_TERM_TEXT` v1.0 (`lgpd-utils.ts`): dados coletados (pessoais, saúde, biométricos), finalidade, base legal (art. 7º I e V), prazo, direitos do titular, canal de contato. A versão também está fixa (`TERM_VERSION`) na função. |
| Status LGPD | `alunos.lgpd_consent_status` vira `ACCEPTED` apenas pelo `POST lgpd-sign`… **porém** o `PUT aluno-detail` aceita `lgpd_consent_status` na whitelist, então a API permite marcar ACCEPTED sem assinatura (a UI não faz isso). |
| Busca | `alunos?search=` interpola o termo no filtro `.or()` do PostgREST sem escapar (a UI não usa; RLS continua limitando o escopo). |
| Chaves no front | Só a chave **anon** pública (`environment.ts`). Nenhum segredo no repositório. |
| Direito de eliminação | Não há exclusão definitiva pela UI; atender pedido de eliminação exige ação manual no banco + Storage. |
| CORS | `Access-Control-Allow-Origin: *` (proteção depende do JWT). |

---

## 11. Pendências e inconsistências conhecidas

- **"Agenda do Dia" × tela Agenda**: o card do dashboard usa `CURRENT_DATE` do Postgres (UTC), enquanto a tela `/agenda` usa a data local do navegador — à noite o card pode mostrar o dia seguinte.
- **Idade no perfil** usa `new Date(birth_date)` (UTC) — pode mostrar 1 ano a menos no dia do aniversário.
- **Relatório (tela)**: radar usa valores padrão quando a medida falta; tabela de simetria mostra " cm" vazio se um lado não foi medido; avaliação inexistente deixa a tela em branco.
- **Lista de alunos**: erro de carregamento aparece como "Nenhum aluno encontrado".
- `index.html` com `lang="en"`; `README.md`/`.env.example` do template AI Studio; `src/server.ts` mock e dependências não usadas.
- Funções SQL `classify_*`/`calc_jackson_pollock_7` legadas e função `setup-admin-user` fora do repositório.
- Classificações de % músculo e de RCQ existem no código mas não são persistidas/exibidas.
