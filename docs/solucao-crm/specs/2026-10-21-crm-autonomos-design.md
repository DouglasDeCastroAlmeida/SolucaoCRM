# Solução CRM para autônomos — Design (visão, arquitetura e decomposição)

- **Data:** 2026-10-21
- **Autor:** Douglas de Castro Almeida (com Claude)
- **Status:** aprovado em conversa, seção por seção; aguardando revisão final do documento escrito
- **Guia de setup (contas, chaves, SSH):** [`../setup/guia-de-setup.md`](../setup/guia-de-setup.md)

> **Como usar este documento:** ele é a visão e a arquitetura de alto nível. Cada subprojeto
> da seção 12 entra na esteira SDD com `/sdd:new` e usa este documento como insumo do Grill.
> As decisões aqui (`D-xx`) não precisam ser rediscutidas no Grill. O que estiver em
> "Validações pendentes" (seção 13) sim.

---

## 1. Contexto e objetivo

Um CRM para **profissionais autônomos**, com experiência no estilo WhatsApp, na web e em app
Android/iOS. É vendido online de forma self-service, com trial de 7 dias.

O produto é **whitelabel e multiclient**: do mesmo núcleo saem uma solução geral customizável
e **produtos por segmento** (corretores imobiliários, nutricionistas e outros), cada um com marca,
domínio, planos e configurações próprias. Isso abre várias frentes de venda.

**Sucesso do MVP (lançamento web):**
- Uma pessoa assina sozinha pelo site, cadastra o cartão, conecta o WhatsApp e o e-mail seguindo
  o passo a passo e começa a atender, sem falar com ninguém.
- No 8º dia, se ela não cancelou, a cobrança acontece e a nota fiscal sai automaticamente.
- O agente de IA (com a chave da própria pessoa) atende, qualifica e marca horário.
- Uma marca nova (ex.: "NutriCRM") é criada pelo painel, sem deploy de código.

---

## 2. Decisões

| ID | Decisão | Motivo |
|---|---|---|
| **D-01** | Modelo whitelabel **"C"**: hierarquia *Plataforma → Parceiro → Marca → Organização*. No lançamento só a plataforma opera marcas; o nível parceiro existe no modelo de dados, sem telas | Modelar o nível parceiro agora custa pouco; adicionar depois é caro |
| **D-02** | **Fork do DeskcommCRM** (MIT) como base | Já cobre cerca de 70% do escopo, com multi-tenant testado, agentes, agenda e cobrança |
| **D-03** | Evo CRM **não** é base, só referência | É single-tenant e a licença tem condições de marca que conflitam com whitelabel |
| **D-04** | Assinatura **só pela web**; o app mobile serve apenas para login, sem botão de compra | Zero comissão de loja e um único fluxo de trial. O link-out no app (permitido no Brasil desde jun/2026, com comissão) fica preparado para uma fase futura |
| **D-05** | Canais do MVP: **WhatsApp por QR (WAHA Core)** + **e-mail via IMAP/SMTP** | Conexão simples. Ler e-mail pela API do Gmail exige escopo restrito e auditoria de segurança paga |
| **D-06** | **Agente de IA autônomo** no MVP, com a **LLM do próprio cliente** (chave de API ou MCP; o custo é dele) | Viabiliza a IA sem custo de LLM para a plataforma. A cobrança por token fica para uma fase 2 (o uso de tokens já é registrado) |
| **D-07** | Gateway **Asaas** | Menor taxa entre os comparados, NFS-e integrada e split/subcontas para parceiros no futuro |
| **D-08** | Usuários: autônomo + ajudantes (planos Solo e Pro) e um plano **Equipe**, mais caro, com filas, distribuição e métricas | Secretárias e assistentes são comuns; equipes viram upsell |
| **D-09** | **Agenda completa** no MVP: agenda interna, lembretes por WhatsApp, sincronização com o Google Agenda e agendamento pelo agente | Principal argumento de venda para os dois verticais |
| **D-10** | **Banco gratuito na VPS**: Supabase self-hosted, pelo modo single-server do DeskcommCRM. Homologação no Supabase Cloud Free | Custo zero de banco. Camadas de redundância vêm depois, mas o backup externo diário é piso desde o primeiro dia (D-11) |
| **D-11** | **Backup diário do banco com cópia fora da VPS desde o primeiro dia** | Com o banco dentro da VPS, perder a VPS sem cópia externa é irrecuperável |
| **D-12** | Cobrança com **Checkout hospedado do Asaas**: o cartão nunca passa pelo nosso servidor | Evita as exigências de PCI. Tokenização própria fica como plano B |
| **D-13** | Mobile em **React Native + Expo**, com **um único app por loja** que assume a marca da conta após o login | A Apple tende a rejeitar vários apps quase idênticos da mesma conta. Apps separados só para verticais com funcionalidade própria, ou publicados por parceiros na conta deles |
| **D-14** | O visual segue o **padrão de uso** do WhatsApp, mas com as **cores e o logo de cada marca** (sem verde, logo ou ícones do WhatsApp) | Evita risco de marca registrada e mantém o whitelabel |

