# PRD: Fundação: instalação single-server, CI/CD, backups e isolamento

> Mudança `001-fundacao-instalacao-single-server-ci-cd-backups-e-isolamento` · porte L · 2026-10-22
> O QUÊ e o PORQUÊ. Nada de como implementar. Derivado de `00-grill.md`.

## Problema

O produto (CRM para autônomos, spec `docs/solucao-crm/specs/`) ainda não tem onde rodar. A VPS está limpa, mas hoje o Caddy do projeto `vava` ocupa as portas 80/443, não existe ambiente de produção nem de homologação, não há deploy automático, não há backup (e o banco de produção ficará dentro da própria VPS) e o Claude Code roda no mesmo servidor sem fronteira de acesso. Sem esta fundação nenhum subprojeto seguinte (1 a 9) pode ser entregue com segurança. Quem sente: o dono do produto (leigo em infraestrutura) e, depois, os clientes. Custo de não resolver: perder a VPS sem cópia externa é irrecuperável; um deploy ruim derruba clientes; um erro do Claude Code atinge a produção.

## Objetivos e métricas

- **O1** Produção (`app.corretora.io`) e homologação (`hml.corretora.io`) no ar, com HTTPS, na VPS atual.
- **O2** Um único dono de 80/443; o site do vava continua acessível.
- **O3** Deploy automático em homologação e deploy em produção com aprovação humana.
- **O4** Rollback em menos de 2 minutos; perda máxima de 24 h de dados; restauração da VPS do zero em até 2 h (spec 10.3).
- **O5** Claude Code sem poder direto sobre a produção.
- **O6** Memória livre da VPS medida e com margem (≥ 2 GB livres em uso normal).
- **O7** Consumo de minutos do GitHub Actions dentro da cota gratuita.

## Personas e cenários

- **Dono do produto** (leigo em infraestrutura): aprova ações na VPS e deploys de produção pelo botão do GitHub; recebe passos exatos de painel.
- **Claude Code / desenvolvedor**: abre PR, vê logs de leitura, nunca altera produção diretamente.
- **Visitante do vava** (`valescaalmeida.com`): continua vendo o site, sem perceber a troca.
- **Cliente futuro**: usa `app.corretora.io` sem indisponibilidade causada por manutenção evitável.

## Requisitos funcionais

### REQ-001: Dono único das portas 80 e 443

Como dono do produto, quero que um único serviço atenda 80/443 para que o CRM e o vava convivam sem disputa de porta.

- **AC-001.1** Dado o ambiente instalado, quando se lista o que escuta 80 e 443 na VPS, então só o Caddy do CRM aparece como dono dessas portas.
- **AC-001.2** Dado o vava reconfigurado, quando se acessa `https://valescaalmeida.com`, então o site responde 200 com o mesmo conteúdo de antes.
- **AC-001.3** Dado o vava reconfigurado, quando se tenta alcançar a porta interna do vava a partir da internet, então a conexão é recusada (não há porta do vava aberta ao público).
- **AC-001.4** QUANDO a troca de dono das portas for executada o sistema DEVE ter antes uma cópia dos arquivos do vava (incluindo alterações locais não enviadas ao GitHub) e um procedimento de reversão documentado.
- **AC-001.5** Dada a troca em andamento, quando o site do vava fica fora do ar, então a indisponibilidade medida é de no máximo 5 minutos.

### REQ-002: Produção single-server no ar

Como dono do produto, quero o CRM de produção instalado para ter onde operar os clientes.

- **AC-002.1** Dado o instalador concluído, quando se acessa `https://app.corretora.io/`, então responde 200 e `https://app.corretora.io/app` responde 307.
- **AC-002.2** Dado a produção no ar, quando se consulta `/api/v1/health`, então Supabase, Redis e WAHA constam como saudáveis.
- **AC-002.3** Dado o Supabase self-hosted, quando se tenta acessar o Studio e o Postgres pela internet, então não respondem (só por túnel).
- **AC-002.4** Dado o `.env` de produção, quando se inspecionam os serviços, então o `voice-agent` está desligado.
- **AC-002.5** Dado o instalador, quando falta variável crítica ou DNS, então ele falha com mensagem em português que diz o que fazer, sem deixar instalação pela metade.

### REQ-003: Homologação separada

Como desenvolvedor, quero um ambiente de homologação isolado da produção para validar antes de aprovar.

- **AC-003.1** Dado o ambiente `crm-hml`, quando se acessa `https://hml.corretora.io/`, então responde 200.
- **AC-003.2** Dado `crm-hml` e `crm-prod`, quando se inspecionam bancos e `.env`, então não compartilham banco, credenciais nem volumes.
- **AC-003.3** Dado `crm-hml`, quando se verifica o banco, então ele é o Supabase Cloud (plano gratuito) e não o da VPS.

