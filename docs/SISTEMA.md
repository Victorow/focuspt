# FocusPT — Documentação do Sistema

> Documento de referência para desenvolvedores novos no código e para o proprietário.
> Tudo aqui foi verificado no código (`src/app`, `site/`, `scripts/`, `e2e/`, `supabase/functions`, `supabase/migrations`) e no
> banco do projeto Supabase `qhdkacasbbfilqqywosj` (inspeção somente leitura). Última revisão: 08/10/2026 (redesign "Escritório", site público e suíte E2E).

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
| Site público | Landing estática na raiz do domínio (`site/index.html`): apresentação, "Como funciona", calculadora de tempo, FAQ e chamada para WhatsApp; link **Entrar** → `/app/login`. |
| Alunos | Cadastro com dados pessoais, objetivo, telefone (WhatsApp) e **anamnese** (PAR-Q simplificado). Lista em tabela com busca, filtros (reavaliação vencida, visceral alto, LGPD pendente), exclusão para a **lixeira** e restauração. |
| Avaliação física | Formulário em 4 etapas: **bioimpedância Omron HBF-514C**, **perímetros** (tronco + membros por lado), **dobras cutâneas** (Jackson & Pollock 7 + bíceps/panturrilha opcionais) e **Revisão** com prévia dos resultados. No celular vira o modo **"Medir"** (um campo por vez). Para alunas há campos de saúde feminina. |
| Cálculos | IMC, massa gorda/magra, classificação Omron do % de gordura, risco visceral, RCQ, somatório das 7 dobras e % de gordura por JP7 + Siri (idade **na data** da avaliação). Gravados pelo servidor (Edge Function); o front só mostra uma **prévia** com as mesmas fórmulas. |
| Relatório | Tela com 5 indicadores e tabelas comparativas **atual × anterior** (bioimpedância, perímetros D/E, dobras) com barras de **faixa Omron**, observações, **exportação PDF** (jsPDF) e atalho de **WhatsApp**. |
| Fotos de evolução | Upload por ângulo (Frente, Lado Direito, Lado Esquerdo, Costas) em bucket privado; fotos agrupadas em **sessões** por data; comparação **início × recente** com slider; comparativo também no PDF. |
| LGPD | Termo de consentimento v1.0 lido e assinado pelo aluno num canvas (mouse/toque) + caixa "Li o termo e concordo" obrigatória; a imagem fica em bucket privado e o status do aluno passa a `ACCEPTED`. |
| Agenda | Tela `/agenda` com visão semanal (segunda a domingo): criar, editar e excluir atendimentos (aluno, data, horário, foco). O Início mostra a "Agenda de hoje". |
| Início | KPIs (alunos ativos, avaliações registradas, gordura visceral alta, termo LGPD pendente), **Agenda de hoje** (concluído / próximo / depois) e **Pedem atenção** (reavaliação vencida, LGPD pendente, visceral alto). |
| Tema | Claro, escuro ou automático (segue o aparelho), escolhido no menu **Conta**. |

---

## 2. Arquitetura

```
Navegador
   ├─ /            landing estática (site/index.html → dist/site/index.html)
   └─ /app/*       Angular 21 SPA (baseHref /app/, dist/site/app/)
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
| Framework | Angular 21, componentes **standalone**, signals, Reactive Forms. Sem Angular Material em uso (os pacotes `@angular/material`/`@angular/cdk` continuam no `package.json`, mas nenhum componente os importa; não há Material Icons). |
| Estilo | Sistema visual próprio ("Escritório", ver §2.2) em `src/styles.css`: tokens como variáveis CSS + classes globais. Tailwind CSS 4 continua importado (`@import "tailwindcss"`) e é usado apenas como utilitário pontual. Fonte **Geist** (Google Fonts), 13 px. |
| Telas | `src/app/pages/`: `login`, `dashboard`, `students-list`, `new-student`, `student-profile`, `new-assessment`, `assessment-report`, `student-gallery` (`*.component.ts`, ~3.400 linhas no total). Fora de `pages/`: `agenda.component.ts`, `lgpd-sign.component.ts`, `app.ts`/`app.html`/`app.css` (shell), `toast.*`, `dialog.*`. O antigo `components.ts` monolítico foi removido. |
| Dados | `data.ts` (interfaces + `DataService`), `supabase.service.ts`. |
| Funções puras (testadas no Vitest) | `assessment-utils.ts` (conversão cm→mm, `parseDecimal` com vírgula ou ponto, `formatNum`/`formatDelta` pt-BR, `deltaClass`, `symmetry`, `implausibleWaterChange`), `assessment-calc.ts` (**espelho** de `_shared/calculations.ts` para a prévia no navegador — a fonte da verdade continua sendo a Edge Function), `omron-bands.ts` (barra de faixa Omron do relatório), `profile-utils.ts` (Δ, sentido de melhora por métrica, barra de referência do perfil, `ageAt`, etiquetas da anamnese), `students-filter.ts` (busca, filtros e rótulos da lista), `dashboard-utils.ts` (título do dia, estado concluído/próximo/depois da agenda), `attention-utils.ts` ("Pedem atenção"), `agenda-utils.ts`, `date-utils.ts`, `media-utils.ts` (fotos recentes, sessões por data, `nearestDate`, par início/recente), `theme-utils.ts` (modo do tema), `auth-utils.ts` (`getTrainerToken`, `getTrainerName` lidos do `localStorage`), `lgpd-utils.ts`, `pdf-report.ts`. |
| Configuração | `src/environments/environment.ts`: `supabaseUrl`, `supabaseAnonKey` (chave pública anon), `functionsUrl`. Só existe esse arquivo (sem variante de produção). |
| `index.html` | `lang="pt-BR"`, título "FocusPT", `<base href="/">` substituído no build pelo `baseHref` `/app/`; favicons `favicon.ico`/`favicon.svg`; `theme-color #1A1B1E`. |
| SSR | **Não está ativo.** Existem `main.server.ts`, `app.config.server.ts` e `app.routes.server.ts` (todas as rotas com `RenderMode.Client`), mas o `angular.json` não configura `server`/`ssr`. |
| `src/server.ts` | **Legado/mock** do template AI Studio: Express com API fake gravando em `database.json`. Não é usado pelo app nem pelo deploy. |
| Dependências não usadas | `@google/genai`, `motion`, `html2canvas`, `express`, `@angular/material`, `@angular/cdk`. O `README.md` e o `.env.example` ainda são do template AI Studio (GEMINI_API_KEY) e não se aplicam. |

**Camada de dados (`DataService` → `SupabaseService`)**: `callFunction(name, body, method)` e `callFunctionGet(name, params)`
obtêm a sessão (`auth.getSession()`), enviam `Authorization: Bearer <access_token>` + `apikey` e lançam `Error(json.error)` se `!res.ok`.
Sem sessão → `Error('Não autenticado')`.

**Guarda de autenticação** (`app.ts`): não há `CanActivate`. O `App` verifica a cada `NavigationEnd` se existe token no
`localStorage` (`sb-*-auth-token`, função `getTrainerToken()` em `auth-utils.ts`); sem token → `/login`; com token em `/login` → `/`.
Além disso, assina `onAuthStateChange` e redireciona para `/login` em `SIGNED_OUT` ou sessão nula.

### 2.2 Sistema visual — direção "Escritório"

Princípios (valem para o app, a landing e o PDF):

- **Sem ícones, SVG decorativo, emoji ou gradientes.** Ações são texto ("Editar", "Excluir", "Fechar"). A única marca gráfica é o símbolo da logo.
- **Cor significa favorável/desfavorável**, nunca "subiu/desceu": `.dn` (verde, `--ok`) = mudança favorável, `.up` (vermelho, `--bad`) = desfavorável, `.nt` = neutro/sem juízo. O sentido de cada métrica está em `METRIC_IMPROVE` (`profile-utils.ts`) e na função `deltaClass(delta, good)`.
- **Um botão primário por tela** (`.btnP`); o resto é `.btn` (contorno), `.btnQ` (sem borda) ou `.btnD` (perigo).
- **Navegação superior** (não há sidebar); conteúdo centrado com largura máxima **1360 px** (`.pad`, `.crumbs`, `.navIn`); abaixo de 720 px as margens caem para 16 px.
- Tipografia **Geist 13 px / 18 px** de linha, números tabulares; títulos de tela em `.big` (22 px); rótulos `.k`/`.lb` (12 px, `--tx2`).

**Tokens** (`src/styles.css`): `--bg`, `--sf`, `--sf2` (superfícies), `--bd`, `--bd2` (bordas), `--tx`, `--tx2` (texto), `--ln` (links), `--ok`/`--okbg`, `--bad`/`--badbg`, `--pb`/`--pt` (botão primário: fundo/texto), `--ref`/`--refok` (barra de referência), `--hov`, `--focus`, `--ph` (placeholder de foto).
Tema claro em `:root` (fundo `#F5F5F4`, superfície `#FFFFFF`, texto `#1A1B1E`); tema escuro em `:root[data-theme="dark"]` **e** em `@media (prefers-color-scheme: dark)` para `:root:not([data-theme="light"])` (fundo `#1A1B1E`, superfície `#202124`, texto `#E6E6E3`). Ambos definem `color-scheme`.

