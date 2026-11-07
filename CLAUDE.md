# CLAUDE.md — DeskcommCRM

> Doutrina do repo, em resumo. **Texto integral, incidentes medidos e comandos de prova:** [`docs/doctrine/claude-md-completo.md`](docs/doctrine/claude-md-completo.md) (mesmos títulos; leia a seção relevante sob demanda, não o arquivo todo). Em conflito, a doutrina completa prevalece.

Complementos: [`AGENTS.md`](AGENTS.md) (mesmo contrato, forma portável; ao mudar doutrina aqui, confira se desatualizou), [`docs/index.md`](docs/index.md) (índice dos docs e precedência), [`docs/current-state.md`](docs/current-state.md) (o que está pronto, incompleto e quebrado: leia antes de estimar), [`docs/harness-audit.md`](docs/harness-audit.md) (`pnpm gov:verify` **não** cobre `test:db` nem `test:e2e`), [`docs/threat-model.md`](docs/threat-model.md).

## Visão (1 parágrafo)

Sistema operacional de vendas open source com agentes de IA nativos, multi-nicho, WhatsApp (WAHA) como canal primário, CRM exposto via MCP. Self-host em VPS, multi-tenant com RLS desde o dia 1, LGPD nativa. Posicionamento: `VISION.md`.

## Stack canônica

Next.js 16 App Router + React 19 + TypeScript 6 estrito + Tailwind 4 (CSS-first: **não há `tailwind.config.ts`**, tokens em `app/globals.css`) + shadcn/ui. Route Handlers no mesmo repo; workers por `event_log` + cron. Supabase (Postgres, RLS em toda tabela tenant-aware; `uuid-ossp`, `pgcrypto`, `vector`), Auth via `@supabase/ssr`, Realtime, Storage (`whatsapp-media` privado). WAHA Plus NOWEB. Upstash Redis (rate limit). IA via Vercel AI Gateway. Zod em todo input externo. Sentry com `beforeSend` sanitizado. Gerenciador: **pnpm**.

## Convenções críticas (NÃO NEGOCIÁVEIS)

**Multi-tenancy**
- `organization_id uuid not null references organizations(id) on delete cascade` em toda tabela tenant-aware; policy `tenant_isolation_<tabela>_all` via `fn_user_org_ids()`.
- Service role bypassa RLS: handler com admin client **filtra `organization_id` manualmente**, de fonte confiável (cookie/JWT/webhook secret/path token), **nunca do body**. Teste de isolamento (2 tenants) é obrigatório no CI.

**Idempotência e eventos**
- Eventos externos: `unique (organization_id, external_id)` + captura `23505`. POSTs de criação aceitam `Idempotency-Key` (recibo no Postgres: `lib/api/idempotency.ts`).
- **Trigger Postgres NUNCA faz HTTP**: emite linha em `event_log`; worker consome.

**API `/api/v1/`**
- Versão por path, JSON snake_case, UUID v4, ISO-8601 UTC, dinheiro em `_cents` + `currency`. Sucesso `{ data, meta? }`, erro `{ error: { code, message, details? } }` (`ok()`/`fail()` de `lib/api/wrappers.ts`). Paginação por cursor opaco HMAC. `X-Request-Id` em toda resposta; headers `X-RateLimit-*` e `Retry-After` em 429.
- Auth dual (cookie para o frontend, `Authorization: Bearer dsk_...` para servidor) habilita-se **rota por rota** com `lib/api/auth-dual.ts` **e** entrada em `lib/auth/public-paths.ts` (senão o `proxy.ts` dá 401). Converter as rotas que cada integração precisar. **API key nunca em query string.** Bearer em texto só na criação; no banco, hash SHA256.

**Auth e RBAC**
- Sempre `getUser()`, **nunca `getSession()`**. Roles: `viewer` < `agent` < `manager` < `admin`; super-admin = `is_platform_admin`.
- MFA TOTP é opcional e ligado por quem administra (`platform_admins.mfa_required`, `organizations.settings.security.mfa_required`; regra em `lib/auth/politica-mfa.ts`). **Cadastrar e provar são perguntas diferentes:** quem TEM fator prova na sessão, sempre.
- Todo handler mutante de `app/api/v1` declara `requireSupportWrite(` antes do efeito (não substitui `requireRole`).

