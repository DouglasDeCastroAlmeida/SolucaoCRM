# PRD: Marcas, parceiros e domínios

> Mudança `002-marcas-parceiros-e-dominios` · porte L · 2026-10-25
> O QUÊ e o PORQUÊ. Nada de como implementar. Derivado de `00-grill.md`.

## Problema

O produto é um CRM whitelabel para profissionais autônomos de várias profissões (Corretor, Nutricionista e outras), mas hoje o fork só conhece **uma** marca por instalação (`platform_branding`, linha única) e uma personalização por organização. Nada resolve a marca **pelo endereço** que o usuário digitou: o desvio por host do `proxy.ts` é inerte, não existe tabela de marcas, parceiros ou domínios, o Caddy não emite HTTPS sob demanda, e os e-mails de acesso saem sempre com a identidade da instalação. Sem isto, não dá para vender o mesmo CRM com a cara de cada profissão, nem para os subprojetos de cobrança (2), pacotes verticais (8 e 9) e app mobile (7) saberem "de qual marca é esta conta".
Quem sente: o dono da plataforma (precisa operar várias marcas num só sistema) e, depois, cada autônomo (precisa ver o produto com a identidade da sua profissão). Custo de não resolver: ou um produto genérico, ou uma instalação separada por marca (mais VPS, mais manutenção, mais custo).

## Objetivos e métricas

- **O1** O endereço acessado define a marca: login, cadastro e e-mails mostram nome, logo e cor da marca certa em 100% dos casos testados.
- **O2** Zero vazamento entre marcas: um usuário nunca vê organização, marca ou dado de outra marca pelo domínio errado (provado por teste de isolamento).
- **O3** Nada muda para quem já usa: a produção atual (`app.corretora.io`) continua com a mesma aparência e o mesmo comportamento, e a chave `MARCAS_POR_DOMINIO=off` devolve o comportamento anterior em menos de 2 minutos.
- **O4** Domínio próprio de marca com HTTPS automático e sem abuso: nenhum certificado é emitido para domínio não cadastrado, e o limite por hora protege a cota do Let's Encrypt.
- **O5** E-mails de acesso com a marca e o link no domínio da marca, com falha visível (nunca silenciosa).
- **O6** Custo zero adicional: Resend gratuito, DNS curinga e infraestrutura já existentes.

## Personas e cenários

- **Dono da plataforma (admin da plataforma):** cria marcas, domínios, planos e pacotes no painel `/admin`; acompanha todas as contas; faz suporte auditado; liga e desliga o cadastro de cada marca.
- **Autônomo (usuário de uma marca):** entra em `corretor.corretora.io` e vê a identidade da marca Corretor; recebe convite e e-mail de senha com essa identidade.
- **Usuário com contas em duas marcas:** entra por uma marca e vê só as organizações dela.
- **Admin do parceiro (futuro):** existe só como papel e políticas de banco; sem telas neste subprojeto.
- **Visitante de domínio desconhecido:** vê a marca padrão da plataforma.

## Requisitos funcionais

### REQ-001: Resolver a marca pelo endereço acessado

Como dono da plataforma, quero que o endereço acessado defina a marca para que cada profissão tenha a sua identidade no mesmo sistema.

- **AC-001.1** Dado um domínio ativo ligado a uma marca ativa, quando alguém abre a tela de login nesse endereço, então o nome, o logo e a cor exibidos são os dessa marca.
- **AC-001.2** Dado um host que não está na tabela de domínios, quando alguém abre qualquer página pública, então a marca padrão da plataforma é exibida.
- **AC-001.3** Dado um domínio removido, desativado ou ligado a marca inativa, quando alguém o acessa, então a marca padrão é exibida.
- **AC-001.4** QUANDO a consulta de marca por host falhar (banco lento ou fora, cache corrompido) o sistema DEVE exibir a marca padrão, nunca uma página de erro 500, e registrar o motivo da degradação.
- **AC-001.5** Dado que o admin da plataforma altera ou remove um domínio no painel, quando a alteração é salva, então a resolução passa a refletir a mudança em até 60 segundos.