**Classes globais** (em `@layer components`, mesmos nomes dos artboards `*.dc.html` do projeto `fpt-design`):

| Grupo | Classes |
|---|---|
| Botões | `.btn`, `.btnP` (primário), `.btnD` (perigo), `.btnQ` (quieto) — altura mínima 44 px |
| Painéis | `.panel` (borda + raio 6 px), `.ph` (cabeçalho do painel), `.kpi` (grade de indicadores), `.row` (linha clicável), `.empty`/skeleton por tela |
| Texto | `.k` (legenda 12 px), `.lb` (rótulo de campo), `.big` (22 px), `.n` (numérico à direita), `.up` / `.dn` / `.nt` (desfavorável / favorável / neutro) |
| Tabelas | `table`/`th`/`td` estilizados globalmente; `.grp` (linha de grupo); `.ref` + `.refOk` + `.refMk` (barra de faixa Omron: trilho, faixa favorável, marcador do valor) |
| Etiquetas | `.tag`, `.tagW` (alerta), `.tagOk` (ok) |
| Formulários | `.f` (input/select/textarea), `.lb`, `.chk` (checkbox com rótulo), `.seg` (controle segmentado; `.on` = selecionado), `.sr` (só leitor de tela) |
| Navegação | `.tab`/`.tabOn`, `.crumbs` (trilha + ações da tela), `.pad` (área de conteúdo), `.nav`/`.navIn`/`.navItem`/`.navOn` (barra superior), `.main` |
| Marca | `.mk` (símbolo da logo em CSS puro: anel, barra e dois pesos; `app.css` 26 px, login 32 px, landing 40 px), `.brand`, `.wm` (wordmark) |

**Logo**: `public/logo.svg` (claro), `public/logo-dark.svg` (escuro), `public/favicon.svg`/`favicon.ico`, `public/og.png` (imagem para redes sociais). No app o símbolo é desenhado em CSS (`.mk`) e segue os tokens do tema.

**Tema** (`src/app/theme.service.ts` + `theme-utils.ts`): modos `claro` | `escuro` | `auto` (padrão `auto` = segue o aparelho). Persistido em `localStorage['fpt-theme']`; aplicado como `data-theme="light"|"dark"` em `<html>` (`auto` remove o atributo). Escolhido no popover **Conta** da barra superior. Exceções sempre claras: o papel da assinatura LGPD e o PDF; sempre escuro: o palco direito do login.

### 2.3 Backend (Supabase)

| Recurso | Detalhe |
|---|---|
| Auth | E-mail + senha (`signInWithPassword`). Não há tela de cadastro; o usuário é criado fora do app (existe uma função `setup-admin-user` implantada, **não versionada** no repo). Trigger `on_auth_user_created` → `handle_new_user()` cria a linha em `personal_trainers` (nome = `raw_user_meta_data.name` ou parte do e-mail). |
| RLS | Todas as tabelas de domínio filtram por `personal_trainer_id = auth.uid()` (direta ou via `alunos`). Ver §5.3. |
| Storage | `fotos-alunos` (privado, 5 MB, `image/jpeg|png|webp`) e `lgpd-assinaturas` (privado, 2 MB, `image/png`). Caminho: `<uid>/<aluno_id>/...`. |
| Edge Functions | `dashboard`, `alunos`, `aluno-detail`, `avaliacoes`, `avaliacao-detail`, `fotos`, `lgpd-sign`, `agenda` (+ `setup-admin-user`, só no projeto). Todas com `verify_jwt = true`. |
| Plano | **Free** — sem backups/PITR. Por isso alunos e avaliações usam *soft delete*. |

### 2.4 Build e deploy

| Parte | Como |
|---|---|
| Build | `npm run build` = `ng build` + `node scripts/build-site.mjs`. O Angular sai em **`dist/site/app/`** (`angular.json`: `baseHref: "/app/"`, `outputPath: { base: "dist/site", browser: "app" }`). O script copia `site/` (landing `index.html`, `robots.txt`, `sitemap.xml`) para `dist/site/` e, de `public/`, `favicon.ico`, `favicon.svg`, `og.png`, `logo.svg`, `logo-dark.svg` para a raiz do domínio. |
| Frontend | **Vercel**, projeto `alexandre-site`, a partir do GitHub (branch `main`). `vercel.json`: `buildCommand: npm run build`, `outputDirectory: dist/site`; **rewrites** `/app` e `/app/(.*)` → `/app/index.html` (fallback SPA só sob `/app`); **redirects permanentes (308)** das rotas antigas `/login` → `/app/login`, `/alunos` → `/app/alunos`, `/alunos/(.*)` → `/app/alunos/$1`, `/agenda` → `/app/agenda`. O `netlify.toml` foi removido. |
| Edge Functions | **Deploy manual** (MCP `deploy_edge_function` ou CLI). **Não** são publicadas no push — o código do git pode divergir do implantado. Ver §9.4. |
| Banco | Migrations em `supabase/migrations`, espelhando exatamente o histórico de produção + `20261008014409_sync_drift.sql` (buckets e policies de Storage criados pelo dashboard). Recriam o banco do zero — ver §9.6. |

### 2.5 Site público (landing)

`site/index.html` é uma página estática única (`lang="pt-BR"`, Geist via Google Fonts, CSS inline com os mesmos tokens/classes do sistema visual, JSON-LD `SoftwareApplication` + FAQ). Seções: hero, "Três coisas que fazem o aluno sumir", "Como funciona" (`#como`), calculadora de tempo (`#calc`), depoimentos, FAQ (`#faq`), chamada final, rodapé. Botões **Entrar** → `/app/login` e **Falar no WhatsApp** (`wa.me/…`, número fixo no HTML).

**O domínio ainda não foi comprado.** Enquanto isso, o placeholder `https://SEU-DOMINIO/` aparece em todos os lugares abaixo — trocar **todos** quando o domínio existir:

| Arquivo | O que trocar |
|---|---|
| `site/index.html` | `<link rel="canonical">`, `og:url`, `og:image` (`https://SEU-DOMINIO/og.png`), campo `url` dos dois blocos JSON-LD. |
| `site/sitemap.xml` | `<loc>https://SEU-DOMINIO/</loc>`. |
| `site/robots.txt` | linha `Sitemap: https://SEU-DOMINIO/sitemap.xml`. |
| Vercel | adicionar o domínio ao projeto `alexandre-site` (e o `www`), conferir o certificado. |

Outros placeholders na landing, a preencher antes de divulgar: preço/plano no JSON-LD (`"[A PREENCHER]"`, `"[PLANO E PREÇO — definir antes de publicar]"`) e os dois depoimentos (`[DEPOIMENTO DE CLIENTE…]`, `[NOME]`, `[CIDADE]`).
Há dois comentários-âncora para scripts de marketing: `<!-- META PIXEL: colar aqui -->` (no `<head>`) e `<!-- GTM: colar aqui -->` (antes do conteúdo). Nenhum script de rastreamento está instalado hoje.

---

## 3. Mapa de telas

### 3.0 Shell, navegação e componentes globais

**Campos obrigatórios (todos os formulários, desde 09/10/2026):** o rótulo recebe a classe `req` (`src/styles.css`, `.req::after` = " *" em vermelho) e o campo `aria-required="true"`; o cabeçalho do formulário traz a legenda "* obrigatório" e os demais campos são marcados "opcional". Vale para login (e-mail, senha), aluno (nome, nascimento, sexo, altura; anamnese, objetivo e WhatsApp opcionais), avaliação (data da medição, todos os campos não marcados "opcional" na balança, tronco e dobras; na tabela de membros, as linhas com * exigem ao menos um lado completo; no modo Medir do celular o rótulo grande também leva o *) e agenda (aluno, data, hora; foco opcional).

**Rotas** (`src/app/app.routes.ts`). Em produção todas vivem sob **`/app/`** (`baseHref`); abaixo estão os caminhos internos do Angular.

| Rota | Componente | Arquivo |
|---|---|---|
| `/login` | `LoginComponent` | pages/login.component.ts |
| `/` | `DashboardComponent` (Início) | pages/dashboard.component.ts |
| `/agenda` | `AgendaComponent` | agenda.component.ts |
| `/alunos` | `StudentsListComponent` | pages/students-list.component.ts |
| `/alunos/novo` | `NewStudentComponent` (modo criar) | pages/new-student.component.ts |
| `/alunos/:id/editar` | `NewStudentComponent` (modo editar) | pages/new-student.component.ts |
| `/alunos/:id` | `StudentProfileComponent` | pages/student-profile.component.ts |
| `/alunos/:id/lgpd` | `LgpdSignComponent` | lgpd-sign.component.ts |
| `/alunos/:id/avaliacoes/nova` | `NewAssessmentComponent` (criar) | pages/new-assessment.component.ts |
| `/alunos/:id/avaliacoes/:id_aval/editar` | `NewAssessmentComponent` (editar) | pages/new-assessment.component.ts |
| `/alunos/:id/avaliacoes/:id_aval` | `AssessmentReportComponent` | pages/assessment-report.component.ts |
| `/alunos/:id/galeria` | `StudentGalleryComponent` | pages/student-gallery.component.ts |
| `**` | redireciona para `/` | — |