**Audit log**
- Toda mutação POST/PATCH/DELETE bem-sucedida grava 1 linha em `api_audit_log` (fire-and-forget). Cron que não fez nada **não audita**; o que fez, audita. Falha de gravação gera alerta Sentry, não bloqueia.
- Append-only para `anon`, `authenticated` e `service_role` (sem UPDATE/DELETE/TRUNCATE, migration 0258). **Enumerar privilégios no dump não protege no Supabase real: só `revoke` explícito no apêndice.** Retenção padrão 5 anos, executada por `fn_expurgar_auditoria_vencida` (piso 90 dias no corpo, `AUDIT_LOG_RETENTION_DAYS`). Não existe camada cold/S3.

**LGPD:** anonimização preferida a delete (nome vira `Cliente Anonimizado #N`); cascade redact em contact + conversations + messages (mídia removida) + activities; reversão = 403 `lgpd_anonymization_irreversible`; SLA export D+7, redact D+15; audit `lgpd.data_request_received`, `lgpd.export_generated`, `lgpd.redact_executed`, `lgpd.consent_changed`.

**WAHA e WhatsApp**
- Imagem NOWEB pinada por arquitetura (`latest-2026.7.2` x86, `noweb-arm-2026.7.2` ARM64). Auth: env do WAHA recebe SHA512 hex da key; cliente manda plaintext em `X-Api-Key`. Webhooks com HMAC SHA512 e `timingSafeEqual`.
- Anti-banimento: throttle 1 msg/1,2 s + jitter ≤800 ms; campanha 1/5 s; warm-up 7–14 d; janela de disparo 7h–22h (knob por canal). Multi-device: assinar `message.any`; tratar `fromMe=true` sem duplicar. Mídia: subir ao Storage primeiro e passar a URL ao WAHA.
- STOP/opt-out: **uma regra só**, em `lib/opt-out/deteccao.ts`, usada na ingestão e no runtime do agente (palavra isolada ou verbo de cessação com objeto de comunicação). O Jev nunca bloqueia ninguém, só abre aviso.
- Grupos entram só os ligados em Conexões › Grupos; remetente é `p.author`; nunca entram em funil, lista, campanha ou IA. Cron `recover-stuck-messages` falha `sending` >5 min e abre aviso; **não reenvia**.

**Marca própria (white-label):** uma imagem serve todas as marcas, **sem `NEXT_PUBLIC_*` de marca**. O banco (`platform_branding`, `organizations.settings.branding`) está acima do `.env`. O resolvedor **nunca lança**. Saída sem DOM usa `marcaDaSaida()`. **O PDF de LGPD nunca leva marca** (nomeia o controlador). Vazamento vigiado por `tests/unit/branding.test.ts`; contexto em `docs/white-label.md`.

**Doutrina DIRC antes de adicionar campo:** Duplicar (vive aqui?) · Integrar (FK de outra tabela?) · Referenciar (só ponteiro?) · Calcular (on-demand?).

**Modelagem:** 5 tabelas core `crm_pipelines`, `crm_stages`, `crm_leads`, `crm_lead_activities`, `crm_lead_links`. `position_in_stage numeric` (fractional indexing), **nunca `int`**. `type` é `text` + `check`, não enum (colunas de vocabulário aberto não levam CHECK; ver o texto completo). `tags text[]` + GIN; `custom_fields jsonb` com schema em `pipeline.settings.fields`; `vocabulary jsonb` por pipeline. `external_id` nullable.

## Anti-patterns proibidos

1. String que devia ser FK. 2. Duplicação sem fonte da verdade. 3. Evento sem consumer. 4. FK ausente virando inferência por nome. 5. Campo sincronizado por cron quando devia ser realtime/trigger. 6. `jsonb` lock-in (UI lendo path direto). 7. Cascade fantasma. 8. Polimórfico sem padronização. 9. **Trigger que faz HTTP.** 10. Service role em handler sem filtrar `organization_id`. 11. `getSession()` no backend. 12. API key em query string. 13. Bearer em texto no DB. 14. `console.log` em código merged.