### REQ-002: Compatibilidade, chave de desligamento e rollback

Como dono da plataforma, quero poder desligar o recurso e voltar ao comportamento atual rapidamente para não arriscar os clientes que já usam.

- **AC-002.1** Dado `MARCAS_POR_DOMINIO=off` no ambiente, quando qualquer host é acessado, então a marca padrão é exibida e a tabela de domínios não é consultada.
- **AC-002.2** Dado um banco com organizações existentes, quando a migração roda, então existe uma marca padrão criada a partir da `platform_branding` atual (nome, logo e cor iguais) e todas as organizações existentes estão ligadas a ela, sem alterar nenhuma tela existente.
- **AC-002.3** Dado o banco já migrado, quando a imagem da versão anterior é implantada, então ela continua funcionando (migrações só aditivas, sem coluna ou tabela apagada ou renomeada).
- **AC-002.4** Dado que a migração foi aplicada, quando é aplicada de novo (instalação nova e atualização do kit), então nada se duplica nem falha.
- **AC-002.5** Dado `MARCAS_POR_DOMINIO=off`, quando o `app` é recriado, então o comportamento anterior volta em menos de 2 minutos (medido).

### REQ-003: Modelo de dados e isolamento entre marcas

Como dono da plataforma, quero a hierarquia Plataforma > Parceiro > Marca > Organização no banco com isolamento garantido.

- **AC-003.1** Dado um usuário de uma organização da marca A, quando consulta marcas, domínios, planos ou pacotes, então só enxerga o que a política permite para a sua marca (nunca os de B).
- **AC-003.2** Dado um usuário com o papel "admin do parceiro", quando consulta ou altera marcas, então só alcança as marcas do próprio parceiro (política de banco, sem tela).
- **AC-003.3** Dado um usuário comum de organização, quando tenta ler ou escrever as tabelas de parceiro, então a política de banco nega.
- **AC-003.4** Dado qualquer função nova no schema `public`, quando o banco é inspecionado, então `PUBLIC` e `anon` não têm `EXECUTE` sobre ela.
- **AC-003.5** Dado que alguém tenta trocar a marca de uma organização, quando não é admin da plataforma, então a operação é negada; quando é admin da plataforma, então ela é feita e registrada no log de auditoria.

### REQ-004: Identidade única com visão filtrada por marca

Como autônomo com contas em duas marcas, quero entrar por uma marca e ver só as organizações dela.

- **AC-004.1** Dado um e-mail com organizações nas marcas A e B, quando ele entra pelo domínio de A, então a lista mostra só as organizações de A.
- **AC-004.2** Dado esse mesmo usuário logado no domínio de A, quando abre o link direto de uma organização de B, então o acesso é negado sem revelar que a organização existe.
- **AC-004.3** Dado uma sessão iniciada no domínio de A, quando o usuário abre o domínio de B, então a sessão de A não vale em B (a sessão é do host) e o login de B é pedido.

### REQ-005: Login, cadastro e convite com a marca

Como autônomo, quero ver a identidade da minha marca em toda a entrada do produto.

- **AC-005.1** Dado o domínio de uma marca, quando alguém abre login, cadastro, recuperar senha ou uma página de erro, então a marca (nome, logo, cor) exibida é a dessa marca.
- **AC-005.2** Dado uma marca com `cadastro_aberto = false` (padrão), quando alguém abre o cadastro, então vê "cadastro por convite" e nenhuma conta ou organização é criada.
- **AC-005.3** Dado uma marca com `cadastro_aberto = true`, quando alguém conclui o cadastro no domínio dela, então a organização nasce ligada a essa marca, com os planos e a cópia do pacote vertical padrão da marca.
- **AC-005.4** Dado um convite aceito por link no domínio de uma marca, quando o cadastro é concluído, então a organização fica ligada à marca do convite.
- **AC-005.5** Dado o interior do app, quando a organização personalizou logo e cor, então essa personalização vale por cima da marca, exceto se a marca tem `permite_personalizacao = false`; antes do login vale só a marca.
- **AC-005.6** Dado o PDF de LGPD, quando é gerado em qualquer marca, então ele não leva marca nenhuma (regressão da doutrina do projeto).