**Shell (`app.html`)** — fora do login:
- **Barra superior** (`.nav`, 52 px, sem sidebar): símbolo `.mk` + "FocusPT" (link para `/`); itens **Início**, **Alunos**, **Agenda** (`.navItem`, ativo = `.navOn`). À direita, o nome do personal (`user_metadata.name` ou parte do e-mail; oculto em telas ≤ 720 px) e o botão **Conta**.
- **Popover Conta** (`.panel.pop`): nome do personal (só no celular), rótulo **Tema** com controle segmentado **Claro / Escuro / Auto** (`ThemeService.set`) e botão **Sair**. Fecha ao clicar fora, com `Esc` ou ao navegar.
- Conteúdo: `<main class="main">` → cada tela renderiza `.crumbs` (trilha "Alunos › Nome › …" + ações alinhadas à direita) e `.pad` (máx. 1360 px).
- **Sair**: diálogo "Sair do sistema" / "Deseja realmente sair do sistema de Personal Trainer?" — botões **Ficar** / **Sair**.

**Padrões comuns das telas**: carregamento com *skeleton* (`aria-busy`), estado de erro em painel "Não deu para carregar os dados" / "Pode ser a internet ou a sessão que expirou. Nada foi perdido." + **Tentar de novo**; números com vírgula decimal (`formatNum`); Δ com sinal (`formatDelta`: "+1,4", "−0,5") colorido por `deltaClass`.

**Toast** (`toast.component.ts`): pilha no canto **inferior** direito, some em 4 s; cada aviso é um `.panel` com texto e botão **Fechar**. Tipos `success`/`info`/`warning`/`error` — visualmente só `error` muda (borda e texto em `--bad`). Sem ícones.

**Dialog** (`dialog.service.ts`/`dialog.component.ts`): modal único (`.panel`, título 15 px, corpo `.nt`, botões no rodapé) com `confirm()` (cancelar + confirmar; tom `danger`/`error` usa `.btnD`, o resto `.btnP`) e `alert()` (um botão). Clicar no fundo fecha só os `alert`.

### 3.1 Login — `/login`

| Item | Detalhe |
|---|---|
| Propósito | Autenticar o personal (Supabase Auth). |
| Layout | Tela dividida. **Esquerda** (formulário, fundo `--sf`): logo + "FocusPT", título **Entrar**, legenda "Avaliação física, evolução e relatório num só lugar."; rodapé "Esqueceu a senha? Fale com o administrador." e "Dados hospedados no Brasil · LGPD · Conhecer o FocusPT" (link para a landing `/`). **Direita** (palco sempre escuro, oculto ≤ 900 px): exemplo fictício "O que seu aluno vê depois de 105 dias." com uma pilha 3D (tabela comparativa, KPIs, fotos) que inclina com o mouse; respeita `prefers-reduced-motion`. |
| Campos | **E-mail** (obrigatório, e-mail válido; placeholder `exemplo@focuspt.com`); **Senha** (obrigatória, mín. 6; botão **Mostrar/Ocultar**). |
| Ações | **Entrar** (desabilitado se inválido/carregando; carregando: "Autenticando..."). |
| Estados | Erros de validação ("Insira um e-mail válido.", "A senha deve ter pelo menos 6 caracteres."); erro de login em `.tag.tagW` "E-mail ou senha inválidos.". Sucesso → `/`. |
| Dados | `supabase.auth.signInWithPassword`. |

### 3.2 Início — `/`

| Item | Detalhe |
|---|---|
| Propósito | Painel do dia. |
| Crumbs | "Início"; ações **Agendar** (→ `/agenda`) e **Novo aluno** (primário, → `/alunos/novo`). |
| Título | Data por extenso ("Quarta-feira, 8 de outubro", `dayTitle`) + legenda "{n} atendimentos · {n} pendências" (`countsLine`). |
| KPIs (4, `.kpi`) | **Alunos ativos** (`activeStudents` do RPC; sub "{n} avaliados nos últimos 90 dias"); **Avaliações registradas** (`totalAssessments`; sub "{n} esta semana" = alunos com última avaliação há < 7 dias); **Gordura visceral alta** ("nível Omron 10 ou mais", vermelho se > 0); **Termo LGPD pendente** ("assinatura ainda não colhida", vermelho se > 0). Os dois últimos vêm de `buildAttentionGroups`. |
| Agenda de hoje | Painel com link **Semana** → `/agenda`. Lista `GET agenda?from=hoje&to=hoje` (data **local** do navegador) classificada por `agendaRows` (`dashboard-utils.ts`): horário já passado = "concluído" (linha esmaecida), o primeiro ainda por vir = etiqueta "próximo · 48 min" / "próximo · 2 h 05" / "agora", os demais sem etiqueta. Nome do aluno é link para o perfil; alunos com visceral ≥ 10 ganham `tag` "visceral {n}". Vazio: "Nenhum atendimento hoje."; erro: "Não deu para carregar a agenda." + Tentar de novo. |
| Pedem atenção | Painel com contador de alunos distintos. Tabela com linhas de grupo (`.grp`): **Reavaliação vencida · mais de 90 dias** (ação **Avaliar** → `/alunos/:id/avaliacoes/nova`), **Termo LGPD pendente** (**Assinar** → `/alunos/:id/lgpd`), **Gordura visceral alta** (**Abrir** → `/alunos/:id`). Até 5 por grupo + **Ver todos (n)** / **Mostrar menos**. Vazio: "Nada pendente hoje.". Lógica em `attention-utils.ts` (dias por partes Y/M/D, "hoje" local). |
| Dados | `GET dashboard` → RPC `get_dashboard_stats()` (só `activeStudents` e `totalAssessments` são usados; `todayAgenda` **não** é mais lido); `GET alunos` (view `aluno_summary`); `GET agenda`. |
| Estados | Skeleton nos KPIs e painéis; erro da lista de alunos → painel "Não deu para carregar os dados" + **Tentar de novo**; se só o RPC falhar, o total de avaliações mostra "—". |

### 3.3 Lista de alunos — `/alunos`

| Item | Detalhe |
|---|---|
| Propósito | Listar, buscar, filtrar, excluir (lixeira) e restaurar alunos. |
| Crumbs | "Alunos"; ação **Novo aluno** (primário). |
| Linha de título | Título **Alunos**; busca (`type=search`, "Buscar por nome ou objetivo" — o filtro também casa telefone); controle segmentado **Todos · n / Reavaliação vencida · n / Visceral alto · n / LGPD pendente · n** (`students-filter.ts`: `filterStudents`, `countByFilter`); link **Lixeira (n)**. |
| Tabela (`.panel` rolável, mín. 900 px) | **Aluno** (nome como link + "F · 37" / "M · 45"), **Objetivo**, **Última avaliação** (dd/mm/aaaa + "5 dias" / "hoje" / "sem avaliação"; vermelho se vencida), **Peso**, **Gordura**, **Visceral** (vermelho se ≥ 10), **LGPD** (`tagOk` Assinado / `tagW` Pendente), ações **Abrir** e **Excluir**. |
| Lixeira | Painel "Lixeira" com nome, objetivo e **Restaurar**. Vazio: "Nenhum aluno na lixeira." |
| Excluir | Confirmação "Mover {nome} para a lixeira?" / "Avaliações e fotos vão junto. Dá para restaurar depois." → **Mover para a lixeira**. Erro: alerta "Erro ao excluir aluno. Tente novamente." |
| Dados | `GET alunos` (view `aluno_summary`) e `GET alunos?trash=1`; `DELETE`/`PATCH aluno-detail/:id`. |
| Estados | Skeleton; vazio: "Nenhum aluno cadastrado. Cadastrar o primeiro" ou "Nenhum aluno com esse filtro."; erro de carga: painel "Não deu para carregar os alunos" + **Tentar de novo**. |

### 3.4 Cadastrar / editar aluno — `/alunos/novo`, `/alunos/:id/editar`

Crumbs "Alunos › Novo aluno" ou "Alunos › {nome} › Editar"; título **Novo aluno** / **Editar aluno**; conteúdo estreito (`.pad.narrow`, 1000 px), três painéis em sequência.

**Painel "Dados pessoais"** (legenda "sexo, idade e altura entram nos cálculos")

| Campo | Tipo | Regra |
|---|---|---|
| Nome completo | texto | obrigatório, mín. 2 ("Informe o nome completo (mínimo 2 letras).") |
| Data de nascimento | data | obrigatório |
| Sexo biológico | segmentado Feminino / Masculino (rádios) | obrigatório (padrão Masculino) |
| Altura (cm) | número | obrigatório, 50–250 ("Altura entre 50 e 250 cm.") |
| Objetivo | texto | opcional ("Ex.: hipertrofia, redução de gordura") |
| WhatsApp | tel | opcional ("DDD + número") |