### REQ-004: Pipeline de CI enxuto

Como desenvolvedor, quero um CI que caiba na cota gratuita para não ficar sem minutos.

- **AC-004.1** Dado um PR, quando o CI roda, então executa `verify` e `invariants` com uma só versão do Postgres e não executa o e2e completo nem a matriz cheia.
- **AC-004.2** Dado um merge na `main`, quando o CI roda, então executa também o e2e completo.
- **AC-004.3** Dado o repositório, quando se listam os workflows ativos, então `acolhida`, `relogio`, `mysql-integracao` e `release` do upstream estão desligados.
- **AC-004.4** Dado o CI, quando publica imagens, então publica apenas linux/amd64 e a divergência da regra de packaging está registrada.
- **AC-004.5** Dado um mês de uso, quando se mede o consumo de minutos, então fica registrado e comparado à cota (2.000/3.000 min).

### REQ-005: Deploy em homologação e em produção com aprovação

Como dono do produto, quero que produção só mude depois da minha aprovação para evitar surpresas.

- **AC-005.1** Dado um merge na `main`, quando as imagens estão publicadas, então o deploy em homologação acontece sozinho e um teste de fumaça confirma `/` = 200 e `/app` = 307.
- **AC-005.2** Dado o ambiente `producao` no GitHub, quando um deploy é disparado, então fica parado até o dono aprovar.
- **AC-005.3** Dado o deploy, quando executa, então usa número de versão fixo da imagem, nunca `latest`.
- **AC-005.4** Dado um PR de fork ou de terceiro, quando o CI roda, então nenhum segredo de deploy fica acessível.
- **AC-005.5** Dado dois deploys disparados quase juntos, quando executam, então o segundo espera o primeiro (nunca dois ao mesmo tempo no mesmo ambiente).

### REQ-006: Rollback automático e backup antes do deploy

Como dono do produto, quero que um deploy ruim volte sozinho para a versão anterior em menos de 2 minutos.

- **AC-006.1** Dado um deploy em produção, quando começa, então um backup é tirado antes e seu resultado fica registrado.
- **AC-006.2** QUANDO a verificação de saúde (`/` = 200 e `/app` = 307) falhar após o deploy o sistema DEVE voltar à imagem anterior sozinho.
- **AC-006.3** Dada uma falha provocada em homologação, quando o rollback acontece, então a versão anterior volta a responder em menos de 2 minutos medidos.
- **AC-006.4** Dado um PR com migration, quando revisado, então a regra "migration compatível com a versão anterior do app" é conferida (item no checklist do PR).

### REQ-007: Backup diário com cópia externa criptografada

Como dono do produto, quero cópia externa diária do banco, das sessões do WhatsApp e do Storage para sobreviver à perda da VPS.

- **AC-007.1** Dado o agendador, quando chega o horário diário, então é gerado backup do banco, das sessões do WhatsApp e do Storage.
- **AC-007.2** Dado um backup gerado, quando é enviado ao Cloudflare R2, então o arquivo está criptografado antes de sair da VPS e o bucket é privado.
- **AC-007.3** Dado o bucket, quando se tenta ler um objeto sem credencial, então o acesso é negado.
- **AC-007.4** Dado um backup externo, quando se executa a restauração em ambiente descartável usando só a chave guardada no gerenciador de senhas, então o CRM sobe com os dados do backup.
- **AC-007.5** QUANDO um backup ou envio falhar o sistema DEVE alertar o dono (Sentry ou e-mail) no mesmo dia.
- **AC-007.6** Dado o histórico, quando passam 14 dias, então só os 14 backups mais recentes locais são mantidos; a retenção externa fica registrada.

### REQ-008: Isolamento do Claude Code

Como dono do produto, quero que o Claude Code não consiga alterar nem ler a produção diretamente.

- **AC-008.1** Dado o usuário do Claude Code (`dev`), quando tenta executar `docker ps`, então é negado (sem grupo `docker`).
- **AC-008.2** Dado o usuário do Claude Code, quando tenta ler `/opt/crm-prod` e os arquivos `.env`, então é negado.
- **AC-008.3** Dado o atalho somente leitura, quando o Claude Code consulta estado e logs, então obtém a informação sem que apareçam segredos.
- **AC-008.4** Dado o usuário `deploy`, quando usado fora do pipeline, então só aceita a chave de deploy e não tem shell de uso geral além do necessário ao deploy.
- **AC-008.5** Dada qualquer ação administrativa na VPS, quando executada, então existe como script no repositório, foi mostrada ao dono antes e aprovada.

