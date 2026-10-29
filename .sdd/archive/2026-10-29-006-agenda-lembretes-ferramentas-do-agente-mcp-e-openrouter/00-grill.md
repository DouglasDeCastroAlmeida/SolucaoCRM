# Grill: Agente de IA: provedores, ferramentas e MCP

> Mudança `006-agenda-lembretes-ferramentas-do-agente-mcp-e-openrouter` · porte L · 2026-10-27
> O nome da pasta é o original; o escopo foi dividido na P1: a parte da agenda saiu para a mudança
> `007-agenda-lembretes-e-confirmacao-pelo-cliente`.
> Interrogatório técnico antes de qualquer requisito ou código. Uma pergunta por vez, sempre com
> uma resposta recomendada. O que o código responde, o agente descobre sozinho em vez de perguntar.

## Pedido original

Usuário: "Pode" (abrir o Grill do subprojeto 5, última peça do planejamento antecipado; a implementação só começa quando o dono pedir). Subprojeto 5 da seção 12 da spec `docs/solucao-crm/specs/2026-10-21-crm-autonomos-design.md`: **Agenda, lembretes, ferramentas do agente, MCP e OpenRouter**, porte L, depende só do 0 (concluído). Escopo: seções 7.3 e 7.4 e decisão D-06 (LLM do próprio cliente, o custo é dele).

## Contexto levantado no código

- **Agenda já existe** em `lib/agenda/`: horários livres, jornada, bloqueios, consulta, aviso do compromisso, lembretes (`lembretes.ts`, com `reminder_extra_offsets_minutes` e texto por lembrete em `reminder_bodies`), sincronização com o Google em `lib/agenda/google/` e o cron `app/api/v1/cron/agenda-reminder` (802 linhas). A confirmação "responda 1" parece tocar `contexto-do-atendimento.ts` e `inbound-turn.ts` do motor; a conferir no PRD.
- **Agente de IA já existe** em `lib/agent-engine/` (turnos de entrada, rascunho `draft-reply`, resposta aprovada `approved-reply`, guardrails, pacing, followup) e `lib/ai/` (gateway, credenciais por organização em `lib/ai/credenciais/`, orçamento em `lib/ai/budget/`, custo em `cost.ts`).
- **Provedores de IA hoje:** os CHECKs de `ai_provider_credentials`, `ai_models` e `ai_agent_versions` aceitam só `anthropic`, `openai` e `google`. OpenRouter e APIs compatíveis com a da OpenAI **não existem**.
- **MCP:** `lib/mcp/` expõe o CRM como servidor MCP (`server.ts`, `tools/`, `auth.ts`) e **já tem cliente de servidores externos** em `lib/mcp/servidor-externo/` (`registro.ts`, `chamada.ts`, `segredo.ts`, `carregar.ts`). A spec 7.4 pede que a organização cadastre servidores MCP externos; parte disso pode já estar pronta.
- A spec 7.4 pede: ferramentas do agente (consultar e marcar horário, mover no funil, criar tarefa, transferir para humano, buscar na base de conhecimento), proteções (começa desligado, "aprovar antes de enviar", transferência para humano, contador de tokens por organização) e chaves nunca em log (só os 4 últimos caracteres).
- O assistente de conexão padronizado e o painel de saúde são do subprojeto 6; aqui só o que for necessário para conectar chave de IA e MCP.

## Perguntas e respostas

### P1. Dividir esta mudança em duas?
- Recomendação do agente: **sim, em duas**, porque são dois assuntos independentes e com riscos diferentes, e a maior parte já existe no código. **006 (esta)** fica com a parte da IA: provedores OpenRouter e compatíveis com OpenAI, conferência e lacunas das ferramentas do agente, MCP externo, proteções e contador de tokens. Uma **nova mudança 007** fica com a agenda: lembretes por WhatsApp (24 h e 2 h, configuráveis), confirmação pelo cliente ("responda 1 para confirmar") e o que faltar do Google Agenda. Cada uma entra no Grill, no PRD e no design só com o que ainda não existe, e podem ser implementadas em qualquer ordem. Juntas, ficariam grandes demais para um PRD que se possa conferir critério a critério, e a mistura de agenda com IA dificulta saber o que quebrou.
- Resposta: aceita a recomendação (dividir). A agenda (lembretes por WhatsApp, confirmação "responda 1" e o que faltar do Google Agenda) vai para a mudança 007, de porte M. Esta mudança 006 fica só com a IA.