**Painel "Anamnese · PAR-Q"** (legenda "respostas "sim" ganham destaque no perfil e no relatório"; todos opcionais): tabela com três perguntas e segmentado **Sim / Não** — "Tem algum problema cardíaco diagnosticado?", "Sente dores nas articulações ou ossos?", "Sente dor no peito durante exercício?"; depois **Cirurgias recentes**, **Medicamentos contínuos**, **Observações** (textarea).

**Painel "Consentimento LGPD"**: `tag` **Assinado** / **Pendente** e texto "O aceite só é registrado pela assinatura do próprio aluno, feita no perfil depois de salvar." (ou "O aluno já assinou o termo. A assinatura fica em Documentos, no perfil.").

| Item | Detalhe |
|---|---|
| Ações | **Cancelar** (volta para lista ou perfil); **Salvar aluno** / **Salvar alterações** (primário; desabilitado se inválido; "Salvando…"). |
| Dados | Criar: `POST alunos`. Editar: `GET aluno-detail/:id` (prefill) + `PUT aluno-detail/:id`. |
| Estados | Sucesso: toast "Aluno cadastrado." / "Cadastro atualizado." e vai para o perfil. Erros inline: "Não foi possível cadastrar o aluno. Verifique a conexão.", "Não foi possível salvar as alterações. Verifique a conexão.", "Não deu para carregar os dados do aluno…". |

### 3.5 Perfil do aluno — `/alunos/:id`