## Paths importantes

`docs/prd/` (PRD master e 01–06) · `docs/specs/` · `docs/business-rules/` · `docs/research/reference-synthesis.md` · `tasks/todo.md` · `app/globals.css` (Tailwind 4) · `lib/api/wrappers.ts`, `lib/api/errors.ts` · `lib/env.ts` (Zod, lança no startup) · `lib/supabase/{browser,server,admin}.ts` · `app/api/v1/health/route.ts` · `supabase/migrations/` · `docs/runbooks/deploy.md` (**leia antes de mexer na VPS**).

## Deploy em produção (NÃO NEGOCIÁVEL)

- VPS com proxy reverso próprio: todo `up -d` leva os dois compose: `docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml --env-file .env up -d app`. Omitir o segundo arquivo derruba o roteamento (domínio responde 404 com o contêiner `healthy`).
- Atrás de NAT/CGNAT: `REVERSE_PROXY=cloudflared` (`docker-compose.cloudflared.yml`); não suportado no single-server. Ver `docs/runbooks/deploy.md` §5.
- **Depois de qualquer deploy, `/` responde 200 e `/app` responde 307** (o 200 sozinho não prova que é o app).
- Caminho normal: commit → PR → merge na `main` → CI publica no GHCR → a VPS puxa. **Nada é construído na VPS** (exceção de emergência e dívida).

## Packaging e distribuição — DOUTRINA (NÃO NEGOCIÁVEL)

Lei: `docs/doctrine/packaging.md`; decisões: `docs/adr/0001-packaging-e-distribuicao.md`.
1. Nenhum serviço de `docker-compose.prod.yml` constrói na máquina do cliente: todo serviço declara `image:` publicada; `build:` só como escape ao lado.
2. Publicação é ato do CI (amd64 e arm64); `imagens-ok` é check obrigatório.
3. Instalação de cliente aponta para número de versão, nunca tag móvel (`latest` = topo da `main`; `stable` = última release); `pull_policy` acompanha a mutabilidade da tag.
4. Dependência upstream com tag fixa, nunca republicada (WAHA, Redis, Caddy, `serverless-redis-http`).
Bump de versão não pode exigir edição manual de `.env` ou compose pelo operador.

## Extensões — DOUTRINA (NÃO NEGOCIÁVEL)

Lei: `docs/doctrine/extensoes.md`; contrato: `docs/specs/extensoes-declarativas-v1.md`. Pergunta que decide o destino: **"se nenhuma organização ativar isto, a operação comum continua inteira?"**
1. O núcleo é útil com zero extensões (identidade, autorização, isolamento, auditoria, contratos e cadeia de envio são núcleo).
2. Extensão pede capacidade nomeada; não importa código interno nem lê o banco; toda escrita revalida ator, organização e papel.
3. A instância decide o pacote; a organização decide o uso.
4. Toda operação é recibo idempotente, com saída pela tela; troca de ponteiro exige a revisão que a tela viu; tirar é lógico.
5. Não anunciar o que não existe. 6. Módulo oficial com dados não põe tabela no baseline (ADR-0002).

## Como rodar local

`nvm use` (node 22) · `pnpm install` · `cp .env.example .env.local` · `docker compose up -d` (WAHA) · `pnpm dev` · `pnpm worker` · `pnpm dev:crons`. Schema: aplique `supabase/baseline.sql`, **não** as migrations. Stack local completa: `./ubuntu-local-installer.sh` uma vez, depois `pnpm local:up|down|status|logs`. Detalhes no `README.md`.

## Testes

Comandos: `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm test:db` (Postgres efêmero, baseline install/update, invariantes, RLS) · `pnpm test:e2e` · `pnpm gov:verify` · `pnpm cercas` · `pnpm test:shell` · `pnpm format:check`. Um teste só: `pnpm vitest run <arquivo>` ou `-t "nome"`.