### P2. Quais provedores de IA entram além de Anthropic, OpenAI e Google?
- Recomendação do agente: **OpenRouter e "compatível com a API da OpenAI" (endereço base, chave e nome do modelo informados pela pessoa)**, nada além. OpenRouter dá acesso a centenas de modelos com uma chave só, inclusive baratos e gratuitos, o que combina com o autônomo que paga a própria LLM (D-06). O "compatível com OpenAI" cobre quem usa Groq, Together, Ollama na própria máquina ou um servidor de modelo próprio. Os dois falam o mesmo protocolo, então são **um adaptador com dois cartões na tela**. A pessoa escolhe o provedor, cola a chave e informa o modelo; a chave é guardada cifrada como as atuais e só os 4 últimos caracteres aparecem. O endereço base informado pela pessoa passa pela mesma proteção contra endereço interno do canal de e-mail (sem loopback nem rede local). O sistema não decide qual modelo é melhor: mostra o que o provedor devolver e avisa que modelo fraco pode errar ferramentas.
- Resposta: aceita a recomendação

### P3. Como o agente de IA começa para uma organização nova, e o que o protege de gastar ou errar sozinho?
- Recomendação do agente: **começa desligado; ao ligar, nasce em "aprovar antes de enviar"; ir para o automático exige uma confirmação explícita.** Concretamente: (1) agente novo nasce desligado, sem nenhum envio; (2) ao ligar, o modo é "aprovar antes de enviar": o agente redige e uma pessoa aprova cada resposta (o fluxo `draft-reply` e `approved-reply` que já existe); (3) trocar para "automático" mostra uma tela dizendo o que vai acontecer (o agente responde sozinho, com o custo na chave dela) e só vale depois do clique de confirmação, auditado; (4) **teto de custo por organização** com aviso em 80% e parada do agente em 100% (o orçamento em `lib/ai/budget` já existe; falta o teto ser obrigatório e visível, e o contador de tokens por organização na tela); (5) transferência para humano quando o cliente pede ou quando o agente não sabe, como já faz o `handoff`; (6) modelo que errar a chamada de ferramenta duas vezes seguidas transfere para humano em vez de insistir. As ferramentas da spec (marcar horário, mover no funil, criar tarefa, transferir, buscar na base) **já existem** no motor (`agendamento`, `handoff`, `move-lead-stage`, `leads`, busca de conhecimento); o PRD confere uma a uma e especifica só a lacuna.
- Resposta: aceita a recomendação

### P4. Como um servidor MCP externo pode ser usado pelo agente sem virar porta de entrada para ataque?
- Recomendação do agente: **o admin cadastra, escolhe uma a uma as ferramentas que o agente pode usar (todas desligadas por padrão), e tudo que o servidor devolve é tratado como dado, nunca como ordem.** (1) Só admin cadastra, com endereço `https`, credencial cifrada (só 4 últimos caracteres na tela) e a mesma proteção contra endereço interno (sem loopback, rede local, metadata; IP resolvido fixado). (2) Ao cadastrar, o sistema lista as ferramentas do servidor; **cada ferramenta nasce desligada** e o admin liga as que quer, por agente. (3) Ferramenta marcada como "escreve ou apaga" pelo próprio servidor só roda com aprovação humana enquanto o agente estiver em "aprovar antes de enviar"; no automático, só as de leitura rodam sem aprovação, e as de escrita exigem o admin marcar "pode rodar sem aprovação" com aviso. (4) O texto devolvido entra no contexto do modelo marcado como dado externo e nunca reabre permissões (defesa contra instrução escondida na resposta); tem tamanho máximo (o `resultado-bytes.ts` já existe) e prazo de 10 s. (5) Toda chamada é auditada (servidor, ferramenta, resultado resumido, sem a credencial). O cliente MCP externo já existe em `lib/mcp/servidor-externo/`; o PRD confere o que ele faz hoje e especifica só o que falta (lista de ferramentas por agente, aprovação das de escrita, tela).
- Resposta: aceita a recomendação

Respondidas pelo código e pela spec, sem perguntar:

### P5. A chave de IA aparece em algum lugar depois de salva?
- Fonte: spec 7.4 e `lib/ai/credenciais/guardar.ts` — AES-256-GCM, `api_key_last4` em claro, auditoria e validação em segundo plano. A regra vale para os provedores novos: a chave nunca em log, resposta de API, auditoria ou Sentry; só os 4 últimos caracteres. O endereço base do provedor compatível (que é do usuário) não é segredo, mas passa pela proteção anti-SSRF.

