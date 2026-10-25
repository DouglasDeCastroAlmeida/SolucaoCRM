# Grill: Marcas, parceiros e domínios

> Mudança `002-marcas-parceiros-e-dominios` · porte L · 2026-10-25
> Interrogatório técnico antes de qualquer requisito ou código. Uma pergunta por vez, sempre com
> uma resposta recomendada. O que o código responde, o agente descobre sozinho em vez de perguntar.

## Pedido original

Subprojeto 1 — Marcas, parceiros e domínios (porte L, depende do 0, já concluído). Escopo: seção 5 da spec
`docs/solucao-crm/specs/2026-10-21-crm-autonomos-design.md` — modelo Plataforma > Parceiro > Marca > Organização; resolução do host
para a marca por tabela de domínios com cache (implementar o desvio por host do `proxy.ts`, hoje inerte); HTTPS sob demanda no
Caddy do CRM (o proxy só emite certificado para domínio de marca ativa, confirmando com o app); login, cadastro e e-mails com a marca
(gancho de envio do Supabase Auth chamando o app, que renderiza o modelo da marca); identidade única com visão filtrada por marca;
nível parceiro só com tabelas, papel "admin do parceiro" e políticas RLS (sem telas nem repasse); painel `/admin` da plataforma
ampliado com CRUD de marcas, domínios, planos e pacotes, visão de todas as contas e suporte auditado (impersonar). Casos de borda
da seção 5.3. Não rediscutir decisões D-xx. Respeitar o CLAUDE.md do DeskcommCRM (multi-tenancy com RLS, migrations versionadas
com apêndice no baseline, white-label já existente em `lib/branding` e `platform_branding`, Definition of Done).

## Contexto levantado no código

- **Marca hoje existe em dois níveis, nenhum resolvido por endereço:** `public.platform_branding` (linha única `id = 1`: `app_name`,
  `logo_url`, `accent_hex`, `show_powered_by`; semeada do `.env`) e `organizations.settings.branding` (por organização).
  Resolvedores em `lib/branding/` (`instalacao.ts`, `organizacao.ts`, `saida.ts`, `resolve.ts`). Doutrina do CLAUDE.md: uma imagem serve
  todas as marcas; o banco está acima do `.env`; resolvedor nunca lança; PDF de LGPD nunca leva marca; vazamento de marca vigiado por
  `tests/unit/branding.test.ts`.
- **Não existem** tabelas de marca, parceiro ou domínio (`grep` no `supabase/baseline.sql`); só `platform_branding` e `platform_admins`.
- **`proxy.ts`** (163 linhas): o desvio por host (`admin.` / `/admin`) é declarado NOOP no próprio código; a superfície `/admin` é
  alcançada por caminho (`NEXT_PUBLIC_ADMIN_URL` no mesmo host).
- **Caddy do CRM** (`Caddyfile`, `Caddyfile.single-server`): sem `on_demand_tls`; os sites extras entram por `caddy-sites/*.caddy`.
  A VPS já tem DNS curinga (`*.corretora.io`) apontando para o IP, e o Caddy do CRM é o único dono de 80/443 (decisão do subprojeto 0).
- **Produção e homologação** usam hoje `app.corretora.io` e `hml.corretora.io` com a marca de instalação (`APP_NAME`, `APP_LOGO_URL`,
  `APP_ACCENT_HEX`); o `.env` da instalação é semente e piso de rollback.
- Restrições herdadas: multi-tenant com RLS desde o dia 1; `service_role` só com `organization_id` de fonte confiável; migration
  versionada + apêndice idempotente no `baseline.sql` (o kit aplica só o baseline); função nova em `public` revoga `PUBLIC` e `anon`;
  decisões A-05..A-07 da constituição (imagem só amd64, aprovação de produção = clique, e2e só manual).

## Perguntas e respostas