---

## 3. Escopo

### 3.1 No MVP (lançamento web)
- Cadastro self-service por marca, trial de 7 dias com cartão, planos mensal, 1 ano e 2 anos, upgrade e downgrade.
- Hierarquia de marcas e domínios (marca resolvida pelo endereço), com login, cadastro e e-mails com a marca.
- Inbox no estilo WhatsApp: WhatsApp por QR + e-mail (IMAP/SMTP).
- CRM: contatos, funil/kanban com vocabulário por marca, tarefas e notas (o que já existe no DeskcommCRM).
- Agenda com Google Agenda, lembretes e confirmação por WhatsApp.
- Agente de IA com LLM própria do cliente (Anthropic, OpenAI, Google, OpenRouter e compatíveis com OpenAI), consumo de servidores MCP externos, ferramentas de agenda, CRM e transferência para humano.
- Multiusuário com papéis; plano Equipe com filas e métricas (já existentes).
- Assistentes de conexão passo a passo e painel de saúde das conexões.
- Painel da plataforma: marcas, domínios, planos, pacotes e contas.

### 3.2 Logo após o lançamento
- App mobile Android/iOS.
- Pacotes verticais Corretor e Nutricionista.

### 3.3 Fora do escopo (por enquanto)
- Telas e repasse financeiro para parceiros (o modelo de dados existe).
- Compra dentro do app (link-out ou compra nativa na loja).
- API oficial do WhatsApp (Meta), Instagram e Messenger (a camada de adaptadores permite adicionar depois).
- Leitura de e-mail via OAuth do Google (exige auditoria de segurança).
- LLM fornecida pela plataforma com cobrança por token.
- Construtor de ferramentas ou APIs dentro da plataforma (o agente só **consome** ferramentas externas).

---

## 4. Arquitetura geral

```
 Navegador (web)     App Android/iOS (Expo)
        │                    │
        └──── HTTPS ─────────┘
                 │
     ┌──────── VPS Hostinger KVM4 (Docker) ─────────┐
     │  Proxy/HTTPS (on-demand TLS p/ domínios)     │
     │  App Next.js (web + /api/v1)                 │
     │  Worker (IA, mídia, e-mail, agenda)          │
     │  Scheduler (automações, lembretes, régua)    │
     │  WAHA Core (WhatsApp)                        │
     │  Redis (filas, rate limit)                   │
     │  Supabase self-hosted (Postgres, Auth,       │
     │    Storage, Realtime) — produção             │
     └───────────────────┬──────────────────────────┘
                         │ backup diário (cópia externa)
                         ▼
               Bucket externo (R2 ou B2)

 Homologação: projeto Docker separado na mesma VPS + Supabase Cloud Free
 Externos: Asaas · Google (Agenda) · IMAP/SMTP do cliente · LLM/MCP do cliente · Resend · Sentry
```

**Princípios:**
- **Código nosso isolado** em pastas próprias (`lib/marcas`, `lib/billing-trial`, `lib/canais/email`,
  `apps/mobile`, `pacotes/`), para continuar puxando atualizações do DeskcommCRM enquanto o custo de
  conflito for baixo. A sincronização é sempre por PR, com todos os checks rodando.
- **Reaproveitar antes de criar:** cobrança (`lib/cobranca`, que já tem adaptador Asaas), agenda,
  agentes, canais (adaptadores), fila de eventos (`event_log`), isolamento por RLS.
- **Monorepo:** um repositório com app web, workers e `apps/mobile`.

**Capacidade:** o KVM4 tem 4 vCPU e 16 GB de RAM. O DeskcommCRM recomenda 8 GB para CRM + banco no
modo single-server; cada sessão de WhatsApp usa cerca de 150 MB. Os projetos Docker antigos
(`botimobiliario`, `evo-crm-community`) saem antes da instalação; o `vava` fica.