| Seção | Conteúdo |
|---|---|
| Crumbs | "Alunos › {nome}"; ações **Editar**, **Relatório** (da última avaliação, se houver) e **Nova avaliação** (primário). |
| Cabeçalho | Nome (`.big`) + legenda "Feminino · 37 anos · 160 cm · {objetivo} · {telefone}" (idade hoje, `ageAt`); `tagOk` **LGPD assinado** ou link `tagW` **LGPD pendente · assinar** → `/alunos/:id/lgpd`; etiquetas `tagW` da anamnese ("Problema cardíaco", "Dor articular", "Dor no peito ao esforço", `anamnesisTags`). |
| Abas (`.tab`) | **Resumo**, **Avaliações {n}**, **Fotos {n}**, **Agenda**, **Documentos**. |
| Aba Resumo | 5 KPIs da última avaliação (**Peso**, **Gordura (bioimp.)**, **Músculo esquelético**, **Massa magra**, **Gordura visceral**) com Δ vs anterior e classe Omron em minúsculas ("−3,4 · normal"). Painel comparativo "{data} vs {data anterior}" + link **Relatório completo**: tabela **Parâmetro / Atual / Anterior / Δ / Faixa Omron** com grupos *Bioimpedância Omron HBF-514C* (peso, IMC, gordura, músculo, visceral, massa magra, massa gorda), *Perímetros · cm* (pescoço, ombros, tórax, cintura, abdômen, quadril, busto se houver, RCQ) e *Dobras cutâneas · mm* (somatório 7 dobras, % gordura por dobras); IMC, gordura, músculo, visceral e RCQ têm barra `.ref` (`refBar` em `profile-utils.ts`). Coluna lateral: **Avaliações** (últimas 5 + link **Nova**), **Fotos** (4 miniaturas da última sessão + **Comparar**/**Enviar** → galeria), **Anamnese** (Sim/Não por pergunta, medicamentos, cirurgias e observações se houver; link **Editar**), **Próximos atendimentos** (até 3 dos próximos 60 dias; link **Agenda**). Sem avaliação: "Nenhuma medida ainda" / "A primeira avaliação vira a linha de base da evolução." + **Registrar primeira avaliação**. |
| Aba Avaliações | Tabela **Data / Peso / IMC / Gordura / Músculo / Visceral / Dobras** (mais recente primeiro) com **Relatório · Editar · Excluir**. Rodapé: **Lixeira (n) · mostrar/ocultar** com linhas "dd/mm/aaaa · peso · % gordura" + **Restaurar**, ou "Lixeira: nenhuma avaliação excluída.". |
| Aba Fotos | "{n} fotos em {s} sessões" + link **Abrir galeria**; sessões por data (`groupPhotoSessions`) com "dd/mm/aaaa · n fotos · avaliação dd/mm" (avaliação mais próxima, `nearestDate`) e miniaturas por ângulo. Vazio: "Nenhuma foto ainda" + **Enviar foto**. |
| Aba Agenda | Atendimentos do aluno nos próximos 60 dias (`GET agenda?from=hoje&to=hoje+60`, filtrados por `aluno_id`) com link **Editar** → `/agenda`. Vazio: "Nenhum atendimento marcado" + **Abrir agenda**. |
| Aba Documentos | Linha "Termo de consentimento LGPD · v1.0" — "assinado pelo aluno" / "pendente de assinatura" + **Ver assinatura** / **Assinar** → `/alunos/:id/lgpd`. |
| Dados | `GET aluno-detail/:id`; `GET agenda`; `DELETE`/`PATCH avaliacao-detail/:id`. |
| Estados | Skeleton; erro: "Não deu para carregar os dados" + **Tentar de novo** / **Voltar aos alunos**; exclusão: "Mover avaliação para a lixeira?" / "Ela sai do histórico e dos relatórios. Dá para restaurar depois." → **Mover para a lixeira**. |

### 3.6 Nova / editar avaliação — `/alunos/:id/avaliacoes/nova`, `.../:id_aval/editar`

**Desktop (≥ 720 px)**: crumbs "Alunos › {nome} › Nova avaliação / Editar avaliação"; barra de etapas (`.navItem.step`, navegação livre, "✓" quando a etapa está válida): **1 Balança Omron** (6 campos + água calculada) · **2 Perímetros** (13 campos) · **3 Dobras** (7 + 2 opcionais) · **4 Revisão** ({n} avisos). Título "Nova avaliação · {nome}" + "Feminino · {idade na data} anos na data · {altura} cm" + campo **Data da medição** (obrigatório, padrão hoje; a idade recalcula ao mudar).
Todos os campos numéricos são `type="text" inputmode="decimal"` e aceitam **vírgula ou ponto** (`parseDecimal`); cada um mostra "Anterior: {valor}" da avaliação anterior.

**Etapa 1 — Balança Omron HBF-514C** ("transcreva o visor")

| Campo | Regra (front) |
|---|---|
| Peso (kg) | obrigatório, ≥ 1 |
| Gordura corporal (%) | obrigatório, 0,1–80 |
| Músculo esquelético (%) | obrigatório, 0,1–80 |
| Metabolismo basal (kcal) | obrigatório, ≥ 1 |
| Idade corporal (anos) | obrigatório, 10–100 |
| Gordura visceral (nível) | obrigatório, 1–30 |
| Água corporal (%) | **não é digitada**: bloco somente leitura "calculada" = `(100 − gordura%) × 0,732` (hidratação da massa magra; a HBF-514C não mostra água). Gravada pela Edge Function (`calcWaterPercentage`), espelhada em `assessment-calc.ts` para a prévia. |

**Seta de comparação ao digitar:** todo campo numérico com "Anterior" (balança, tronco, tabela de membros no desktop, dobras e o modo Medir no celular) mostra, assim que tem valor válido e existe avaliação anterior, `↑` (maior), `↓` (menor) ou `=` (igual) seguido do Δ (`+1,4`). A comparação usa o mesmo arredondamento do campo (0 casas em kcal/anos/nível, 1 casa no resto; `trend`/`trendSymbol` em `assessment-utils.ts`). A cor continua sendo favorável/desfavorável (`deltaClass`): a seta diz a direção, a cor diz se é bom. `aria-label` descreve ("maior que a avaliação anterior").
| Modo atleta ligado na balança | checkbox |

Não há mais campo de "IMC da balança" — o IMC é calculado. Só para **FEMALE**: painel **Saúde feminina** ("opcional, desta avaliação"): **Última menstruação** (data) e **Ciclo** (Não informado / Regular / Irregular).

**Etapa 2 — Perímetros**: painel **Tronco · cm** ("fita na pele, sem comprimir"): Pescoço, Ombros, Tórax, Cintura, Abdômen, Quadril (obrigatórios, > 0) e **Busto** (opcional, exibido para todos). Painel **Membros · cm** ("preencha ao menos um lado completo"): tabela **Medida / Direito / Esquerdo / Simetria** para Braço relaxado, Braço contraído, Antebraço (opc.), Coxa proximal, Coxa medial (opc.), Coxa distal (opc.), Panturrilha; a coluna Simetria mostra ao vivo "simétrico" (≤ 0,5 cm, verde), "D +1,0" (neutro) ou "E +2,0 · confira" (> 1,5 cm, vermelho) — `symmetry()`.

**Regra do lado predominante**: se um lado tem qualquer valor entre Braço relaxado/contraído, Coxa proximal e Panturrilha, esses 4 ficam obrigatórios nesse lado; se nenhum lado foi preenchido, exige o direito. Lado não medido vai como `undefined` (NULL), nunca 0.

**Etapa 3 — Dobras · Jackson & Pollock 7 · mm** ("lado direito · valores abaixo de 6 viram mm"): 1 · Tríceps, 2 · Subescapular, 3 · Peitoral, 4 · Axilar média, 5 · Supra-ilíaca, 6 · Abdominal, 7 · Coxa (obrigatórias, > 0). Painel **Fora do cálculo** (opcionais): Bíceps, Panturrilha. Ao sair de um campo, valores entre 0 e 6 são convertidos de cm para mm (×10) com toast "Tríceps 1,6 virou 16 mm (parecia estar em cm).".

**Etapa 4 — Revisão** (prévia **no navegador**, `assessment-calc.ts`; os valores gravados são os do servidor): 4 KPIs — **IMC** (+ classe OMS), **Gordura (bioimp.)** (+ classe Omron e Δ vs anterior), **Somatório 7 dobras** (+ "% por dobras" por JP7/Siri ou "faltam dobras"), **RCQ** ("cintura ÷ quadril · classe"); abaixo, linha "Água corporal (calculada) {valor} % {seta} {Δ} (100 − gordura) × 0,732". Avisos em painel vermelho: água corporal com variação > 15 pontos ("Água corporal caiu de 55,0 % para 35,0 %." / "Variação improvável em 30 dias. Confira o visor antes de salvar.") e assimetria > 1,5 cm por membro. Sem avisos: "Nenhum aviso. Confira os números e salve.".

**Celular (≤ 719 px) — modo "Medir"**: tela cheia, sem crumbs: cabeçalho "{primeiro nome} · {etapa}" + "{i}/{total}" e link **Fechar**; barra de progresso por etapa; **um campo por vez** com rótulo grande, dica de medição ("Menor circunferência entre costela e crista ilíaca."), input de 56 px com teclado numérico e unidade; caixa "Anterior em dd/mm" com valor e Δ colorido; botões **Voltar** e **Próxima** (vira o nome da próxima etapa na troca, e **Revisar** no último campo). A revisão mostra Data da medição, a prévia, o checkbox de atleta e, para alunas, Saúde feminina; botão **Salvar avaliação**.

| Item | Detalhe |
|---|---|
| Ações (desktop) | **Voltar**, **Cancelar** (volta ao perfil), **Próximo** / **Revisar** (etapa 3) / **Salvar avaliação** (etapa 4, primário; "Salvando…"). |
| Modal de validação | Se o form é inválido ao salvar: "{n} campo(s) precisa(m) de atenção" — lista editável (rótulo, etapa, dica de faixa, input); botões **Voltar ao formulário** e **Salvar avaliação**. |
| Dados | `GET aluno-detail/:id` (aluno + avaliações para "Anterior" e prefill); `POST avaliacoes` ou `PUT avaliacoes`. |
| Estados | Sucesso: toast "Avaliação salva." / "Avaliação atualizada." → **relatório da avaliação salva** (`/alunos/:id/avaliacoes/:id_aval`). Erro: toast com a mensagem do servidor ou "Não foi possível salvar. Verifique a conexão."; edição de id inexistente: toast "Avaliação não encontrada para edição."; falha ao carregar: painel "Não deu para carregar os dados" + **Tentar de novo** / **Entrar de novo**. |

### 3.7 Relatório da avaliação — `/alunos/:id/avaliacoes/:id_aval`

| Seção | Conteúdo |
|---|---|
| Crumbs | "Alunos › {nome} › dd/mm/aaaa"; ações **WhatsApp**, **Editar**, **Exportar PDF** (primário; "Gerando…"). |
| Título | "Avaliação de dd/mm/aaaa" + "comparada com dd/mm/aaaa · {n} dias · idade na data: {x}" (ou "primeira avaliação · idade na data: {x}"). |
| KPIs (5) | **Peso** (kg, Δ neutro), **Gordura (bioimp.)** (% + Δ + classificação gravada em minúsculas), **Músculo esquelético** (% + Δ + classe Omron), **Massa magra** (kg + Δ), **Gordura visceral** (nível + Δ + Normal/Alto/Muito Alto). Sem anterior: "sem comparação". |
| Bioimpedância | Painel "faixas Omron para {mulher, 20 a 39 anos}" (`omronAgeBandLabel`). Tabela **Parâmetro / Atual / Anterior / Δ / Faixa Omron**: Peso, IMC, Gordura corporal, Músculo esquelético, Gordura visceral, Massa magra, Massa gorda, Metabolismo basal, Idade corporal, Água corporal. IMC, gordura, músculo e visceral têm barra `.ref` (`omronBand` em `omron-bands.ts`, com `title` = classificação). Água com variação > 15 pontos ganha `tag` "conferir leitura". |
| Perímetros | "cm · D / E quando medidos dos dois lados": Pescoço, Ombros, Tórax, Cintura, Abdômen, Quadril, Busto (se houver), **RCQ** (barra Omron), e para cada membro medido uma linha "Braço relaxado D / E" com "34,0 / 33,5" e Δ por lado. Linhas de membros não medidos são omitidas. |
| Dobras cutâneas | "Jackson & Pollock 7 · mm · bíceps e panturrilha fora do cálculo": as 7 dobras, Somatório 7 dobras, % gordura por dobras; Bíceps/Panturrilha aparecem com nota "fora do cálculo" só se preenchidas. |
| Saúde feminina | Só para FEMALE com algum dado: Última menstruação, Ciclo (Regular / Irregular / Não informado). |
| Observações | Textarea ("saem no PDF") + **Salvar observações** ("Salvando…") e confirmação "Salvo às HH:MM". |
| Dados | `GET aluno-detail/:id` (a avaliação anterior = próxima da lista decrescente); `PATCH avaliacoes` (observações). Fotos: `fetch` das URLs assinadas para embutir no PDF. |
| Estados | Skeleton; avaliação inexistente ou falha → painel "Não deu para carregar os dados" + **Tentar de novo** / **Entrar de novo**. Alertas: "Aguarde" (dados incompletos), "Erro ao gerar PDF", "Erro ao salvar". |

WhatsApp: abre `https://api.whatsapp.com/send?phone={dígitos}&text=` com
"Olá {nome}, sua nova avaliação está pronta! Resumo: Peso: {x}kg, Gordura: {y}%. Veja mais detalhes na nossa plataforma.".

Não existem mais o radar de perímetros, as barras de adipometria nem a tabela de simetria separada — tudo virou tabela comparativa.

### 3.8 Galeria de evolução — `/alunos/:id/galeria`

| Seção | Conteúdo |
|---|---|
| Crumbs / título | "Alunos › {nome} › Fotos"; **Fotos de evolução** + "{n} fotos em {s} sessões · cada sessão fica ligada à avaliação mais próxima". |
| Comparar (painel esquerdo) | Título "Comparar dd/mm e dd/mm" (ou "Foto de dd/mm"); controle segmentado com os **ângulos que têm foto**. Duas fotos sobrepostas 3:4 com **slider** (`input type=range`, "Arraste para comparar"; a recente é recortada por `clip-path`), barra divisória e etiquetas "dd/mm · início" / "dd/mm · recente"; legenda "Peso 49,3 → 49,2 kg · Gordura 27,1 → 23,7 %" entre as avaliações mais próximas de cada foto. Par escolhido por `selectComparePair` (`media-utils.ts`), a **mesma regra do PDF** (`pdfSelectPhotos`), com fallback para a foto mais antiga do ângulo. Só uma foto: "Só uma foto deste ângulo. A próxima sessão libera a comparação."; nenhuma: "Nenhuma foto ainda". |
| Enviar foto | **Ângulo** (Frente / Lado direito / Lado esquerdo / Costas), **Data da foto** (padrão hoje), zona "Arraste a foto ou clique para escolher · JPG, PNG, WEBP"; prévia 96 px com "{ângulo} · dd/mm/aaaa" + **Remover**; botão **Salvar na galeria** (primário, desabilitado sem prévia; "Salvando…"). |
| Sessões | Tabela por data: "n fotos · avaliação dd/mm" + **Ver**/**Fechar** → miniaturas com ângulo e **Remover**. Vazio: "Nenhuma sessão ainda." |
| Processamento | A imagem é redimensionada (máx. 1600 px), achatada em fundo branco e convertida para **JPEG 90%** no navegador. Erros: "O arquivo selecionado não é uma imagem.", "Este formato não é suportado pelo navegador (ex.: HEIC/TIFF). Converta para JPG ou PNG.", "Falha ao ler o arquivo.". |
| Dados | `GET aluno-detail/:id`; `POST fotos`; `DELETE fotos/:id` (confirmação "Remover esta foto?" / "Ela sai da galeria e dos relatórios. Não dá para desfazer." → **Remover**). |
| Estados | Skeleton; erro: "Não deu para carregar as fotos" + **Tentar de novo**; sucesso: toast "Foto salva na galeria."; erros: "Não foi possível salvar a foto. Verifique a conexão." / "Não foi possível remover a foto. Tente de novo.". |

### 3.9 Consentimento LGPD — `/alunos/:id/lgpd`

| Item | Detalhe |
|---|---|
| Crumbs / título | "Alunos › {nome} › LGPD"; **Consentimento LGPD · {nome}** + "termo v1.0 · Lei 13.709/2018"; conteúdo estreito (1000 px). |
| Já assinado | Painel "Termo já assinado" (`tagOk` LGPD assinado), "Assinado em dd/mm/aaaa hh:mm · termo v1.0. Para revogar ou corrigir, fale com o personal.", imagem da assinatura, botão **Voltar ao perfil**. |
| Não assinado | Instrução "Entregue o aparelho ao aluno. Ele lê o termo e assina com o dedo ou o mouse."; painel com o termo (rolável, "role até o fim"); painel **Assinatura** com botão **Limpar**, papel **sempre branco** com linha de base ("Assine sobre a linha"), canvas 700×200 (tinta `#1A1B1E`); **checkbox obrigatório** "Li o termo e concordo com o tratamento dos meus dados para as finalidades descritas."; botões **Agora não** e **Confirmar assinatura** (primário; desabilitado até assinar **e** marcar; "Registrando…"). |
| Dados | Nome: leitura direta `alunos.select('name')` (supabase-js). `GET lgpd-sign/:id`; `POST lgpd-sign`. |
| Estados | "Marque a caixa de concordância para confirmar.", "A assinatura está em branco. Assine sobre a linha.", "Sessão expirada. Entre de novo."; erro do servidor exibido inline. Sucesso → perfil (sem toast). |

### 3.10 Agenda — `/agenda`

| Item | Detalhe |
|---|---|
| Propósito | Agendar e gerenciar os atendimentos da semana. |
| Crumbs / título | "Agenda"; ação **Agendar** (primário, rola até o formulário). Título **Agenda** + "{05/10 – 11/10/2026}" + segmentado **‹ Anterior / Hoje / Próxima ›** (Hoje fica `.on` na semana atual). |
| Semana | Grade de 7 painéis (segunda a domingo; padrão = semana de hoje), cabeçalho com o dia da semana e o número do dia (`tag` no dia de hoje). Itens em `.row` por horário: horário, nome do aluno (link para o perfil), foco, **Editar** / **Excluir**; itens já passados ficam esmaecidos. Dia vazio: "Livre". |
| Formulário (painel fixo abaixo da semana) | "Novo atendimento" (legenda "{n} alunos") / "Editar atendimento" (+ **Cancelar**): **Aluno** (select, obrigatório — "Selecione um aluno."), **Data** (obrigatória, padrão hoje), **Hora** (obrigatória), **Foco** (máx. 500). Botão **Agendar** / **Salvar** ("Salvando..."). Após salvar, a tela vai para a semana da data salva. |
| Excluir | Confirmação "Excluir atendimento" / "Remover o atendimento de {aluno} em dd/mm/aaaa às HH:MM?" → **Excluir**. |
| Dados | `GET agenda?from=<segunda>&to=<domingo>`, `POST agenda`, `PUT agenda/:id`, `DELETE agenda/:id` (contrato em §6). Contrato isolado em `AGENDA_API` / `normalizeAgendaItem` (`agenda-utils.ts`); chamadas em `DataService` (`getAgenda`, `createAgendaItem`, `updateAgendaItem`, `deleteAgendaItem`). Alunos: `GET alunos`. |
| Estados | Skeleton da semana; erro: "Não deu para carregar a agenda" + **Tentar de novo**; toasts "Atendimento agendado.", "Atendimento atualizado.", "Atendimento excluído.", "Erro ao salvar atendimento: {msg}", "Erro ao carregar a lista de alunos."; alerta "Erro ao excluir atendimento. Tente novamente.". |

---

## 4. Fluxos principais

| Fluxo | Passos |
|---|---|
| **Entrada pelo site** | `https://<domínio>/` (landing estática) → **Entrar** → `/app/login`. Links antigos sem `/app` (`/login`, `/alunos/...`, `/agenda`) são redirecionados pelo Vercel (308). |
| **Login** | `/app/login` → `signInWithPassword` → sessão salva no `localStorage` (`sb-qhdkacasbbfilqqywosj-auth-token`) → `/app/`. Logout: **Conta › Sair** → diálogo → `signOut()` → `/login`. Sessão expirada → `onAuthStateChange` redireciona. |
| **Tema** | **Conta › Tema** → `ThemeService.set('claro'|'escuro'|'auto')` → `localStorage['fpt-theme']` + `data-theme` em `<html>`. Padrão `auto` (segue o aparelho). |
| **Cadastrar aluno + anamnese** | `/alunos/novo` → `POST alunos` (insere `alunos` com `lgpd_consent_status='PENDING'` e, se enviada, `anamneses`) → toast → `/alunos/:id`. |
| **Editar aluno** | `/alunos/:id/editar` → prefill via `aluno-detail` → `PUT aluno-detail/:id` (campos permitidos + upsert manual da anamnese). |
| **Nova avaliação** | Perfil → **Nova avaliação** → etapas 1–3 (ou modo Medir no celular) → **Revisar** (prévia local) → **Salvar avaliação** → validação (modal) → `POST avaliacoes` → função valida JP7, busca aluno, calcula derivados, chama RPC `save_avaliacao` (insere `avaliacoes` + `bioimpedancias` + `dobras_cutaneas` + `circunferencias` numa transação) → toast → **relatório** da avaliação. |
| **Editar avaliação** | Relatório ou aba Avaliações → **Editar** → `PUT avaliacoes` (recalcula tudo com a data efetiva) → `save_avaliacao(p_avaliacao_id)` atualiza as 4 tabelas → relatório. |
| **Lixeira / restaurar** | Aluno: `DELETE aluno-detail/:id` grava `alunos.deleted_at`; some da view `aluno_summary`, do Início e do `aluno-detail`; `PATCH` restaura (lista › Lixeira). Avaliação: `DELETE avaliacao-detail/:id` grava `avaliacoes.deleted_at`; aparece na "Lixeira" da aba Avaliações; `PATCH` restaura. Não há exclusão definitiva pela UI. |
| **Fotos** | Galeria → ângulo/data/arquivo → conversão JPEG no navegador → `POST fotos` (base64) → função confere posse, sobe em `fotos-alunos/<uid>/<aluno>/<data>_<cat>_<ts>.jpg` com service role e grava `fotos`. Leitura: `aluno-detail` gera URL assinada (1 h) por foto. Comparação início × recente no slider (mesma regra do PDF). Exclusão: **definitiva** (remove objeto e linha). |
| **LGPD** | Perfil (etiqueta "LGPD pendente · assinar" ou aba Documentos) → aluno lê o termo, assina no canvas e marca "Li o termo e concordo" → `POST lgpd-sign` (PNG base64) → upload em `lgpd-assinaturas`, URL assinada de 10 anos, upsert em `lgpd_assinaturas` (1 por aluno) e `alunos.lgpd_consent_status='ACCEPTED'` → perfil. |
| **Exportar PDF** | Relatório → **Exportar PDF** → baixa cada foto (URL assinada) como dataURL → `generateAssessmentPDF()` → `Avaliacao_Fisica_{Nome}_{AAAA-MM-DD}.pdf`. Tudo no navegador. |
| **Agenda** | `/agenda` (menu **Agenda**, **Agendar** no Início ou **Semana** na agenda de hoje) → semana atual via `GET agenda?from&to` → formulário aluno/data/hora/foco → `POST agenda` → recarrega a semana. Editar: **Editar** → `PUT agenda/:id`. Excluir: **Excluir** → confirmação → `DELETE agenda/:id`. A "Agenda de hoje" do Início usa `GET agenda?from=hoje&to=hoje` com a data **local** do navegador. |
| **Pedem atenção** | Início → `GET alunos` → `buildAttentionGroups(alunos, hoje)` → cada linha leva à ação: Avaliar, Assinar ou Abrir. A lista de alunos oferece os mesmos critérios como filtros. |

---

## 5. Modelo de dados

### 5.1 Tabelas (schema `public`)

| Tabela | Colunas principais | Restrições |
|---|---|---|
| `personal_trainers` | `id` (= `auth.users.id`), `name`, `email`, `plan` (`free`/`pro`), `created_at`, `updated_at` | `email` UNIQUE; FK `auth.users` ON DELETE CASCADE |
| `alunos` | `id`, `personal_trainer_id`, `name`, `birth_date`, `gender`, `height_cm`, `goal?`, `phone_number?`, `lgpd_consent_status`, `created_at`, `updated_at`, `deleted_at?` | `gender ∈ {MALE,FEMALE}`; `height_cm` 50–250; `length(trim(name)) ≥ 2`; `lgpd_consent_status ∈ {PENDING,ACCEPTED}` (padrão PENDING) |
| `anamneses` | `aluno_id` (UNIQUE), `cardiac_condition`, `joint_pain`, `chest_pain_during_exercise` (bool, padrão false), `recent_surgery_description`, `active_medications`, `notes` (texto, padrão '') | FK `alunos` CASCADE |
| `avaliacoes` | `aluno_id`, `date`, `bmi`, `bmi_classification`, `body_fat_percentage`, `fat_mass_kg`, `lean_mass_kg`, `body_fat_classification`, `visceral_risk`, `skinfolds_fat_percentage`, `skinfolds_sum_mm`, `rcq`, `observacoes?`, `last_menstruation_date?`, `menstrual_cycle_regular?`, `deleted_at?` | `visceral_risk ∈ {NORMAL,HIGH,VERY_HIGH}`; índice parcial `deleted_at IS NULL` |
| `bioimpedancias` | `avaliacao_id` (UNIQUE), `perfil_bioimpedancia?`, `is_athlete`, `weight_kg`, `bmi`, `body_fat_percentage`, `skeletal_muscle_percentage`, `resting_metabolism_kcal`, `body_age`, `visceral_fat_level`, `water_percentage?` (calculado: hidratação da massa magra), `fat_mass_kg`, `lean_mass_kg` | `weight_kg > 0`; % gordura e % músculo 0–80; `resting_metabolism_kcal > 0`; `body_age` 10–100; `visceral_fat_level` 1–30; `water_percentage` 0–100; `perfil_bioimpedancia` 1–4 |
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

Consequência importante: com sessão inválida as consultas **não falham**, retornam listas vazias (HTTP 200) — ver §9.5.

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

Fonte da verdade em `supabase/functions/_shared/calculations.ts` (usada pela função `avaliacoes`). Os valores derivados são **gravados** no banco na criação/edição. O front tem um **espelho** em `src/app/assessment-calc.ts`, usado só para a prévia da etapa Revisão e para as classificações exibidas no relatório/perfil (`omron-bands.ts`, `profile-utils.ts`); qualquer mudança nas fórmulas precisa ser replicada lá (teste `assessment-calc.spec.ts` compara os dois).

| Indicador | Fórmula / tabela | Observações |
|---|---|---|
| Idade | anos completos na **data da avaliação** (`calcAge(birth, date)`, sem conversão UTC) | Antes usava a idade no dia do salvamento; migration `20261007005236` recalculou o histórico. O PDF usa a mesma regra; perfil/lista mostram idade de hoje. |
| IMC | `peso / (altura_m)²`, 2 casas | Sempre recalculado; o "IMC Balança" digitado é ignorado. Classes OMS: < 18,5 Abaixo do peso; < 25 Peso normal; < 30 Sobrepeso; < 35 Obesidade Grau I; < 40 Grau II; ≥ 40 Grau III. |
| Massa gorda / magra | `peso × %gordura(bioimp.) / 100`; magra = peso − gorda | 2 casas. Usa o % da **balança**, não o das dobras. |
| Classificação % gordura (bioimp.) | Tabela Omron HBF-514C (Gallagher et al., 2000), limites [Normal, Alto, Muito Alto]: | Abaixo do 1º limite = **Baixo**. < 20 anos usa a faixa 20–39. Fonte: manual Omron HBF-514C (omronbrasil.com, PDF `balanca_HBF-514C-LA_ES_-PT_im-2.pdf`). |
| | Homem 20–39: 8 / 20 / 25 · 40–59: 11 / 22 / 28 · 60+: 13 / 25 / 30 | |
| | Mulher 20–39: 21 / 33 / 39 · 40–59: 23 / 34 / 40 · 60+: 24 / 36 / 42 | |
| Classificação % músculo esquelético | Omron: H 18–39: 33,3/39,4/44,1 · 40–59: 33,1/39,2/43,9 · 60+: 32,9/39,0/43,7; M 18–39: 24,3/30,4/35,4 · 40–59: 24,1/30,2/35,2 · 60+: 23,9/30,0/35,0 | **Não gravada** no banco; exibida na tela (KPI e barra de faixa no perfil e no relatório) a partir do espelho no front. |
| Gordura visceral | 1–9 `NORMAL`, 10–14 `HIGH`, 15–30 `VERY_HIGH` (escala Omron) | Rótulos na UI: Normal / Alto / Muito Alto. Dashboard conta ≥ 10. |
| Somatório de dobras | **7 dobras JP7**: peitoral + axilar média + tríceps + subescapular + abdominal + supra-ilíaca + coxa | Bíceps e panturrilha são opcionais e **não entram** (migration `20261007004326` corrigiu somas antigas de 9 dobras). |
| Densidade (Jackson & Pollock 7) | H: `1,112 − 0,00043499·S + 0,00000055·S² − 0,00028826·idade`; M: `1,097 − 0,00046971·S + 0,00000056·S² − 0,00012828·idade` | Jackson & Pollock (1978, homens) e Jackson, Pollock & Ward (1980, mulheres). |
| % gordura (dobras) | Siri: `(495 / D) − 450`, 2 casas | Gravado em `avaliacoes.skinfolds_fat_percentage` e `dobras_cutaneas.fat_percentage`. |
| RCQ | `cintura / quadril`, 4 casas | Classificação (`classifyRcq`: H 0,83/0,88/0,95; M 0,71/0,77/0,82 → Baixo/Moderado/Alto/Muito Alto) **não é gravada**; aparece na prévia da Revisão e na barra de faixa do relatório/perfil. |
| Simetria D/E (form) | `|D − E|`: ≤ 0,5 "simétrico" (verde), ≤ 1,5 "D +x" (neutro), > 1,5 "· confira" (vermelho) | `symmetry()` em `assessment-utils.ts`; coluna Simetria da etapa Perímetros e aviso na Revisão. O relatório mostra "D / E" lado a lado, sem julgar. |
| Água corporal (form/relatório) | variação > 15 pontos vs anterior → aviso "conferir leitura" | `implausibleWaterChange`, `WATER_CHANGE_LIMIT = 15`. Só alerta, não bloqueia. Como a água é derivada da gordura, o aviso equivale a uma variação de gordura acima de ~20 pontos (ou a avaliações antigas com água digitada). |
| Água corporal (cálculo) | `(100 − gordura%) × 0,732`, 1 casa | `calcWaterPercentage` em `_shared/calculations.ts` (fonte da verdade) e `assessment-calc.ts` (espelho). O cliente não envia `water_percentage`; a Edge Function ignora qualquer valor recebido. |
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
| `npm run dev` | `ng serve` na porta 3000 (host 0.0.0.0). `npm start` = `ng serve` padrão (4200). Em dev o app abre em `http://localhost:<porta>/app/` (baseHref). |
| `npm run build` | `ng build` (produção) → `dist/site/app/` + `node scripts/build-site.mjs` (landing e ativos → `dist/site/`). Budgets: inicial 2 MB aviso / 3 MB erro. |
| `npm run test:unit` | **Vitest** (`vitest.config.ts`, ambiente node, `src/tests/**/*.spec.ts`). Em 08/10/2026: **15 arquivos, 322 testes** passando — `agenda-utils`, `assessment-calc` (compara com `_shared/calculations.ts`), `assessment-utils`, `attention-utils`, `calculations`, `dashboard-utils`, `lgpd-utils`, `media-utils`, `omron-bands`, `pdf-layout`, `pdf-report`, `profile-utils`, `students-filter`, `theme`, `validation`. |
| `npm run test:unit:watch` / `test:unit:coverage` | Modo watch / cobertura (cobertura medida em `supabase/functions/_shared`). |
| `npm run e2e` | **Playwright** (`playwright.config.ts`, ver §9.3). Exige um build em `dist/site` (`npm run e2e:build` faz build + testes). `npm run e2e:report` abre o relatório HTML. |
| `npm test` | `ng test` (builder `@angular/build:unit-test`) — só `src/app/app.spec.ts`. |
| `npm run lint` | angular-eslint. |
| `deno test supabase/functions/_tests/` | Testes Deno das fórmulas (`calculations.test.ts`), requer Deno instalado. |

### 9.2 Build e deploy do frontend

Push na `main` → Vercel (`alexandre-site`) roda `npm run build` e publica `dist/site`: landing na raiz, app em `/app/*` com rewrite para `/app/index.html`, redirects 308 das rotas antigas. Ativos da raiz (`favicon.*`, `og.png`, `logo*.svg`) vêm de `public/` via `scripts/build-site.mjs`; o Angular também copia `public/` para dentro de `dist/site/app/`.

### 9.3 Testes E2E (Playwright)

| Item | Detalhe |
|---|---|
| Credenciais | `.env.e2e` na raiz (ignorado pelo git) com `E2E_EMAIL` / `E2E_PASSWORD` de uma **conta QA isolada** no Supabase — a suíte cria e apaga dados reais nessa conta. Opcional: `E2E_BASE_URL` (padrão `http://localhost:4173`). |
| Servidor | `scripts/serve-site.mjs [porta]` serve `dist/site` imitando o Vercel: `/` → landing, `/app/*` sem extensão → `app/index.html`, demais caminhos → arquivo ou 404. O `webServer` do Playwright o sobe sozinho (ou reutiliza um já em execução). |
| Config | `fullyParallel: false`, `workers: 1`, `retries: 0` (os fluxos dependem da ordem); `timeout` 90 s; `locale pt-BR`, fuso `America/Sao_Paulo`; trace e screenshot só em falha; saída em `e2e/test-output/` (ignorada). |
| Projetos | `public` (`e2e/public.spec.ts`: landing com SEO básico e redirecionamento sem sessão); `setup` (`e2e/auth.setup.ts`: purga dados QA via API, login pela UI em `/app/login`, grava `storageState`); `desktop` (`e2e/flows/*.spec.ts`, em ordem alfabética); `mobile` (`e2e/mobile/responsive.spec.ts`, 390×844, toque). |
| Fluxos (`e2e/flows/`) | `01-students` (cadastro com anamnese, edição, persistência do tema Escuro/Claro/Auto), `02-attention` ("Pedem atenção" lista o aluno com LGPD pendente), `03-assessment` (conversão cm→mm, avaliação com entradas conhecidas → relatório com IMC 19,2 · Σ7 148 · RCQ 0,72 · Normal, edição, segunda avaliação comparada), `04-report` (Exportar PDF > 20 KB, salvar observações), `05-gallery` (envio e remoção de foto), `06-agenda` (criar/editar/excluir), `07-lgpd` (assinatura no canvas), `08-trash` (mover, listar e restaurar), `09-a11y` (axe em início, alunos, perfil e relatório). |
| Helpers (`e2e/helpers/`) | `env.ts` (credenciais, `QA_PREFIX = 'QA Teste E2E'`, dados conhecidos do aluno e da avaliação 1), `api.ts` (login direto no Supabase, `ensureQaStudent`, `purgeQaData`), `state.ts` (ids compartilhados entre specs em `test-output/state.json`), `ui.ts`, `image.ts`. |
| Limpeza | `e2e/global-teardown.ts` roda sempre: apaga fotos e agenda, move alunos QA para a lixeira e lista em `e2e/test-output/qa-leftovers.json` os que precisam de purga por SQL (a API só faz soft delete). |

### 9.4 Deploy das Edge Functions
Manual. Ao usar o MCP `deploy_edge_function`, replicar o layout do repositório:
- entrypoint em **subpasta** (`avaliacoes/index.ts`, não `index.ts`) para os imports `../_shared/*.ts` resolverem;
- incluir os arquivos `_shared/*` importados (`cors.ts`, `supabase.ts`, `calculations.ts`);
- funções com import map (`aluno-detail`, `avaliacoes`) precisam do `deno.json` no payload + `import_map_path`.

Depois de alterar `_shared/calculations.ts`, **redeployar `avaliacoes`** e replicar a mudança em `src/app/assessment-calc.ts` (o teste `assessment-calc.spec.ts` compara os dois). Mudanças de enums (ex.: `fotos.category`) exigem alterar **o CHECK no banco e a validação na função**.

### 9.5 Armadilhas conhecidas

| Sintoma | Causa / ação |
|---|---|
| "O código está certo mas o erro continua" | Função implantada desatualizada. Conferir com `get_edge_function` e redeployar. |
| Telas vazias, "sumiram os alunos" | Sessão expirada/revogada: RLS devolve lista vazia com 200. Os dados estão intactos; refazer login. O `App` já redireciona em `SIGNED_OUT`. |
| 404 ao abrir `/app/alunos/...` num servidor estático | Falta o rewrite para `/app/index.html`. Em produção é o `vercel.json`; local, usar `scripts/serve-site.mjs`. |
| Link antigo (`/alunos/...`) | Redirect 308 do Vercel para `/app/...`; em dev não há redirect. |
| Item "apagado" ainda no banco | Soft delete (`deleted_at`). Restaurar pela Lixeira. Fotos são exceção (exclusão definitiva). |
| Sem backup | Plano free do Supabase não tem backups/PITR. Não rodar `DELETE` físico em produção; considerar dump periódico (`pg_dump`). |
| Prévia da Revisão ≠ valor gravado | A prévia usa `assessment-calc.ts`; o banco usa `_shared/calculations.ts`. Se divergirem, o espelho ficou desatualizado — o teste `assessment-calc.spec.ts` deve acusar. |
| Mudança feita pelo dashboard | Vira "drift": um banco novo não terá o objeto. Toda alteração de schema/Storage deve virar migration em `supabase/migrations`. |
| E2E falhando por resíduos | Rodadas interrompidas deixam alunos QA na lixeira; purgar por SQL os ids listados em `qa-leftovers.json`. |

### 9.6 Recriar o banco do zero

`supabase/migrations` contém o histórico completo de produção (mesmas versões de `supabase_migrations.schema_migrations`, com o SQL exato aplicado) + `20261008014409_sync_drift.sql`, que cria o que havia sido feito pelo dashboard: buckets `fotos-alunos` (privado, 5 MB, jpeg/png/webp) e `lgpd-assinaturas` (privado, 2 MB, png) e 4 policies de `storage.objects`. Os buckets **vêm das migrations** — não é preciso criá-los à mão.

1. Criar um projeto novo no Supabase (dashboard) e anotar o *project ref* e a senha do banco.
2. Na raiz do repo: `supabase login` → `supabase link --project-ref <ref>` → `supabase db push` (aplica todas as migrations em ordem).
3. Implantar as Edge Functions do repo: `dashboard`, `alunos`, `aluno-detail`, `avaliacoes`, `avaliacao-detail`, `fotos`, `lgpd-sign`, `agenda` (`supabase functions deploy <nome>`; cuidados de layout em §9.4).
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
| Termo | `LGPD_TERM_TEXT` v1.0 (`lgpd-utils.ts`): dados coletados (pessoais, saúde, biométricos), finalidade, base legal (art. 7º I e V), prazo, direitos do titular, canal de contato. A versão também está fixa (`TERM_VERSION`) na função. A UI exige assinatura **e** a caixa "Li o termo e concordo"; só a assinatura é enviada ao servidor. |
| Status LGPD | `alunos.lgpd_consent_status` vira `ACCEPTED` apenas pelo `POST lgpd-sign`… **porém** o `PUT aluno-detail` aceita `lgpd_consent_status` na whitelist, então a API permite marcar ACCEPTED sem assinatura (a UI não faz isso). |
| Busca | `alunos?search=` interpola o termo no filtro `.or()` do PostgREST sem escapar (a UI não usa; RLS continua limitando o escopo). |
| Chaves no front | Só a chave **anon** pública (`environment.ts`). Nenhum segredo no repositório. `.env.e2e` (credenciais da conta QA) está no `.gitignore`. |
| Landing | Página estática sem formulários nem scripts de terceiros (os pontos para Meta Pixel/GTM são só comentários). Não toca em dados de alunos. |
| Direito de eliminação | Não há exclusão definitiva pela UI; atender pedido de eliminação exige ação manual no banco + Storage. |
| CORS | `Access-Control-Allow-Origin: *` (proteção depende do JWT). |

---

## 11. Pendências e inconsistências conhecidas

- **Domínio**: não comprado. `https://SEU-DOMINIO/` em `site/index.html` (canonical, og:url, og:image, JSON-LD), `site/sitemap.xml` e `site/robots.txt` — ver checklist em §2.5. A landing também tem placeholders de preço e depoimentos e o número de WhatsApp fixo no HTML.
- **`get_dashboard_stats().todayAgenda`** continua sendo calculado (com `CURRENT_DATE` em UTC) mas o Início não o usa mais — a agenda de hoje vem de `GET agenda` com a data local. O padrão da função `agenda` sem parâmetros (America/Sao_Paulo) tampouco é usado pela UI.
- **Fórmulas em três lugares**: limites Omron/RCQ/IMC vivem em `supabase/functions/_shared/calculations.ts` (fonte da verdade), `src/app/assessment-calc.ts` (prévia, testado contra o original) e `src/app/profile-utils.ts` (barra de referência do perfil, cópia manual). As escalas das barras divergem entre perfil e relatório: `profile-utils.refBar` usa IMC 15–40 e RCQ 0,5–1,0; `omron-bands.omronBand` usa IMC 15–35 e RCQ 0,5–1,1 — a mesma medida aparece em posição diferente nas duas telas.
- **Aba Agenda do perfil**: o link **Editar** abre `/agenda` na semana atual, não no atendimento.
- **WhatsApp**: a mensagem usa ponto decimal ("49.2kg") enquanto o app mostra vírgula.
- **Busto** aparece como campo opcional para alunos de ambos os sexos no formulário (o banco aceita).
- `README.md`/`.env.example` do template AI Studio; `src/server.ts` mock; dependências não usadas (`@google/genai`, `motion`, `html2canvas`, `express`, `@angular/material`, `@angular/cdk`).
- Funções SQL `classify_*`/`calc_jackson_pollock_7` legadas e função `setup-admin-user` fora do repositório.
- Classificação de % músculo não é persistida (só calculada na tela); classificação de RCQ aparece na prévia e no relatório, mas não é gravada.
- Suíte E2E deixa alunos QA na lixeira (a API só faz soft delete); purga manual por SQL a partir de `e2e/test-output/qa-leftovers.json`.