### P1. Quais marcas e domínios existem no lançamento, e qual é a marca padrão?
- Recomendação do agente: **uma marca padrão da plataforma em `app.corretora.io`** (a produção de hoje, que vira a "marca padrão" quando o
  endereço é desconhecido, como manda a seção 5.3) e **uma marca por vertical em subdomínio da plataforma** (`corretor.corretora.io`,
  `nutricionista.corretora.io`), aproveitando o DNS curinga que já existe. **Domínio próprio de marca entra no escopo do código** (tabela
  de domínios e HTTPS sob demanda), mas no lançamento validamos **um** domínio próprio de teste, sem prometer nada a parceiro externo.
  Isso mantém o custo em zero (sem novo domínio a comprar) e prova os dois caminhos (subdomínio e domínio próprio) com a infraestrutura
  que já está no ar.
- Resposta: aceita a recomendação.

### P2. Quanto de planos e pacotes verticais entra neste subprojeto, já que a cobrança só vem no subprojeto 2?
- Recomendação do agente: **entram as tabelas e o CRUD no painel da plataforma, sem cobrança**. Planos por marca: nome, limites (usuários, plano Solo/Pro/Equipe), preço em centavos e ciclo; nada de Asaas, checkout ou trial (isso é o subprojeto 2). Pacotes verticais: a tabela e o **mecanismo de cópia** para a organização na criação (sem vínculo depois, como a spec manda), com um pacote mínimo de teste; o **conteúdo** dos pacotes Corretor e Nutricionista fica nos subprojetos 8 e 9. Assim o subprojeto 1 entrega a estrutura completa, e o 2, o 8 e o 9 só a preenchem.
- Resposta: aceita a recomendação.

### P3. De qual provedor e de qual endereço saem os e-mails (acesso, convite, recuperação de senha) de cada marca?
- Recomendação do agente: **um único domínio de envio da plataforma** (`corretora.io`), verificado **uma vez** no provedor (SPF e DKIM, registros que você cria no DNS da Hostinger), com **nome do remetente, `reply-to`, logo e textos por marca**. Provedor: **Resend no plano gratuito** (3.000 e-mails/mês, sem cartão), que o fork já suporta (`RESEND_API_KEY`); SMTP genérico continua como alternativa. Domínio de envio **próprio de cada marca** (verificar um domínio por marca) fica para a fase de parceiros, porque cada um exige registros de DNS e reputação própria. Assim o custo é zero e o e-mail chega na caixa de entrada sem cair em spam.
- Resposta: aceita a recomendação.

### P4. Como voltamos atrás em menos de 2 minutos se as marcas por domínio derem problema, e o que acontece com as contas que já existem?
- Recomendação do agente: **três travas juntas**. (1) **Chave de desligamento** `MARCAS_POR_DOMINIO=off` no `.env`: com ela, o app ignora a tabela de domínios e mostra sempre a marca padrão, exatamente como é hoje; basta recriar o `app` (cerca de 10 s). (2) **Migrações só aditivas** (tabelas e colunas novas, nada apagado nem renomeado), para a versão anterior da imagem continuar funcionando com o banco novo; voltar a versão é o rollback de 5 s do `deploy.sh`. (3) **Contas existentes não mudam**: uma migração cria a **marca padrão** a partir da `platform_branding` atual (nome, logo e cor de hoje) e liga todas as organizações a ela, sem alterar nenhuma tela que já funciona. Nada de HTTPS sob demanda é ligado em produção até a marca padrão estar provada na homologação.
- Resposta: aceita a recomendação.

### P5. Até a cobrança existir (subprojeto 2), o cadastro público de cada marca fica aberto ou fechado?
- Recomendação do agente: **o código de cadastro por marca entra, mas nasce FECHADO**: cada marca tem uma chave `cadastro_aberto` (padrão `false`). Enquanto fechada, o endereço de cadastro responde "cadastro por convite" e contas novas só nascem por **convite** ou pelo **painel da plataforma** (você cria). Quem abre a chave é o dono da plataforma, marca por marca, quando o trial com cartão (subprojeto 2) estiver pronto. Motivo: abrir cadastro sem cobrança significa qualquer pessoa criar conta gratuita e ilimitada na sua VPS (consome memória, WhatsApp e e-mails) e dificulta ligar o trial depois. Isso não adia nada do escopo, só controla quando a porta abre.
- Resposta: aceita a recomendação.