**Isolamento do ambiente de desenvolvimento:** o Claude Code roda nessa mesma VPS. Por isso:
- o Claude Code usa um usuário de sistema sem acesso aos arquivos e ao Docker de produção;
- os containers de produção têm limites de CPU e memória;
- quando houver clientes pagantes, a produção vai para uma VPS dedicada (KVM2 deve bastar no início).

---

## 5. Marcas, parceiros e domínios

### 5.1 Modelo
```
Plataforma
 └─ Parceiro (hoje só "plataforma")
     └─ Marca
         └─ Organização (conta do autônomo) ─ Usuários (papéis)
```

**Marca:** nome, logos (tema claro e escuro), cores, ícone, domínios, remetente e modelos de e-mail,
contato de suporte, catálogo de planos e preços, pacote vertical padrão, e identificadores do app
mobile (para builds futuros por marca).

**Pacote vertical:** uma semente de configuração (funis, vocabulário, campos, modelos de agente,
respostas rápidas, serviços de agenda, automações). Ele é **copiado** para a organização na criação;
mudanças posteriores na organização não afetam o pacote, e vice-versa.

### 5.2 Comportamento
1. **Resolução por domínio:** cada marca tem um subdomínio da plataforma e, opcionalmente, um domínio
   próprio. O app resolve o host para a marca por uma tabela de domínios com cache. Hoje o desvio por
   host do DeskcommCRM (`proxy.ts`) não faz nada; ele precisa ser implementado.
2. **HTTPS sob demanda:** o proxy só emite certificado para um domínio depois de confirmar com o app
   que ele pertence a uma marca ativa.
3. **Login, cadastro e e-mails com a marca:** o cadastro feito no domínio da marca cria a organização
   vinculada a ela, com os planos e o pacote dela. Os e-mails de acesso saem pelo gancho de envio do
   Supabase Auth, que chama o nosso app, e o app renderiza o modelo da marca.
4. **Identidade única, visão filtrada:** o mesmo e-mail pode ter organizações em várias marcas. Ao
   entrar pelo domínio da marca A, ele vê só as organizações da marca A.
5. **Nível parceiro:** existem as tabelas, o papel "admin do parceiro" e as políticas RLS, mas sem
   telas e sem repasse financeiro (que, quando vier, usará subcontas e split do Asaas).
6. **Painel da plataforma:** amplia o `/admin` atual com CRUD de marcas, domínios, planos e pacotes, a
   visão de todas as contas e o acesso de suporte auditado (impersonar).

### 5.3 Erros e casos de borda
- Domínio desconhecido: mostra a marca padrão da plataforma.
- Domínio removido ou marca inativa: o proxy deixa de emitir certificado; quem acessar vê a marca padrão.
- Trocar a marca de uma organização: só a plataforma pode, e a operação é auditada.

---

## 6. Billing

### 6.1 Fluxo do trial
1. A pessoa escolhe o plano no site da marca e cria a conta (nome, e-mail, CPF/CNPJ).
2. É redirecionada ao **Checkout hospedado do Asaas** (assinatura recorrente, cartão), com a
   **primeira cobrança em hoje + 7 dias**. O cartão é validado na criação, sem cobrança.
3. Recebe avisos no dia 5 e no dia 6 por e-mail e dentro do app, com o valor e a data da cobrança.
4. No dia 8, o Asaas cobra e **emite a NFS-e** quando o pagamento é confirmado.

### 6.2 Planos e preços
- **Solo** (1 usuário), **Pro** (até 3 usuários), **Equipe** (vários atendentes, com filas e métricas).
  Os limites e preços são configuráveis por marca.
- **Mensal** e **anual:** assinatura recorrente no Asaas.
- **2 anos:** cobrança única no cartão (à vista ou parcelada), com renovação controlada pelo nosso
  agendador, porque as assinaturas do Asaas não têm ciclo bienal. O parcelado tem taxa maior no Asaas.
- **Descontos sugeridos:** anual com 2 meses grátis (cerca de 17%); 2 anos com cerca de 25%.
- **Upgrade e downgrade** com pró-rata, reaproveitando `lib/cobranca/prorata.ts`.
- **Um trial por CPF/CNPJ por marca.**