Armadilhas que já custaram caro (detalhes e comandos de conferência no texto completo):
- **`pnpm test:unit` é `vitest run` sem caminho e alcança o repo inteiro** (não só `tests/unit/`). Rodar um recorte e chamar de "suíte verde" é falso verde.
- **Gate escolhido não é suíte.** Antes do PR, rode a suíte.
- **Não corte a saída com `tail`.** O rodapé (`Test Files`, `Tests`, `Errors`) e o **exit code** são a autoridade; o `grep FAIL` pode vir vazio com falhas.
- **Invariantes não estão no `test:unit`** (precisam de Postgres real, via `pnpm test:db`). Mexeu em schema, RLS, RBAC, roteamento ou webhooks: rode `pnpm test:db` local antes do PR.
- `lib/ai/dispatcher/rate-limit.test.ts` falha local se o `.env.local` aponta para um Redis que não está de pé; no CI passa.

**Checks obrigatórios na `main`:** `verify`, `build-and-size`, `invariants`, `e2e`, `imagens-ok` (confira na fonte: `gh api repos/DouglasDeCastroAlmeida/SolucaoCRM/branches/main/protection --jq '.required_status_checks.contexts|join(", ")'`). O `e2e` pula partes em PR que não alcança o que ele mede; ali verde não prova tela. Jobs pesados podem ir ao executor próprio (`EXECUTOR_PROPRIO`); a guarda contra fork mora na máquina, e imagem que o parque instala nunca se constrói lá. Merge queue indisponível.

## QA Visual com Recursos Reais — DOUTRINA (produto self-host)

A experiência de quem instala numa VPS É o produto. Toda feature ou fix visível é provada **como um leigo faria, pela tela** (Playwright), em banco fresco do `baseline.sql` + `scripts/bootstrap-owner.ts`, com dependências reais (WAHA, Redis) e **com envs opcionais ausentes**; efeito externo provado com receiver real. `curl` não prova UX. Prioridade: primeira impressão (onboarding). Registro: `docs/testing/user-journey-map.md`, specs em `tests/e2e/`, evidência em `evidence/<entrega>/` (versionada). Medidas de front-end por ferramenta, nunca a olho. Receita do ambiente: Supabase local pg15, `next build` + `next start`, worktree com `node_modules` real (nunca symlink) fora de `/tmp`.

## Higiene de branches — DOUTRINA (NÃO NEGOCIÁVEL)

`main` é produção. 1) **Antes de qualquer trabalho:** `git fetch origin && git merge origin/main` (ou `--ff-only` se a branch não tem commits). 2) **Nunca `reset --hard`/force** para atualizar. 3) **Nunca toque em branch/worktree sujo que não é seu.** 4) Quando uma feature entra na `main`, as outras branches ficam atrasadas: aplique a regra 1 antes de retomar. 5) Conflito ao atualizar: pare e resolva com cabeça; preservar trabalho > verde rápido.

## Migrations & Banco — DOUTRINA (projeto open-source)

Toda mudança de schema sai como migration versionada, nunca `ALTER`/`CREATE` solto.
1. Arquivo `supabase/migrations/<timestamp>_<NNNN>_<slug>.sql`; `NNNN` é o próximo número livre **medido por `pnpm checar:colisao-de-migration`** (main do produto + PRs abertos), nunca pelo último arquivo da listagem. Quem mescla primeiro fica com o número.
2. Idempotente (`if not exists`, `create or replace`). 3. Portável em `psql` puro: sem `BEGIN`/`COMMIT`, sem temp table fora de transação. 4. Data migrations genéricas (sem IDs do seu tenant). 5. **Linha `-- manifest: <o quê e o porquê>` no cabeçalho**; `MANIFEST.md` é histórico e não recebe linha nova.
6. **Reflita no `supabase/baseline.sql` (OBRIGATÓRIO):** apêndice idempotente e auto-curativo no fim (deduplicar/corrigir dados ANTES de criar constraint). Só migration sem apêndice não chega aos self-hosters.
7. Aplique e prove (ANTES/DEPOIS); regenere `lib/database.types.ts` se mexeu em contrato; valide o baseline em Postgres descartável (install e update). 8. Backfill antes de constraint nova.
9. **Função nova em `public` nasce EXPOSTA: revogue as duas origens** (`revoke execute ... from public, anon;` + `grant` só a quem precisa).
10. **`grep` no `baseline.sql` inteiro lê a definição errada** (a função aparece várias vezes; vale a última). Pergunte ao banco (`pg_get_functiondef`) ou ancore com `rfind`.
Nunca edite migration já aplicada: faça forward-fix + novo apêndice.