### P6. Se o gancho de e-mail da marca falhar (app fora do ar ou lento), o que o usuário vê?
- Recomendação do agente: os e-mails de acesso (convite, recuperar senha, confirmar e-mail) passam todos pelo **gancho de envio do Supabase Auth** (`GOTRUE_HOOK_SEND_EMAIL`, suportado pelo GoTrue 2.196.0 do kit; na homologação, configurado no painel do Supabase Cloud). O gancho chama o endereço interno do app, **assinado com um segredo** (padrão Standard Webhooks, só o servidor conhece), e o app monta o link **direto no domínio da marca** (com `token_hash`, sem depender da lista de redirecionamentos do Supabase) e envia pelo Resend. **Se o gancho falhar, o e-mail NÃO sai e o usuário vê "não conseguimos enviar, tente de novo em instantes"**, com botão de reenviar travado por tempo (evita clique duplo). O GoTrue não tem plano B automático com gancho ligado, e mandar o e-mail padrão sem marca seria pior (vaza o nome de outra marca). A falha vira **alerta no Sentry** e linha no log de eventos, para você saber antes de o cliente reclamar. O app caindo já derruba o login de qualquer forma, então esse caso não cria uma dependência nova.
- Resposta: aceita a recomendação.

### P7. O autônomo (organização) pode continuar personalizando logo e cor por cima da marca da plataforma?
- Recomendação do agente: **sim, nada que já funciona é retirado**. A ordem de precedência passa a ser **organização > marca > plataforma > padrão do produto**, resolvida pelo mesmo resolvedor que nunca lança (`lib/branding`). Regra por tela: o que acontece **antes do login** (login, cadastro, e-mails de acesso, página de erro, nome do app instalado) usa **só a marca**, porque ainda não se sabe quem é a organização; **dentro do app**, a personalização da organização (logo e cor) vale por cima da marca, como hoje. A marca pode **travar** isso com uma chave `permite_personalizacao` (padrão ligada) para um parceiro que queira identidade rígida. O PDF de LGPD continua sem marca nenhuma (doutrina do CLAUDE.md), e os testes que vigiam vazamento de marca passam a conhecer a marca como mais uma camada.
- Resposta: aceita a recomendação.

