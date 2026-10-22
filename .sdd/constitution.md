`# Constituição do Projeto: solucao-crm
`
`> Regras invioláveis deste projeto. Toda spec, design e tarefa é checada contra este documento.
`> Gerada em 2026-10-22 por `/sdd:init`. Alterações exigem uma mudança SDD própria (porte S) e aprovação humana.
`
`## Princípios
`
`- **A doutrina do DeskcommCRM prevalece.** \`CLAUDE.md\` e \`AGENTS.md\` do repositório são a autoridade final de convenção; esta constituição só acrescenta o processo SDD (spec 10.4). Em conflito, vale o \`CLAUDE.md\` e a divergência vira decisão registrada abaixo.
`- **Test-led:** nenhuma linha de produção sem um teste que falhe antes.
`- **Multi-tenant desde o dia 1:** \`organization_id\` + RLS em toda tabela tenant-aware; service role sempre filtra organização de fonte confiável, nunca do body.
`- **Fail-fast:** Zod em todo input externo.
`- **Schema é migration:** toda mudança sai como migration versionada + apêndice idempotente no \`supabase/baseline.sql\`.
`- **Fatias pequenas:** mudanças pequenas, para caber no plano Claude Pro.
`
`## Stack e convenções
`
`Next.js 16 (App Router) + React 19 + TypeScript estrito + Tailwind 4 (CSS-first, sem \`tailwind.config\`) + shadcn/ui (\`components/ui\`), ícones \`lucide-react\`. Backend em Route Handlers \`app/api/v1\`. Banco Supabase/Postgres (\`supabase/migrations\`, \`supabase/baseline.sql\`). Gerenciador: pnpm. Testes: Vitest, Testing Library, Playwright (+ axe). WhatsApp via WAHA. Detalhes completos: \`CLAUDE.md\`.
`
`## Comandos de verificação
`
`- Testes: \`pnpm test:unit\` (suíte inteira, sem caminho) · focado: \`pnpm vitest run {files}\
`
`## Definition of Done
`
`A Definition of Done do \`CLAUDE.md\` (itens 1–18) vale integralmente. Resumo: typecheck e lint zerados, testes verdes, RLS testada, audit log em mutação, Zod nas bordas, migration + baseline, prova pela tela para mudança de UI, fragmento em \`.changes/\`, destino declarado (núcleo/extensão).
`
`## Restrições e proibições
`
`Os 14 anti-patterns do \`CLAUDE.md\` são proibidos (trigger com HTTP, \`getSession()\` no backend, API key em query string, bearer em texto puro, \`console.log\` etc.). Nada de serviço Docker \`build:\`-only. Nunca editar migration já aplicada. Marca/white-label só pelo banco, nunca \`NEXT_PUBLIC_*\`.
`
`## Segurança e dados
`
`Supabase Auth via \`getUser()\`; RBAC viewer<agent<manager<admin; RLS por organização; audit log append-only; LGPD (anonimização preferida, SLA D+7/D+15). Segredos só em variável de ambiente, nunca em código, log, spec ou chat.
`
`## Decisões de adoção
`
`- **D-01** `gate.mode: warn` no início; sobe para `strict` quando a esteira estiver assentada (spec 10.4).
`- **D-02** `web-react`: o projeto já usa Tailwind 4 + shadcn/ui + Lucide; isso prevalece sobre a escolha de base do perfil. Não adotar MUI/Ant Design.
`- **D-03** `infra-hostinger`: o proxy reverso e o deploy do `CLAUDE.md` (compose prod, Caddy/Traefik/cloudflared, imagens publicadas pelo CI no GHCR, sem build na VPS) prevalecem sobre o que o perfil sugerir de diferente.
`- **D-04** Nenhum ADR novo criado no init (a numeração de `docs/adr` pode colidir com PRs em voo); divergências futuras entram aqui ou em ADR próprio.
`
`## Perfis adotados
`
`Padrões opcionais aplicados a este projeto (`sdd profile add`). Em conflito, o que o código já usa prevalece e a divergência vira decisão registrada.
`
`<!-- sdd:perfil web-react início -->
`### Perfil: Web React
`
`> **Quando usar:** front-end React (Vite ou Next.js) em TypeScript, em projeto novo ou sem design system já estabelecido.
`
`Se o projeto já tem biblioteca de componentes, tema, ícones ou convenções próprias, **o que existe prevalece**: aplique deste perfil só o que não conflita e registre a divergência como decisão (D-xx) no Grill.
`
`#### Componentes e design system
`
`Escolha **uma** base por projeto e registre a escolha em um ADR. Não misture bibliotecas de componentes.
`
`| Base | Quando escolher | Referência |
`| :-- | :-- | :-- |
`| MUI (Material UI) | Aplicações gerais, formulários, painéis | https://mui.com/material-ui/getting-started/ |
`| Ant Design | Sistemas corporativos, telas densas de dados, tabelas e filtros | https://ant.design/docs/react/introduce |
`| Tailwind CSS + componentes headless | Identidade visual própria, landing pages, controle fino do layout | https://tailwindcss.com/docs |
`
`- Cores, tipografia, espaçamento, raios e sombras vêm de **tokens do tema**, nunca valores soltos no componente.
`- Acabamento visual (tipografia, hierarquia, espaçamento, microinterações): siga as diretrizes do Impeccable Style — https://impeccable.style/docs/
`- Componentes de tela ficam finos: lógica e chamadas de API em hooks/serviços testáveis.
`
`#### Cores e contraste
`
`- Monte a paleta com Color Hunt (https://colorhunt.co/) ou Adobe Color (https://color.adobe.com/create/color-wheel) e converta em tokens (primária, secundária, neutros, sucesso, aviso, erro).
`- Contraste **WCAG 2.2 AA**: 4,5:1 para texto normal, 3:1 para texto grande e elementos de interface.
`- Modo escuro, se existir, é outro conjunto de tokens, não `filter` ou inversão.
`- Cor nunca é o único meio de transmitir informação (erro também tem ícone ou texto).
`
`#### Ícones
`
`- **Lucide** (https://lucide.dev/icons/) é o conjunto padrão. Importe ícone por ícone, nunca o pacote inteiro.
`- **Lordicon** (https://lordicon.com/) só em momentos pontuais de destaque (onboarding, sucesso); animações pesam no bundle.
`- **Heroicons** (https://heroicons.com/) e **React Icons** (https://react-icons.github.io/react-icons/) apenas quando faltar um ícone no conjunto padrão.
`- Ícone sem texto visível exige `aria-label`; ícone decorativo leva `aria-hidden`.
`
`#### Acessibilidade
`
`- HTML semântico primeiro (`button`, `nav`, `main`, `label`); ARIA só quando o HTML não resolve.
`- Tudo operável por teclado, com foco visível e ordem lógica.
`- Formulários: `label` associado, mensagem de erro ligada ao campo e anunciada.
`- Imagens com `alt` significativo ou vazio quando decorativas.
`
`#### Código
`
`- TypeScript `strict`, sem `any` e sem casts inseguros.
`- Validação de formulários e de respostas de API com Zod nas bordas.
`- Estado de servidor separado do estado de interface; nada de dado de API duplicado em estado local sem motivo.
`- Layout responsivo a partir de 360 px de largura.
`
`#### Testes
`
`| Camada | Ferramenta | Regra |
`| :-- | :-- | :-- |
`| Componente | Vitest/Jest + Testing Library + user-event | Buscar por papel e rótulo (`getByRole`, `getByLabelText`), nunca por classe CSS ou `data-testid` quando houver alternativa acessível |
`| E2E | Playwright | Locators por papel; só as jornadas críticas de cada critério de aceite; sem `waitForTimeout` |
`| Acessibilidade | `@axe-core/playwright` | Zero violações `serious` e `critical` nas telas tocadas |
`
`Para economizar tokens: rode E2E com reporter de linha (`--reporter=line`) e via `sdd run e2e`; screenshots e traces só quando um teste falhar.
`
`#### Ferramentas no Claude Code
`
`- **MUI MCP** (servidor oficial de documentação do MUI): consultar API e exemplos de componentes no design e na implementação.
`- **Playwright MCP** ou **Chrome DevTools MCP**: depurar uma falha específica no navegador (console, rede, layout). Não use como rotina de verificação: capturas de tela consomem muitos tokens. A verificação é a suíte Playwright.
`- Skill de front-end (ex.: `frontend-design`), se instalada: apoio na direção visual de telas novas.
`
`#### Definition of Done adicional
`
`- Sem erros nem avisos novos no console do navegador.
`- axe sem violações `serious`/`critical` nas telas alteradas.
`- Contraste AA conferido nos tokens novos.
`- Tela utilizável por teclado e em 360 px.
`<!-- sdd:perfil web-react fim -->
`
`<!-- sdd:perfil infra-hostinger início -->
`### Perfil: Infra Docker em VPS Hostinger
`
`> **Quando usar:** aplicação publicada com Docker Compose numa VPS (Hostinger KVM ou equivalente), com HTTPS e deploy por GitHub Actions.
`
`Se o projeto já tem pipeline, orquestrador ou proxy próprios, **o que existe prevalece**: aplique deste perfil só o que não conflita e registre a divergência como decisão (D-xx) no Grill.
`
`#### Containers
`
`- `Dockerfile` **multi-stage**: build separado do runtime; imagem final mínima.
`- Processo roda com **usuário não-root**.
`- `HEALTHCHECK` em todo serviço exposto; o Compose usa `depends_on` com `condition: service_healthy`.
`- Imagens com **tag imutável** (versão ou SHA do commit), nunca só `latest` em produção.
`- Volumes nomeados para dados persistentes; nada de estado dentro do container.
`
`#### Rede e HTTPS
`
`- **Caddy** como proxy reverso com TLS automático (Let's Encrypt).
`- Só 80/443 expostos publicamente; banco, Redis e serviços internos apenas na rede do Compose.
`- Algumas VPS da Hostinger já vêm com proxy (Traefik) ocupando 80/443: detecte antes e publique atrás dele em vez de subir outro proxy.
`
`#### Segredos e configuração
`
`- `.env` só no servidor, com permissão restrita; nunca no git nem na imagem.
`- Segredos do pipeline em GitHub Secrets.
`- `.env.example` versionado, sem valores reais.
`
`#### Deploy e rollback
`
`- GitHub Actions: testes → build → push da imagem → deploy por SSH com script idempotente.
`- **Rollback em menos de 2 minutos**: voltar a tag anterior no `.env`/Compose e `docker compose up -d`. O script de deploy guarda a tag anterior.
`- Migrações compatíveis com a versão anterior da aplicação (ver perfil api-node), para o rollback não quebrar o banco.
`- Backup automático do banco antes de cada deploy, com restauração testada.
`
`#### Observabilidade
`
`- Logs dos containers com rotação (`max-size`, `max-file`).
`- Healthcheck externo simples (uptime) no domínio público.
`
`#### Testes
`
`| Tarefa | O que verifica |
`| :-- | :-- |
`| `CHECK-SMOKE` | Sobe o Compose localmente (ou em CI), espera os healthchecks e chama a rota de saúde e uma rota crítica |
`| Revisão do deploy | Script de deploy e rollback executados em ambiente de teste antes da primeira produção |
`
`#### Ferramentas no Claude Code
`
`- Para mudanças de porte L de infraestrutura, peça revisão humana do diff de `Dockerfile`, Compose e workflow antes do `/sdd:approve`.
`- Nunca execute comandos no servidor de produção a partir do agente sem confirmação explícita do usuário.
`
`#### Definition of Done adicional
`
`- Imagem builda em CI e passa no smoke test.
`- Rollback documentado e testado para a mudança.
`- Nenhum segredo novo fora do `.env`/GitHub Secrets.
`<!-- sdd:perfil infra-hostinger fim -->