### 6.3 Estados da conta
```
em_teste → ativa → pagamento_atrasado → suspensa → cancelada
```
| Estado | Comportamento |
|---|---|
| em_teste | Acesso completo por 7 dias |
| ativa | Acesso completo |
| pagamento_atrasado | O Asaas tenta cobrar de novo; aviso por e-mail e no app para trocar o cartão; 3 dias de tolerância com acesso completo |
| suspensa | Somente leitura. O agente de IA e o envio de mensagens param; a sessão do WhatsApp continua conectada |
| cancelada | No trial: nada é cobrado e o acesso segue até o fim dos 7 dias. Depois: acesso até o fim do período pago. Dados mantidos por 90 dias e depois anonimizados (LGPD) |

**Arrependimento (CDC, art. 49):** reembolso integral se pedido em até 7 dias após a **primeira
cobrança**. Confirmar com um advogado.

### 6.4 Confiabilidade
- Interface de provedor de cobrança própria (estendendo `lib/cobranca/provedores/contrato.ts`) com um
  modo novo, "trial com cartão e cobrança automática".
- Webhooks do Asaas entram na fila `event_log`, com verificação do token de autenticação e
  processamento idempotente.
- Uma rotina diária consulta as assinaturas no Asaas e corrige divergências.

---

## 7. Atendimento

### 7.1 Inbox no estilo WhatsApp
Reestilização do inbox de 3 painéis existente:
- **Lista de conversas:** foto, prévia, horário, contador de não lidas, ícone do canal, filtros
  "Minhas / Não atribuídas / IA".
- **Conversa:** balões, ✓✓ de entregue e lido, gravação de áudio, anexos, respostas rápidas com "/",
  reações, assumir ou devolver a conversa para a IA.
- **Painel do contato** recolhível: etapa no funil, tags, próximos compromissos, notas.
- O tema vem dos tokens da marca (D-14).

### 7.2 Canais (adaptadores)
- **WhatsApp (WAHA Core):** gratuito e sem limite de sessões. Conexão por QR ou código de
  pareamento; anti-banimento (ritmo, intervalos aleatórios, janela de horário); alerta de sessão
  caída e reconexão.
- **E-mail (IMAP/SMTP):** Gmail com "senha de app" (exige verificação em duas etapas na conta
  Google); também atende Outlook e outros. Os e-mails viram conversas do contato no mesmo inbox.

### 7.3 Agenda
- Usa a agenda existente (serviços, horários, bloqueios, sincronização com o Google Agenda).
- O Google Agenda usa escopo sensível: exige verificar o app no Google, sem auditoria paga. Até a
  verificação sair, funciona para até 100 usuários com tela de aviso.
- Novos: lembretes por WhatsApp (por padrão 24 h e 2 h antes, configurável) e confirmação pelo
  cliente ("responda 1 para confirmar").

### 7.4 Agente de IA
- Motor existente com chaves por organização (`ai_provider_credentials`, criptografadas). Novos
  provedores: OpenRouter e compatíveis com a API da OpenAI.
- **Ferramentas:** consultar e marcar horário, mover no funil, criar tarefa, transferir para humano,
  buscar na base de conhecimento.
- **MCP:** a organização cadastra servidores MCP externos (URL + credencial); o agente consome as
  ferramentas deles.
- **Proteções:** começa desligado; modo "aprovar antes de enviar"; transferência para humano quando o
  cliente pede ou quando o agente não sabe; contador de tokens por organização.
- As chaves nunca aparecem em logs nem em respostas da API (só os 4 últimos caracteres).

### 7.5 Assistentes de conexão
- Padrão único para WhatsApp, e-mail, Google Agenda, chave de IA e MCP: passos numerados com imagens,
  teste real no final, erro em português claro dizendo o que fazer.
- **Painel de saúde das conexões** (verde, amarelo, vermelho) e notificação quando algo cai.

---

## 8. App mobile

- **React Native + Expo** em `apps/mobile`. Consome a `/api/v1`, usa o login do Supabase e o tempo real.
- **EAS Build** para compilar e **EAS Update** para correções de interface e lógica sem nova revisão
  das lojas.
- **Escopo:** inbox completo, painel do contato, funil simplificado, agenda, tarefas, notificações push
  (nova mensagem, transferência da IA, compromisso próximo, conexão caída), cache local e fila de envio
  quando estiver sem conexão.
- **Só na web:** configurações de agentes, funis, marca e equipe; cobrança; assistentes de conexão. O
  app abre essas telas no navegador.
- **Sem compra no app** (D-04). Quem não tem conta vê "crie sua conta em [site da marca]". O app tem
  link para pedir a exclusão da conta (exigência das lojas).