### P8. Quem pode cadastrar um domínio e o que impede alguém de abusar do HTTPS sob demanda?
- Recomendação do agente: **só o admin da plataforma cadastra domínio** (painel `/admin`; nem a marca nem o parceiro, que no lançamento não têm tela). O Caddy só pede certificado depois de perguntar ao app (`on_demand_tls { ask ... }`), e o app responde **sim** apenas se: (1) o domínio está na tabela, **ativo** e ligado a uma **marca ativa**; (2) o DNS dele **já aponta para o IP da VPS** (conferido pelo próprio app antes do aval); (3) o limite de emissões por hora não foi estourado (trava de segurança, porque o Let's Encrypt barra 50 certificados por semana por domínio registrado). O endereço de pergunta é **interno** (só a rede do Caddy alcança) e exige um **segredo compartilhado**; sem ele, responde "não". Domínio removido ou marca inativa: o app passa a responder "não", o certificado não é renovado e quem acessa vê a marca padrão. Cadastro é **idempotente**: o domínio é único (`unique`), e repetir o clique não duplica nem reemite. Cada criação, alteração ou remoção de domínio entra no log de auditoria.
- Resposta: aceita a recomendação.

### P9. Como provamos que o subprojeto está pronto (o que você vai ver funcionando)?
- Recomendação do agente: **na homologação**, com três endereços: a marca padrão (`hml.corretora.io`), uma marca de teste em subdomínio (`marca-a.corretora.io`, com logo, cor e nome diferentes) e **um domínio próprio de teste** apontado para a VPS. Em cada um você deve ver: **tela de login com a marca certa**, **e-mail de acesso chegando com a marca e o link no mesmo endereço**, e **a lista de organizações filtrada** (quem tem conta nas duas marcas vê só as da marca em que entrou). Provas técnicas obrigatórias: **testes de isolamento** (2 marcas, 2 organizações, 1 e-mail nas duas: nada vaza entre marcas; admin do parceiro só enxerga as marcas dele pelas políticas RLS, sem telas), **`MARCAS_POR_DOMINIO=off` devolve o comportamento de hoje**, domínio desconhecido cai na marca padrão, domínio removido deixa de receber certificado, e o **cadastro fechado** responde "por convite". **Produção** recebe só a marca padrão (nada muda para quem já usa) e o HTTPS sob demanda só depois da prova na homologação. Prova pela tela, como um leigo faria, conforme a doutrina de QA visual do projeto, com evidência em `docs/solucao-crm/evidencias/002-marcas/`.
- Resposta: aceita a recomendação.

## Decisões

- **D-01** (P1) Lançamento com **marca padrão em `app.corretora.io`** (a produção de hoje, usada também para host desconhecido), **uma marca por vertical em subdomínio** (`corretor.corretora.io`, `nutricionista.corretora.io`, aproveitando o DNS curinga) e **domínio próprio de marca** suportado no código, validado com **um** domínio de teste.
- **D-02** (P2) Entram **tabelas e CRUD** de planos por marca (nome, limites, preço em centavos, ciclo) e de pacotes verticais, mais o **mecanismo de cópia** do pacote para a organização na criação (sem vínculo depois), com pacote mínimo de teste. **Sem** Asaas, checkout ou trial (subprojeto 2); conteúdo dos pacotes Corretor e Nutricionista nos subprojetos 8 e 9.
- **D-03** (P3) E-mails saem de **um único domínio de envio da plataforma** (`corretora.io`, SPF e DKIM verificados uma vez), via **Resend gratuito** (SMTP genérico como alternativa); mudam por marca o nome do remetente, o `reply-to`, o logo e os textos. Domínio de envio por marca fica para a fase de parceiros.
- **D-04** (P4) Rollback em menos de 2 min por **três travas**: chave `MARCAS_POR_DOMINIO=off` (volta à marca padrão, como hoje), **migrações só aditivas** (a imagem anterior segue funcionando) e **contas existentes inalteradas** (migração cria a marca padrão a partir da `platform_branding` e liga todas as organizações a ela). HTTPS sob demanda só liga em produção depois de provado na homologação.
- **D-05** (P5) O cadastro por marca existe no código mas **nasce fechado** (`cadastro_aberto = false` por marca): responde "cadastro por convite"; contas novas só por convite ou pelo painel; o dono da plataforma abre a chave quando o trial (subprojeto 2) estiver pronto.
- **D-06** (P6) E-mails de acesso (convite, recuperar senha, confirmar e-mail) passam pelo **gancho de envio do Supabase Auth** (`GOTRUE_HOOK_SEND_EMAIL`; GoTrue 2.196.0 do kit suporta; na homologação, configurado no painel do Supabase Cloud), com **chamada assinada por segredo**, link **direto no domínio da marca** (`token_hash`) e envio pelo Resend. **Se o gancho falhar o e-mail não sai**: o usuário vê "não conseguimos enviar, tente de novo" com reenvio travado por tempo; a falha vira alerta no Sentry e linha no log de eventos. Sem plano B que envie e-mail sem marca.
- **D-07** (P7) Precedência **organização > marca > plataforma > padrão do produto**. Antes do login (login, cadastro, e-mails de acesso, erro, nome do app) vale **só a marca**; dentro do app, a personalização da organização vale por cima da marca (nada do que existe é retirado). Chave `permite_personalizacao` por marca (padrão ligada). O PDF de LGPD segue **sem marca**. O resolvedor continua a **nunca lançar**.
- **D-08** (P8) **Só o admin da plataforma cadastra domínio** (`/admin`). O Caddy usa `on_demand_tls { ask }`: o app só aprova se o domínio está **ativo, ligado a marca ativa, com DNS já apontando para o IP da VPS** e dentro do **limite de emissões por hora** (proteção contra o teto do Let's Encrypt). O endereço de pergunta é **interno** e exige **segredo compartilhado**. Domínio único (`unique`, cadastro idempotente); remoção ou marca inativa = "não", sem renovação, marca padrão para quem acessar. Toda criação, alteração ou remoção entra no log de auditoria.
- **D-09** (P9) Prova de pronto **na homologação, pela tela**, com três endereços (marca padrão, marca de teste em subdomínio e um domínio próprio de teste): login com a marca certa, e-mail de acesso com a marca e o link no mesmo endereço, lista de organizações filtrada por marca. Provas técnicas: **testes de isolamento** (2 marcas, 2 organizações, 1 e-mail nas duas; admin do parceiro só vê as marcas dele por RLS), `MARCAS_POR_DOMINIO=off` devolve o comportamento de hoje, host desconhecido cai na marca padrão, domínio removido deixa de receber certificado, cadastro fechado responde "por convite". Produção recebe só a marca padrão. Evidências em `docs/solucao-crm/evidencias/002-marcas/`.

## Fora de escopo

- Cobrança, trial, checkout e qualquer chamada ao Asaas (subprojeto 2); repasse financeiro, split e subcontas de parceiro.
- **Conteúdo** dos pacotes verticais Corretor e Nutricionista (subprojetos 8 e 9); só a estrutura e o mecanismo de cópia entram aqui.
- Telas do nível parceiro (só tabelas, papel "admin do parceiro" e políticas RLS) e cadastro de domínio por marca ou parceiro.
- Domínio de envio de e-mail próprio por marca; certificado curinga por DNS.
- Cadastro público aberto (a chave existe, desligada); abuso/antispam de cadastro.
- App mobile: só guardar os identificadores de app por marca como campos; nenhum build ou tela (subprojeto 7).
- Mudanças na Inbox, canal de e-mail IMAP/SMTP, agenda e agente de IA (subprojetos 3 a 6).
- Alterar o PDF de LGPD, o `CLAUDE.md` ou `AGENTS.md` do upstream.

## Riscos e premissas

- **Let's Encrypt:** teto de 50 certificados por semana por domínio registrado e demora na primeira visita de um domínio novo; mitigado pela trava de emissões por hora e por validar poucos domínios.
- **DNS e Resend dependem do dono:** criar os registros SPF e DKIM na Hostinger, verificar o domínio de envio no Resend e apontar o domínio de teste para a VPS. Guio os cliques quando chegar a hora.
- **Gancho de e-mail:** o compose do kit (`supabase-single-server.override.yml`) precisa passar a expor as variáveis `GOTRUE_HOOK_SEND_EMAIL_*`; mudança no kit exige a doutrina 15 (chegar a quem já instalou, variável nova com padrão que não quebra `.env` antigo) e `pnpm test:shell`. Na homologação (Supabase Cloud) o gancho é configurado à mão no painel.
- **Segredos novos:** segredo do gancho e segredo da pergunta do Caddy vão no `.env` da VPS e nos Secrets, nunca no chat.
- **Cache do host → marca:** uma instância só, então cache em memória com validade curta e invalidação no CRUD; erro do cache nunca derruba a página (cai na marca padrão).
- **Migração e baseline:** toda mudança de schema sai como migration versionada **e** apêndice idempotente no `baseline.sql`; função nova em `public` revoga `PUBLIC` e `anon`; teste de isolamento obrigatório.
- **Premissas:** o DNS curinga `*.corretora.io` já aponta para a VPS e o Caddy do CRM é o único dono de 80/443; a produção (`app.corretora.io`) tem hoje uma instalação e organizações sem marca; Resend gratuito (3.000 e-mails/mês) basta para o lançamento; o e2e completo só roda por disparo manual (A-07) e será disparado antes de entregar; a prova pela tela exige o dono para o domínio de teste e para conferir o e-mail recebido.