### REQ-006: E-mails de acesso com a marca

Como autônomo, quero receber convite, confirmação e recuperação de senha com a identidade da minha marca.

- **AC-006.1** Dado um convite, uma confirmação ou uma recuperação de senha disparados no domínio de uma marca, quando o e-mail chega, então ele traz o nome do remetente, o logo e os textos da marca, e o link aponta para o mesmo domínio da marca.
- **AC-006.2** Dado uma chamada ao gancho de envio sem assinatura válida, quando chega ao app, então é rejeitada (401) e nenhum e-mail é enviado.
- **AC-006.3** QUANDO o envio falhar o sistema DEVE mostrar ao usuário "não conseguimos enviar, tente de novo em instantes", impedir novo envio por um intervalo (clique duplo não gera dois e-mails) e registrar a falha no Sentry e no log de eventos.
- **AC-006.4** Dado qualquer e-mail de acesso, quando o conteúdo é inspecionado, então não contém nome, logo ou domínio de outra marca.
- **AC-006.5** Dado o mesmo evento de e-mail entregue duas vezes pelo Supabase, quando o app o recebe, então envia um só e-mail.

### REQ-007: HTTPS sob demanda controlado

Como dono da plataforma, quero certificado automático só para domínios legítimos para não permitir abuso.

- **AC-007.1** Dado um domínio ativo, ligado a marca ativa e com DNS apontando para a VPS, quando o Caddy pergunta ao app, então a resposta é "sim".
- **AC-007.2** Dado um domínio desconhecido, inativo, de marca inativa ou sem DNS apontando para a VPS, quando o Caddy pergunta, então a resposta é "não" e nenhum certificado é pedido.
- **AC-007.3** Dado uma pergunta sem o segredo compartilhado ou vinda de fora da rede interna, quando chega ao app, então é recusada.
- **AC-007.4** Dado que o limite de emissões por hora foi atingido, quando o Caddy pergunta por um domínio novo, então a resposta é "não" e um alerta é registrado.
- **AC-007.5** Dado um domínio removido ou de marca desativada, quando o certificado vence, então ele não é renovado e o acesso passa a mostrar a marca padrão.
- **AC-007.6** Dado o ambiente de produção, quando o recurso é implantado, então o HTTPS sob demanda permanece desligado até a prova na homologação estar registrada.

### REQ-008: Painel da plataforma (marcas, domínios, planos, pacotes e contas)

Como dono da plataforma, quero operar tudo no `/admin` sem mexer no banco.

- **AC-008.1** Dado um admin da plataforma, quando cria, edita ou desativa uma marca (nome, logos claro e escuro, cores, ícone, domínios, remetente, contato de suporte, pacote padrão, `cadastro_aberto`, `permite_personalizacao`, identificadores de app), então a mudança é salva e refletida.
- **AC-008.2** Dado o cadastro de um domínio já existente, quando é enviado, então é rejeitado com mensagem clara, e repetir o clique não cria duplicata.
- **AC-008.3** Dado um admin da plataforma, quando cadastra um plano para uma marca (nome, limites, preço em centavos, ciclo), então ele é salvo sem acionar cobrança alguma.
- **AC-008.4** Dado um pacote vertical, quando uma organização é criada na marca que o usa, então o pacote é copiado para a organização e mudanças posteriores no pacote ou na organização não afetam o outro.
- **AC-008.5** Dado o painel, quando o admin lista as contas, então vê as organizações de todas as marcas, com a marca de cada uma, e pode abrir o acesso de suporte (impersonar) com a guarda de efeito já existente e registro na auditoria.
- **AC-008.6** Dado um usuário que não é admin da plataforma, quando acessa qualquer tela ou rota do painel de marcas, então recebe 403.
- **AC-008.7** Dado qualquer criação, alteração ou remoção de marca, domínio, plano ou pacote, quando é concluída, então há uma entrada no log de auditoria com quem fez.

### REQ-009: Prova pela tela e liberação segura