- **Um app por loja** (D-13). A configuração por marca (nome, ícone, cores, identificador do app) já
  existe para builds separados no futuro.

---

## 9. Pacotes verticais

Arquivos versionados em `pacotes/<nome>.yaml`, aplicados como semente.

**Corretor:**
- Funil: Novo contato → Qualificado → Visita agendada → Proposta → Contrato fechado.
- Campos: tipo de imóvel, bairro, faixa de preço, financiamento (sim/não); CRECI no perfil.
- Agente "qualifica o lead e agenda a visita"; serviço "Visita (1h)"; respostas rápidas; follow-up de
  lead que esfriou.

**Nutricionista:**
- Funil: Contato → Avaliação agendada → Em acompanhamento → Retorno.
- Serviços "Consulta (1h)" e "Retorno (30 min)"; agente "faz a triagem e agenda"; lembrete e
  confirmação de consulta.
- **LGPD:** peso, objetivo e restrições alimentares são dados de saúde (dados sensíveis, art. 11).
  O pacote coleta consentimento explícito e restringe o acesso a esses campos.

---

## 10. Infraestrutura, CI/CD e operação

### 10.1 Ambientes
| Ambiente | Onde | Banco |
|---|---|---|
| Produção | VPS, projeto Docker `crm-prod` | Supabase self-hosted (single-server) |
| Homologação | VPS, projeto Docker `crm-hml` | Supabase Cloud Free |

### 10.2 Pipeline (GitHub Actions)
- **PR:** gates da esteira SDD + checks do DeskcommCRM (`verify`, `invariants`, `build-and-size`,
  `e2e`, `imagens-ok`).
- **Merge na `main`:** build e push das imagens (GHCR), deploy em homologação via SSH e smoke test.
- **Produção:** ambiente `producao` no GitHub com **aprovação obrigatória**. Faz backup antes e volta
  sozinho para a versão anterior se a verificação de saúde falhar. Meta: rollback em menos de 2 minutos.
- **Mobile:** EAS Build disparado por tag `mobile-v*`.
- **Upstream:** workflow semanal abre um PR de sincronização com o DeskcommCRM.

### 10.3 Resiliência (em camadas)
| Camada | Quando | O quê |
|---|---|---|
| 0 (piso) | Dia 1 | Backup diário do banco, das sessões do WhatsApp e do Storage (`backup.sh` do kit, 14 mais recentes) + **cópia em bucket externo** |
| 1 | Dia 1 | Sentry; monitor de disponibilidade com alerta no celular; HTTPS automático |
| 2 | Primeiros pagantes | Snapshot semanal da VPS; teste de restauração mensal; VPS dedicada para produção |
| 3 | Escala | Réplica do banco ou banco gerenciado; segunda VPS |

**Metas:** perda máxima de 24 h de dados; restaurar a VPS do zero em até 2 h.

### 10.4 Esteira SDD no fork
- `/sdd:init` no fork, com `gate.mode: "warn"` no início e `strict` depois.
- Perfis `web-react` e `infra-hostinger`. Convenções do `CLAUDE.md` do DeskcommCRM prevalecem em caso de
  conflito; a divergência é registrada como decisão ou ADR.
- Mudanças pequenas e fatiadas, para caber no plano Claude Pro.

---

## 11. Testes

| Área | Testes |
|---|---|
| Isolamento | Estender o teste de RLS existente: organização ↔ organização, marca ↔ marca, parceiro ↔ parceiro |
| Marcas | Resolução de domínio → marca; cadastro no domínio cria a organização na marca certa; e-mail sai com a marca |
| Billing | Contrato do adaptador Asaas; máquina de estados; webhooks duplicados e fora de ordem; conciliação |
| Canais | Contrato de cada adaptador; webhooks simulados do WAHA; servidor IMAP de teste |
| Agente | Ferramentas com respostas simuladas da LLM; transferência para humano; chave nunca em log |
| E2E (Playwright) | Assinar → trial → conectar WhatsApp → responder; agente marca consulta |
| Mobile | Jest + RN Testing Library; Maestro (login, responder, marcar compromisso) |
| Infra | Smoke test do Compose; teste de restauração de backup |

Todo critério de aceite dos subprojetos cita o ID (`AC-xxx`) no teste, como a esteira exige.

---

## 12. Subprojetos (ordem de execução na esteira)

