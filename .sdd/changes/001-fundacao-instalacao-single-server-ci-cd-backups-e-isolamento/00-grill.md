# Grill: Fundação: instalação single-server, CI/CD, backups e isolamento

> Mudança `001-fundacao-instalacao-single-server-ci-cd-backups-e-isolamento` · porte L · 2026-10-22
> Interrogatório técnico antes de qualquer requisito ou código. Uma pergunta por vez, sempre com
> uma resposta recomendada. O que o código responde, o agente descobre sozinho em vez de perguntar.

## Pedido original

"TAREFA 6: abra o subprojeto 0 (Fundação, porte L) com /sdd:new. O escopo é a linha 0 da tabela da
seção 12 da spec: fork, limpeza da VPS (já feita), instalação single-server, CI/CD, backups e
isolamento do Claude Code na VPS. No Grill, resolva as validações V-4 [...] e V-5 [...]."

Insumos: `docs/solucao-crm/specs/2026-10-21-crm-autonomos-design.md` (spec; D-xx não se rediscutem),
`docs/solucao-crm/setup/guia-de-setup.md`, `docs/solucao-crm/setup/diagnostico-vps-2026-10-21.md`.

## Contexto levantado no código

- Fork (cópia privada) e limpeza da VPS: **já feitos** (tarefas 3 e 4). Ficam fora desta mudança.
- Instalador single-server: `hostgator-setup-kit/install-single-server.sh` + `docker-compose.single-server.yml`
  + `Caddyfile.single-server`. Aceita `REVERSE_PROXY=caddy` (padrão: o Caddy do kit publica 80/443) ou
  `REVERSE_PROXY=traefik` (atrás de um Traefik existente). **Recusa `cloudflared`** no single-server
  (`install-single-server.sh:111`). **Não há modo "atrás de um Caddy existente".**