### REQ-009: Limites de recursos e memória de reserva

Como dono do produto, quero que homologação ou Claude Code nunca sufoquem a produção.

- **AC-009.1** Dada a VPS, quando se consulta a memória, então existe swap de 4 GB ativo e persistente após reinício.
- **AC-009.2** Dados os containers de produção e homologação, quando se inspecionam, então todos têm limite de memória e CPU, e a produção tem prioridade.
- **AC-009.3** Dada a produção em uso normal, quando se mede a memória por 24 h, então a memória disponível fica registrada e ≥ 2 GB.
- **AC-009.4** QUANDO a memória disponível ficar abaixo de 2 GB por mais de um dia o sistema DEVE alertar o dono de que é hora da VPS dedicada.
- **AC-009.5** Dada a memória medida antes da instalação, quando comparada à estimativa do Grill (9–11 GB), então a diferença fica registrada.

### REQ-010: Domínio, DNS e firewall

Como dono do produto, quero endereços e portas corretos para acessar o sistema com segurança.

- **AC-010.1** Dado o DNS, quando se resolvem `app.corretora.io`, `hml.corretora.io` e um subdomínio qualquer, então todos apontam para o IP da VPS.
- **AC-010.2** Dado o firewall, quando se listam as portas abertas, então só 22, 80 e 443 (TCP, e 443/UDP se exigido pelo Caddy) estão abertas; a 8000 está fechada.
- **AC-010.3** Dada qualquer porta publicada por container, quando se verifica pela internet, então nenhuma além de 80/443 responde (o Docker não fura o firewall).
- **AC-010.4** Dados os registros antigos de `app.` e `api.corretora.io`, quando revistos, então ficam apontando para o novo Caddy ou removidos.

### REQ-011: Monitoramento básico

Como dono do produto, quero ser avisado quando o sistema cair.

- **AC-011.1** Dado o monitor de disponibilidade em `/api/v1/health` de produção, quando o sistema fica fora do ar, então o dono recebe alerta no celular.
- **AC-011.2** Dado o Sentry configurado, quando ocorre um erro de teste em homologação, então ele aparece no Sentry sem dados sensíveis.

## Requisitos não funcionais

- **Segurança:** segredos só em Secrets do GitHub e `.env` da VPS; nunca em código, log, spec ou chat (provado por varredura de segredos no CI, ver AC abaixo).
- **Reprodutibilidade:** a VPS pode ser refeita do zero em até 2 h a partir do repositório + backup + chaves do gerenciador de senhas (AC-007.4).
- **Observabilidade:** deploys, backups e rollbacks deixam registro legível.
- **Compatibilidade:** atualizações do kit upstream não exigem editar arquivos do kit à mão (customização por arquivos próprios, como `caddy-sites/`).

### REQ-012: Nenhum segredo vaza

Como dono do produto, quero garantia de que chaves não vão para o repositório nem para logs.

- **AC-012.1** Dado um PR, quando o CI roda, então uma varredura de segredos reprova se achar chave, token ou senha no diff.
- **AC-012.2** Dado o log de um deploy ou backup, quando inspecionado, então não contém valores de segredos.

## Fora de escopo

- Marcas, domínios dinâmicos e TLS sob demanda (subprojeto 1).
- Billing/Asaas, canais, agenda, agente, mobile e pacotes verticais (subprojetos 2 a 9).
- Alterar conteúdo ou aparência do site do vava.
- Snapshot semanal da VPS, teste mensal de restauração automatizado e VPS dedicada (camada 2 da spec 10.3); só o gatilho (AC-009.4) entra.
- Workflow semanal de sincronização com o upstream.
- Mudar a VPS sem "ok" do dono, `push --force`, trabalhar direto na `main`, colar segredos no chat.

## Dependências e riscos

- **Contas e acessos do dono:** GitHub (ambientes e Secrets), Cloudflare R2 (bucket e token), Supabase Cloud (homologação), Resend, Sentry, UptimeRobot, DNS na Hostinger.
- **Risco:** a troca de dono de 80/443 derruba o vava por minutos; mitigação: cópia prévia, janela combinada, reversão (AC-001.4, AC-001.5).
- **Risco:** `/opt/vava` tem alterações locais não enviadas ao GitHub.
- **Risco:** Supabase Cloud Free pausa após 1 semana sem uso.
- **Risco:** estimativas de memória não medidas (AC-009.5).
- **Risco:** cota de minutos do GitHub (AC-004.5).
- **Premissa:** `corretora.io` é o domínio, com DNS na Hostinger.