| # | Subprojeto | Porte | Depende de |
|---|---|---|---|
| 0 | Fundação: fork, limpeza da VPS, instalação single-server, CI/CD, backups, isolamento do Claude Code | L | — |
| 1 | Marcas, parceiros e domínios | L | 0 |
| 2 | Billing com trial no cartão (Asaas) | L | 1 |
| 3 | Inbox no estilo WhatsApp | M | 0 |
| 4 | Canal de e-mail (IMAP/SMTP) | L | 0 |
| 5 | Agenda, lembretes, ferramentas do agente, MCP e OpenRouter | L | 0 |
| 6 | Assistentes de conexão e painel de saúde | M | 4, 5 |
| — | **Lançamento web** | | 0–6 |
| 7 | App mobile | L | 1, 3 |
| 8 | Pacote Corretor | M | 1, 5 |
| 9 | Pacote Nutricionista | M | 1, 5 |

Os subprojetos 3, 4 e 5 podem andar em paralelo depois do 0.

---

## 13. Validações pendentes (resolver no Grill do subprojeto indicado)

| # | Validação | Subprojeto | Se falhar |
|---|---|---|---|
| V-1 | O Checkout do Asaas aceita a primeira cobrança em D+7 | 2 | Tokenização própria (pedir habilitação ao gerente Asaas) |
| V-2 | O Checkout do Asaas aceita ciclo anual | 2 | Tokenização própria para o anual |
| V-3 | Prazo padrão de recebimento do cartão no Asaas e custo de split/subcontas | 2 | Só afeta fluxo de caixa e parceiros |
| V-4 | O proxy da Hostinger (se existir) convive com o proxy do kit e com o TLS sob demanda | 0 | Usar o modo do instalador que publica atrás do proxy existente |
| V-5 | O modo single-server do DeskcommCRM roda bem no KVM4 junto com o `vava` e o Claude Code | 0 | Antecipar a VPS dedicada para produção |
| V-6 | O IMAP com senha de app do Google continua disponível para contas comuns e Workspace | 4 | Oferecer outros provedores e planejar a auditoria do Gmail |
| V-7 | Reembolso por arrependimento e termos de uso revisados por advogado | 2 | — |

---

## 14. Riscos

| Risco | Mitigação |
|---|---|
| Banimento de números no WhatsApp não oficial | Anti-banimento do WAHA, orientação no assistente, API oficial no roadmap |
| Divergência do fork em relação ao upstream | Código isolado em pastas próprias, PR semanal de sincronização, decisão consciente de parar de sincronizar |
| VPS única com banco dentro | Backup externo diário (piso), camadas da seção 10.3 |
| Claude Code na mesma VPS da produção | Usuário sem acesso, limites de recurso, VPS dedicada com os primeiros pagantes |
| Rejeição na App Store | Um app por loja; sem compra no app |
| Dados de saúde (nutricionista) | Consentimento, acesso restrito, anonimização |
| Base de código grande versus limites do plano Pro | Fatias pequenas, economia de tokens da esteira |

---

## 15. Referências

- DeskcommCRM (base do fork): https://github.com/melgarafael/DeskcommCRM — ver `docs/white-label.md`, `docs/saas/cobranca.md`, `docs/agenda-configuracao.md`, `docs/saas/coolify.md` (single-server)
- Evo CRM Community (referência funcional): https://github.com/evolution-foundation/evo-crm-community
- Chatwoot (referência funcional): https://github.com/chatwoot/chatwoot
- Referência visual de layout: https://github.com/ankitrajxd/whatsapp-frontend
- Esteira SDD: https://github.com/DouglasDeCastroAlmeida/sddEsteiraPropria
- Asaas — preços: https://www.asaas.com/precos-e-taxas
- Asaas — Checkout com assinatura: https://docs.asaas.com/docs/checkout-com-assinatura-recorrente
- Asaas — assinatura com cartão: https://docs.asaas.com/docs/criando-assinatura-com-cartao-de-credito
- Mercado Pago — assinaturas: https://www.mercadopago.com.br/ferramentas-para-vender/assinaturas
- Stripe Brasil — preços: https://stripe.com/br/pricing
- WAHA — planos e sessões: https://waha.devlike.pro/support-us
- Google — escopos da API do Gmail: https://developers.google.com/workspace/gmail/api/auth/scopes
- Apple — mudanças no iOS no Brasil (jun/2026): https://www.apple.com/br/newsroom/2026/06/apple-announces-changes-to-ios-in-brazil/
- Supabase — preços: https://supabase.com/pricing