Como dono da plataforma, quero ver funcionando de verdade antes de ligar em produção.

- **AC-009.1** Dado a homologação com a marca padrão, uma marca de teste em subdomínio e um domínio próprio de teste, quando cada endereço é aberto, então o login mostra a marca certa e o e-mail de acesso chega com a marca e o link no mesmo endereço.
- **AC-009.2** Dado a prova em homologação, quando concluída, então as evidências (capturas, e-mails recebidos, saídas de teste) estão em `docs/solucao-crm/evidencias/002-marcas/`.
- **AC-009.3** Dado a produção após o deploy, quando `app.corretora.io` é acessado, então continua respondendo `/` = 200 e `/app` = 307, com a aparência de antes.
- **AC-009.4** Dado o domínio de teste removido, quando é acessado, então mostra a marca padrão e deixa de receber certificado.

### REQ-010: Qualidade, compatibilidade e desempenho

- **AC-010.1** Dado a resolução de marca por host, quando medida, então acrescenta no máximo 30 ms (p95) com cache quente e 200 ms com cache frio.
- **AC-010.2** Dado uma cor de marca sem contraste suficiente, quando é salva e usada, então a régua de contraste existente a ajusta ou recusa com motivo registrado (acessibilidade AA).
- **AC-010.3** Dado o schema novo, quando `pnpm test:db` roda em instalação nova e em atualização com dados, então ambos passam, e o apêndice do `baseline.sql` é idempotente.
- **AC-010.4** Dado o compose do kit com as variáveis novas do gancho de e-mail, quando um `.env` antigo é usado, então nada quebra (valores com padrão), e `pnpm test:shell` passa.
- **AC-010.5** Dado o teste que vigia vazamento de marca no código, quando roda, então conhece a marca como camada nova e passa.

## Requisitos não funcionais

Cobertos pelos critérios acima: desempenho (AC-010.1), segurança e isolamento (REQ-003, REQ-004, REQ-007), acessibilidade (AC-010.2), observabilidade (AC-001.4, AC-006.3, AC-007.4, AC-008.7), compatibilidade e rollback (REQ-002, AC-010.3, AC-010.4) e custo zero (Resend gratuito, sem domínio novo).

## Fora de escopo

- Cobrança, trial, checkout e qualquer chamada ao Asaas (subprojeto 2); repasse financeiro, split e subcontas de parceiro.
- Conteúdo dos pacotes verticais Corretor e Nutricionista (subprojetos 8 e 9); só a estrutura e a cópia entram aqui.
- Telas do nível parceiro e cadastro de domínio por marca ou parceiro.
- Domínio de envio de e-mail próprio por marca; certificado curinga por DNS.
- Cadastro público aberto (a chave existe, desligada) e antispam de cadastro.
- App mobile: só guardar os identificadores por marca como campos.
- Inbox, canal de e-mail IMAP/SMTP, agenda e agente de IA (subprojetos 3 a 6).
- Alterar o PDF de LGPD, o `CLAUDE.md` ou o `AGENTS.md` do upstream.

## Dependências e riscos

- **Dono (cliques guiados):** criar os registros SPF e DKIM do Resend na Hostinger, verificar o domínio de envio e apontar o domínio de teste para a VPS.
- **Let's Encrypt:** teto de 50 certificados por semana por domínio registrado; mitigado pelo limite por hora e por validar poucos domínios.
- **Kit do Supabase:** o compose do kit precisa expor as variáveis do gancho de e-mail; mudança no kit exige que chegue a quem já instalou (doutrina 15) e `pnpm test:shell`.
- **Homologação em Supabase Cloud:** o gancho é configurado à mão no painel; a produção é configurada pelo compose do kit.
- **Segredos novos** (assinatura do gancho e pergunta do Caddy) vão no `.env` e nos Secrets, nunca no chat.
- **Risco de negócio:** erro no resolvedor poderia derrubar o login de todos; mitigado por nunca lançar, marca padrão como degradação, chave de desligamento e migração só aditiva.
- O e2e completo só roda por disparo manual (A-07) e será disparado antes de entregar.