### P6. Uma ferramenta chamada duas vezes (nova tentativa do modelo ou do motor) marca dois horários ou duas tarefas?
- Fonte: `CLAUDE.md` (idempotência) e o motor existente (`approved-reply` exige `draft_id`; ferramentas de agendamento e de lead são do MCP interno em `lib/mcp/tools/`). A conferência do PRD verifica, ferramenta por ferramenta, se a repetição com os mesmos argumentos é inofensiva; onde não for, a ferramenta ganha chave de idempotência.

### P7. Quem enxerga o que a IA gastou?
- Fonte: `lib/ai/cost.ts` e `lib/ai/budget/` (custo e orçamento já medidos). O contador de tokens e o teto por organização aparecem para admin em Configurações; a plataforma não cobra a LLM (D-06), então o valor é informativo e protege a conta da pessoa.

## Decisões

- **D-01** Dividir o escopo: esta mudança (006) é só a IA; a agenda (lembretes e confirmação) é a mudança 007.
- **D-02** Provedores novos: OpenRouter e "compatível com a API da OpenAI" (endereço base, chave e modelo informados pela pessoa), num adaptador só, com a chave cifrada como as atuais e o endereço base sob a proteção anti-SSRF; nada além disso.
- **D-03** O agente nasce desligado; ao ligar, o modo é "aprovar antes de enviar"; o automático exige tela de confirmação explícita, auditada.
- **D-04** Teto de custo por organização, obrigatório e visível: aviso em 80%, parada do agente em 100%, com contador de tokens na tela.
- **D-05** Transferência para humano quando o cliente pede, quando o agente não sabe e quando o modelo erra a chamada de ferramenta duas vezes seguidas.
- **D-06** As ferramentas da spec (marcar horário, mover no funil, criar tarefa, transferir, buscar na base) já existem no motor; o PRD as confere uma a uma e especifica só a lacuna, incluindo idempotência na repetição.
- **D-07** MCP externo: só admin cadastra, `https`, credencial cifrada, proteção anti-SSRF com IP fixado; ferramentas nascem desligadas e são ligadas por agente; ferramenta de escrita só roda sem aprovação se o admin marcar explicitamente; o retorno entra como dado externo, com tamanho máximo e prazo de 10 s; toda chamada auditada sem a credencial.
- **D-08** Reaproveitar `lib/ai/**`, `lib/agent-engine/**` e `lib/mcp/servidor-externo/`; estender, não reescrever. Código novo dos provedores isolado no padrão do gateway existente.
- **D-09** Prova pela tela em ambiente fresco estilo VPS, com um provedor compatível real (OpenRouter) e um servidor MCP de verdade, antes de produção.

## Fora de escopo

- A agenda: lembretes por WhatsApp, confirmação "responda 1" e Google Agenda (mudança 007).
- LLM fornecida pela plataforma com cobrança por token (spec 3.3).
- Escolher ou recomendar automaticamente o "melhor" modelo.
- Treinar, ajustar ou hospedar modelos.
- O assistente de conexão padronizado e o painel de saúde das conexões (subprojeto 6), além do mínimo para conectar chave e MCP.
- Marketplace ou catálogo público de servidores MCP.
- Mudar o motor de decisão do agente, pacing ou anti-banimento.

## Riscos e premissas

- **Risco:** instrução escondida na resposta de um servidor MCP ou numa mensagem do cliente (prompt injection) levar o agente a agir. Mitigação: retorno de MCP como dado externo, ferramentas de escrita com aprovação, ferramentas desligadas por padrão.
- **Risco:** modelo fraco ou barato erra a chamada de ferramenta. Mitigação: dois erros transferem para humano; aviso na tela sobre modelos fracos.
- **Risco:** custo da LLM do cliente disparar. Mitigação: teto obrigatório, aviso em 80%, parada em 100%.
- **Risco:** o endereço base compatível ou o servidor MCP atingir a rede interna da VPS. Mitigação: a mesma proteção estrita do canal de e-mail (mudança 005); idealmente um único helper compartilhado, decidido no design.
- **Risco:** regressão no motor do agente (entrada, rascunho, resposta aprovada). Mitigação: extensão mínima, testes atuais como piso, prova pela tela antes e depois.
- **Premissa:** o OpenRouter e os serviços compatíveis seguem o protocolo da OpenAI para chat e chamada de ferramentas; a sonda da implementação confirma com a chave do dono.
- **Dependência do dono:** uma chave do OpenRouter (há modelos gratuitos para a sonda) e um servidor MCP de teste, em `C:\Users\Douglas\.secrets\`, na implementação.