## Skills relevantes a usar (Claude Code)

Guias deste repo em `.claude/skills/` (espelho de `.agents/skills/`): `deskcomm-instalar`, `deskcomm-operacao`, `deskcomm-cliente-novo`, `deskcomm-saas`, `deskcomm-metricas`, `deskcomm-prompt`, `deskcomm-contribuir`, `deskcomm-extensao`, `deskcomm-doutrina`. Guia criado ou comando novo atualiza o `SKILL.md` no mesmo PR. Para o fluxo de desenvolvimento, ver a seção abaixo.

## Definition of Done

1. `pnpm typecheck` zerado. 2. `pnpm lint` zerado. 3. Testes unit/e2e relevantes existem e passam. 4. RLS testada se toca tabela tenant-aware. 5. Audit log se há mutação relevante. 6. Rate limit em rota pública. 7. Zod em todo input externo. 8. Sem `console.log`. 9. Env var nova em `.env.example` + `lib/env.ts`. 10. Doc atualizada se mudou contrato. 11. **Schema: migration com `-- manifest:` + apêndice no baseline.** 12. **UI/fluxo: provado pela tela como um leigo**, com evidência visual; caminho por agente de IA mede o par (`docs/doctrine/prova-em-par.md`). 13. **Living System Checklist** respondido nomeando artefatos concretos (`docs/doctrine/sistema-vivo.md`). 14. **Tela nova tem porta** em `lib/navigation/catalogo.ts` (o `registry.ts` só deriva) ou na allowlist com justificativa. 15. **Dockerfile/compose/setup kit:** a mudança chega a quem já instalou (`docs/doctrine/packaging.md`); rode `pnpm test:shell`. 16. **Mudou comportamento: procure a afirmação de estado** sobre ele nos docs de autoridade e troque por comando quando der. 17. **Comportamento visível ao operador traz fragmento em `.changes/`** (`nada_mudou` / `capacidade_nova` / `exige_acao`; `pnpm release:conferir`; o texto vira nota pública do changelog; ninguém escreve o `CHANGELOG.md` à mão). 18. **O PR declara o destino: núcleo, extensão, ambos ou infraestrutura** (`docs/doctrine/extensoes.md`).

Um staff engineer aprovaria? Se não, itera.

## Esteira de desenvolvimento

Desde 07/11/2026 o projeto usa as skills do `mattpocock/skills` (instaladas como skills globais do dono), no lugar da esteira SDD. O fluxo de uma mudança:

1. `/grill-with-docs`: alinhar o pedido, uma pergunta por vez, antes de qualquer código.
2. `/to-spec`: a spec vira uma issue no GitHub. **O dono aprova a spec antes de implementar.**
3. `/to-tickets`: quebra em tarefas finas, com dependências.
4. `/implement` (ou `/implement-spec`): TDD, uma fatia vertical por vez.
5. `/code-review`, depois `/pr`.
6. Bug difícil: `/diagnosing-bugs`. Trabalho grande demais para uma sessão: `/wayfinder`.

O que **não muda**: só o dono manda mesclar ("Mesclar"); a Definition of Done acima; o fragmento em `.changes/`; migrations com a tripla; os 5 checks obrigatórios do CI.

O histórico SDD (mudanças 001 a 011) fica em `.sdd/archive/` e as specs vivas em `.sdd/specs/`, **somente leitura**: não abrir `/sdd:new`. Cercas de teste e o CHANGELOG apontam para `.sdd/archive/`, então a pasta não pode ser renomeada. O gate do SDD (`.sdd/config.json`) está em `warn`.

## Agent skills

### Issue tracker

Issues vivem no GitHub Issues de DouglasDeCastroAlmeida/SolucaoCRM (CLI `gh`). Ver `docs/agents/issue-tracker.md`.

### Triage labels

Vocabulário padrão: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. Ver `docs/agents/triage-labels.md`.

### Domain docs

Single-context (`GLOSSARY.md` na raiz + `docs/adr/`). Ver `docs/agents/domain.md`.