- `Caddyfile.single-server` publica um domínio só: rotas do Supabase → `supabase-envoy:8000`; o resto → `app:3000`.
  Tem **ponto de extensão** `import /etc/caddy/sites/*.caddy` (pasta `caddy-sites/`) para publicar
  **outros serviços da mesma VPS** sem editar o arquivo do kit (#2724).
- TLS sob demanda para domínios de marca (spec 5.2.2) é recurso nativo do Caddy (`on_demand_tls` + `ask`);
  é implementado no subprojeto 1, mas exige que o dono de 443 seja um Caddy que consulte o app.
- VPS (diagnóstico): KVM4, 4 vCPU, 15 GB RAM sem swap, 193 GB disco (13 usados). 80/443 hoje: Caddy do
  `vava` (`valesca_almeida_website`, site `valescaalmeida.com`, rede `vava_network`). `vava` tem
  modificações locais não enviadas em `/opt/vava/Caddyfile` e `deploy.sh`. Porta 8000 aberta no ufw, sem uso.
  Usuários: `root`, `dev` (sem Docker). `deploy` ainda não existe.
- Constituição: doutrina do `CLAUDE.md` prevalece — imagens publicadas pelo CI no GHCR, nada de
  `build:` na VPS, `up -d` com os arquivos de compose corretos, checar `/` = 200 e `/app` = 307 após deploy.

## Perguntas e respostas

### P0a. O instalador single-server suporta ficar atrás de um Caddy existente (opção 3 do diagnóstico)?
- Fonte: `hostgator-setup-kit/install-single-server.sh:106-111,202` e `install.sh:1139-1264` — só `caddy`
  (dono de 80/443) e `traefik` (atrás de Traefik). Logo a opção 3 não se aplica ao Caddy do vava sem
  reescrever o kit.

### P0b. O kit permite publicar outro site (o vava) pelo próprio Caddy, sem editar arquivo do kit?
- Fonte: `Caddyfile.single-server:25-40` — sim, por arquivo em `caddy-sites/*.caddy`.

### P1. Quem será o dono único das portas 80/443 (V-4)?
- Recomendação do agente: **opção 1 — o Caddy do kit vira o dono único**, e o vava passa a ser
  publicado por um arquivo em `caddy-sites/` (o container do vava continua rodando, só deixa de
  publicar 80/443 e entra numa rede compartilhada). Motivos: (a) é o modo padrão e testado do kit, que
  atualiza sem conflito; (b) o TLS sob demanda das marcas (subprojeto 1) precisa de um Caddy que
  consulte o nosso app — no Caddy do vava isso acoplaria o CRM a um repositório alheio que já tem
  alterações locais não enviadas; (c) a opção 3 não existe para Caddy. Custo: uma mudança pequena no
  vava (tirar `ports` e servir HTTP interno), que só acontece com seu ok e com janela curta de site fora
  do ar (~1 min). Alternativa: opção 2 (Caddy do vava dono, encaminhando o CRM), que exigiria copiar
  as rotas do Supabase e, depois, o TLS sob demanda para dentro do Caddyfile do vava.
- Resposta: "Podemos colocar o caddy vava em outras portas, se sim, podemos migrar e configurar o github
  também para deployar em outra porta." → Opção 1 aceita: o Caddy do kit é o dono único de 80/443; o
  Caddy do vava sai de 80/443 e passa a servir só HTTP interno, recebendo o tráfego do Caddy do kit; o
  deploy do vava pelo GitHub é ajustado para essa nova publicação. Refinamento do agente (registrado):
  em vez de porta aberta no host, o vava publica em `127.0.0.1` ou só na rede Docker compartilhada,
  porque porta publicada pelo Docker **ignora o ufw** e ficaria exposta na internet.

### P2. O modo single-server cabe no KVM4 junto com vava, homologação e Claude Code (V-5)?
- Recomendação do agente: **sim, com três condições.** Estimativa de RAM em uso normal: Supabase
  self-hosted ~3–4 GB; app + worker + scheduler ~1,5–2 GB; WAHA ~0,5 GB + ~150 MB por sessão; Redis
  ~0,1 GB; homologação `crm-hml` (app + worker + WAHA + Redis, banco no Supabase Cloud) ~2 GB; vava
  ~0,1 GB; Claude Code ~1–2 GB. Total ~9–11 GB de 15 GB. Condições: (a) criar **swap de 4 GB** (hoje
  não há swap; sem ela um pico mata processos sem aviso); (b) **limites de memória e CPU** por container
  de produção e homologação, com produção priorizada; (c) **gatilho para VPS dedicada**: RAM disponível
  abaixo de 2 GB por mais de um dia, ou primeiro cliente pagante (já previsto na spec). Desligar o
  `voice-agent` se não for usado no MVP.
- Resposta: "Sim" (aceita a recomendação: swap de 4 GB, limites por container com produção priorizada,
  gatilho para VPS dedicada, `voice-agent` desligado).

### P3. Em qual serviço fica a cópia externa do backup (D-11)?
- Recomendação do agente: **Cloudflare R2.** Sem cobrança por download (importante no dia em que for
  preciso restaurar), 10 GB grátis, e fala o protocolo S3 que o kit já usa. Desvantagem: pode pedir cartão
  no cadastro. Alternativa: Backblaze B2 (10 GB grátis, também S3, cadastro sem cartão, mas cobra pelo
  download acima da franquia). Em qualquer um: o arquivo é **criptografado antes de sair da VPS**, com
  chave guardada só no seu gerenciador de senhas, e o bucket é privado.
- Resposta: "R2" (Cloudflare R2, com criptografia antes do envio e bucket privado).

### P4. Como o Claude Code pode agir na VPS (isolamento, seção 2.5 do guia)?
- Recomendação do agente: **produção só muda pelo pipeline (PR → merge → você aprova no GitHub →
  deploy), nunca por comando direto do Claude Code.** Na VPS o Claude Code usa o usuário `dev`, que
  continua **sem** grupo `docker` e sem leitura de `/opt/crm-prod` nem dos `.env`. Para diagnosticar, ele
  ganha só um atalho **somente leitura** (ver estado e logs dos containers, sem ver segredos). Ações
  administrativas (swap, firewall, mover o vava, restaurar backup) são feitas por mim com `root`
  **somente depois de mostrar o comando e você dizer "ok"**, uma vez, e ficam registradas no repositório
  como script. Homologação (`crm-hml`) também só muda pelo pipeline.
- Resposta: "Sim" (aceita a recomendação).

### P5. Como reverter um deploy ruim em menos de 2 minutos, já que o banco muda junto?
- Recomendação do agente: **rollback = voltar a imagem anterior (número de versão fixo, nunca `latest`),
  automático quando a verificação de saúde falhar** (`/` responde 200 e `/app` responde 307, como manda
  o `CLAUDE.md`). Isso só é seguro se toda migration for **compatível com a versão anterior do app**
  (adicionar coluna/tabela, nunca apagar ou renomear no mesmo deploy; remoção vem num deploy posterior).
  A doutrina de migrations do repositório já é idempotente e só avança, então isto vira regra de revisão
  do PR. **Restaurar o backup do banco fica só para desastre** (dado corrompido), não para rollback
  comum, porque demora e perde o que entrou depois do backup. Antes de cada deploy em produção o
  pipeline tira um backup (já previsto na spec 10.2).
- Resposta: "Sim" (aceita a recomendação).

### P6. Como evitar que o CI herdado do DeskcommCRM consuma todos os minutos do GitHub?
- Fonte (levantado): `.github/workflows/` tem 9 workflows. `ci.yml` (675 linhas, matriz de majors do
  Postgres), `e2e.yml` (partes de até 30 min cada) e `publish-image.yml` (imagens amd64 **e** arm64)
  rodam em `ubuntu-latest`. Repositório privado em plano gratuito tem cota mensal de minutos
  (2.000 no Free, 3.000 no Pro); o upstream usa executor próprio para aliviar isso.
- Recomendação do agente: **não rodar tudo em todo PR.** Manter obrigatórios no PR só `verify`
  (typecheck, lint, unit) e `invariants` com **uma** versão do Postgres (a que o Supabase self-hosted usa);
  e2e completo e matriz cheia só na `main`/antes de produção; imagem só **amd64** (a VPS é x86; o arm64
  fica desligado, o que também reabre a regra de packaging do `CLAUDE.md` como decisão registrada).
  Desligar os workflows que não servem a nós (`acolhida`, `relogio`, `mysql-integracao`, `release` do
  upstream). Medir o consumo do primeiro mês e revisar. Alternativa: manter tudo e pagar minutos extras
  (você pediu sem custo extra).
- Resposta: "Seguimos com sua recomendação" (recorte do CI; imagem só amd64 registrada como divergência
  consciente da doutrina de packaging do `CLAUDE.md`).

### P7. Qual domínio e quais endereços usaremos (produção, homologação)?
- Recomendação do agente: um domínio **só do produto** (não o `valescaalmeida.com` do vava), com
  produção em `app.<dominio>` e homologação em `hml.<dominio>`, e o DNS curinga `*.<dominio>` já
  apontando para a VPS para as marcas futuras. O `valescaalmeida.com` continua como está, servido
  pelo Caddy do CRM. Se o domínio ainda não existe, registrar antes de instalar (Registro.br ou
  Hostinger). Preciso do **nome** do domínio (não é segredo) e de onde o DNS dele é gerenciado.
- Resposta: "corretora.io por enquanto vamos usar esse. Está registrado na Hostinger." (domínio `corretora.io`, DNS na Hostinger; estrutura `app.`/`hml.`/curinga aceita junto).

## Decisões

- **D-01** (V-4) O Caddy do kit (`Caddyfile.single-server`) é o **dono único** de 80/443. O Caddy do vava sai dessas portas e serve só HTTP interno (127.0.0.1 ou rede Docker compartilhada, nunca porta pública, pois o Docker ignora o ufw); o Caddy do kit o publica por um arquivo em `caddy-sites/`. O deploy do vava pelo GitHub é ajustado. Antes de mexer, cópia dos arquivos do vava, incluindo as alterações locais não enviadas. Só com "ok" do dono.
- **D-02** (V-5) Single-server cabe no KVM4 junto com vava, homologação e Claude Code (estimativa 9–11 GB de 15 GB, a medir na VPS). Condições: swap de 4 GB; limites de memória/CPU por container com produção priorizada; `voice-agent` desligado; gatilho para VPS dedicada (memória livre < 2 GB por mais de um dia, ou primeiro cliente pagante).
- **D-03** Backup externo no **Cloudflare R2**, bucket privado, arquivo criptografado antes de sair da VPS, chave só no gerenciador de senhas do dono. Cobre banco, sessões do WhatsApp e Storage.
- **D-04** Produção e homologação só mudam pelo pipeline (PR → merge → aprovação no GitHub → deploy). O Claude Code usa o usuário `dev`, sem Docker nem leitura de `/opt/crm-prod` e dos `.env`; tem atalho somente leitura (estado e logs, sem segredos). Ações de administrador (swap, firewall, mover o vava, restaurar backup) só com comando mostrado e "ok", e ficam como script no repositório.
- **D-05** Rollback = voltar a imagem anterior (versão fixa, nunca `latest`), automático se a verificação de saúde falhar (`/` = 200 e `/app` = 307). Toda migration é compatível com a versão anterior do app (só adicionar no mesmo deploy). Restaurar backup é só para desastre. Backup antes de cada deploy em produção. Meta: < 2 minutos.
- **D-06** CI enxuto: no PR só `verify` e `invariants` com uma versão do Postgres (a do Supabase self-hosted); e2e completo e matriz cheia só na `main`/antes de produção; imagem só amd64 (divergência consciente do CLAUDE.md, registrada); desligar `acolhida`, `relogio`, `mysql-integracao` e `release` do upstream; medir o consumo no primeiro mês.
- **D-07** Domínio `corretora.io` (Hostinger): produção em `app.corretora.io`, homologação em `hml.corretora.io`, DNS curinga `*.corretora.io` para as marcas futuras. `valescaalmeida.com` segue como está, servido pelo Caddy do CRM.
- **D-08** Ambientes: `crm-prod` (Supabase self-hosted, single-server) e `crm-hml` (Supabase Cloud Free), conforme a spec 10.1.

## Fora de escopo

- Marcas, domínios dinâmicos e TLS sob demanda (subprojeto 1); só garantimos que o dono de 443 é um Caddy capaz disso.
- Billing/Asaas, canais, agenda, agente, mobile e pacotes verticais (subprojetos 2 a 9).
- Alterar o conteúdo ou a aparência do site do vava; só muda como ele é publicado.
- Mudar a VPS sem "ok" do dono; segredos no chat; `push --force`; trabalhar direto na `main`.
- Snapshot semanal da VPS, teste mensal de restauração automatizado e VPS dedicada (camada 2 da spec 10.3): só o gatilho fica definido.
- Workflow de sincronização semanal com o upstream (fica para depois da fundação).

## Riscos e premissas

- **Premissa:** o planejamento do dono mora em `docs/solucao-crm/` (spec, guia e diagnóstico) e vale integralmente; a pasta `docs/` restante é documentação do DeskcommCRM upstream, consultada por subprojeto quando o assunto pedir (ex.: `docs/saas/coolify.md`, `docs/runbooks/deploy.md` na implementação deste). Se existir outro planejamento do dono fora do repositório, ele deve ser trazido para `docs/solucao-crm/` antes do subprojeto a que se refere.
- **Premissa:** os números de memória do D-02 são estimativas; a primeira tarefa de implementação mede o uso real antes de instalar.
- **Risco:** trocar o dono de 80/443 deixa o site do vava fora do ar ~1 min. Mitigação: cópia prévia, janela combinada, reversão documentada.
- **Risco:** o `/opt/vava` tem alterações locais não enviadas ao GitHub; um deploy do vava antes da cópia pode sobrescrevê-las.
- **Risco:** Supabase Cloud Free pausa o projeto após 1 semana sem uso (homologação); reativar pelo painel.
- **Risco:** WAHA/anti-banimento e a cota de minutos do GitHub (D-06) podem exigir ajuste após medição.
- **Premissa:** o domínio é `corretora.io` (confirmado pelo dono). É o mesmo dos projetos antigos removidos; os registros DNS antigos (`app.`, `api.`) precisam ser revistos para apontar ao novo Caddy único.
- **Premissa:** a porta 8000 do ufw, sobra de projeto antigo, será fechada junto com o ajuste do firewall (com "ok").
