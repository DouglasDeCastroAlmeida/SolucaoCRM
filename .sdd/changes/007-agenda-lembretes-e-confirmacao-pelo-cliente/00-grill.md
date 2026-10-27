# Grill: Agenda: lembretes e confirmacao pelo cliente

> Mudança `007-agenda-lembretes-e-confirmacao-pelo-cliente` · porte M · 2026-10-27
> Interrogatório técnico antes de qualquer requisito ou código. Uma pergunta por vez, sempre com
> uma resposta recomendada. O que o código responde, o agente descobre sozinho em vez de perguntar.

## Pedido original

Usuário: "Pode" (abrir o Grill da agenda, última peça do planejamento antecipado; a implementação só começa quando o dono pedir). Esta mudança nasceu da divisão da antiga 006 (P1 do Grill da 006): é a parte da agenda do subprojeto 5 da spec `docs/solucao-crm/specs/2026-10-21-crm-autonomos-design.md`, seção 7.3: lembretes por WhatsApp (por padrão 24 h e 2 h antes, configurável) e confirmação pelo cliente ("responda 1 para confirmar"), mais o estado do Google Agenda. Porte M, depende só do 0 (concluído).

## Contexto levantado no código

- **Os lembretes já existem e são ricos.** `lib/agenda/lembretes.ts` e o cron `app/api/v1/cron/agenda-reminder` (802 linhas): vários degraus por tipo de agendamento (principal + até 20 extras, de 15 min a 7 dias, cada um com texto próprio em `reminder_bodies`), `reminder_sent_offsets_minutes` para não repetir, `reminder_channel_session_id` (canal remetente), lembrete tratado como **transacional** (a recusa de marketing não barra; contato bloqueado ou sem telefone barra), **janela de envio** do canal respeitada, e **janela de 24 h** do canal oficial (#2595: fora da janela o degrau não vira "enviado").
- **O padrão de fábrica é "sem lembrete":** a migration do baseline faz `reminder_enabled` nascer `false` (baseline ~16593), com 1440 minutos (24 h) como antecedência principal. A spec pede 24 h e 2 h por padrão.
- **A confirmação pelo cliente não existe.** Só há confirmação **da equipe** (`service_requires_confirmation`, `service_confirmed_at`, `service_confirmed_by_user_id` em `calendar_appointments`). Não achei estado de "confirmado pelo cliente", nem leitura da resposta "1" no turno de entrada (`lib/agent-engine/agent/inbound-turn.ts`, `contexto-do-atendimento.ts`).
- **Há ferramentas de agenda para o agente** (`lib/mcp/tools/agendamento.ts`: marcar, remarcar, cancelar, confirmar), então a resposta do cliente poderia ser tratada pelo agente de IA ou por regra fixa.
- **Google Agenda:** `lib/agenda/google/` já sincroniza. O escopo é sensível: a verificação do app no Google é um processo externo (spec 7.3: até sair, funciona para até 100 usuários com tela de aviso). Não é código desta mudança.
- Restrições do canal: WhatsApp via WAHA (texto livre) e oficial Meta (janela de 24 h e modelos); e-mail (mudança 005) não terá lembrete de agenda neste momento.

## Perguntas e respostas

### P1. Como o sistema entende o "1" do cliente: regra fixa ou o agente de IA?
- Recomendação do agente: **regra fixa, determinística, que não depende de a IA estar ligada.** Quando o cliente responde com uma mensagem que é só "1" (ou "sim", "confirmo", "ok", "confirmado", com ou sem pontuação e emoji) e existe um lembrete enviado a ele nas últimas 48 horas para um compromisso futuro e ainda não confirmado, o compromisso passa para **confirmado pelo cliente**, e o cliente recebe uma resposta curta de agradecimento. Se responder só "2" (ou "cancelar", "não vou", "remarcar"), o compromisso é marcado como **cliente pediu para remarcar** e a conversa vai para a fila de um humano com o aviso na Central (nada é cancelado sozinho). Qualquer outro texto segue o fluxo normal (agente de IA ou humano), sem tentar adivinhar. Motivo: o cliente do autônomo responde de qualquer jeito, e uma regra simples e previsível não erra, não gasta token e funciona mesmo com o agente desligado. O caso ambíguo vai para uma pessoa. Se o cliente tiver dois compromissos futuros com lembrete recente, o "1" vale para o mais próximo e a resposta cita data e hora para ele conferir.
- Resposta: aceita a recomendação

### P2. Os lembretes de 24 h e 2 h nascem ligados?
- Recomendação do agente: **sim, para tipos de agendamento novos, e nunca mudando os que já existem.** Hoje o lembrete nasce desligado, e quem configurou nada ou desligou de propósito não pode começar a mandar mensagem de repente. Então: todo tipo de agendamento **criado depois desta mudança** nasce com dois lembretes ligados (24 h e 2 h antes) com texto padrão em pt-BR, en e es ("Olá {nome}, lembrando do seu horário de {serviço} amanhã às {hora}. Responda 1 para confirmar ou 2 para remarcar."), editáveis na tela. Tipos existentes ficam exatamente como estão, com um aviso na tela do tipo oferecendo "ativar lembretes padrão" com um clique. O lembrete continua só saindo quando há telefone, canal conectado, dentro da janela de horário e sem bloqueio do contato, como já faz, e o texto padrão cita o nome da organização e nunca o de uma marca fixa. O "2 para remarcar" só aparece no texto quando a confirmação pelo cliente está ligada para o tipo.
- Resposta: aceita a recomendação

Respondidas pelo código, pela spec e pelas doutrinas do projeto, sem perguntar:

### P3. A confirmação do cliente substitui a confirmação da equipe?
- Fonte: `calendar_appointments` tem `service_requires_confirmation`, `service_confirmed_at` e `service_confirmed_by_user_id` (confirmação **da equipe**, baseline ~181 e ~215). São coisas diferentes: a do cliente é **"o cliente confirma que vai"** e a da equipe é **"o serviço está garantido"**. A nova confirmação tem campo próprio (`client_confirmed_at`), nunca reaproveita as da equipe, e não muda o `status` do compromisso nem libera tipo que exige confirmação humana.

### P4. O que acontece se o cliente responder "1" duas vezes, ou "1" depois do horário?
- Fonte: `CLAUDE.md` (idempotência). A segunda confirmação não muda nada e não gera nova resposta. "1" depois do horário do compromisso, ou sem lembrete recente (48 h), cai no fluxo normal da conversa. A decisão de aceitar a resposta é por regra pura e testável com relógio injetado.

### P5. O Google Agenda entra nesta mudança?
- Fonte: spec 7.3 — a verificação do app no Google é um processo externo (até sair, funciona para até 100 usuários com tela de aviso). `lib/agenda/google/` já sincroniza. Nada de código novo aqui; o status da verificação vai para o roteiro do dono e para o runbook.

### P6. Como desligar se der problema?
- Fonte: doutrina de rollback do projeto. A confirmação pelo cliente tem chave por tipo de agendamento (padrão desligada em tipos existentes) e uma chave de instalação `AGENDA_CONFIRMACAO_CLIENTE` (`ligado` por padrão); desligar volta ao comportamento atual sem apagar dados.

## Decisões

- **D-01** A confirmação pelo cliente é por **regra fixa**, sem depender do agente de IA: mensagem que é só "1", "sim", "confirmo", "ok" ou "confirmado" (com ou sem pontuação e emoji) até 48 h depois de um lembrete, para um compromisso futuro ainda não confirmado, marca **confirmado pelo cliente** e responde com agradecimento curto.
- **D-02** "2", "cancelar", "não vou" ou "remarcar" marca **cliente pediu para remarcar**, transfere a conversa para a fila humana e avisa na Central; **nada é cancelado ou remarcado sozinho**.
- **D-03** Qualquer outro texto segue o fluxo normal (agente ou humano). Com dois compromissos futuros com lembrete recente, o "1" vale para o mais próximo e a resposta cita data e hora.
- **D-04** Tipos de agendamento **novos** nascem com lembretes de 24 h e 2 h ligados, com texto padrão em pt-BR, en e es, editável; tipos existentes não mudam e ganham a oferta de "ativar lembretes padrão" com um clique. O "2 para remarcar" só aparece no texto quando a confirmação pelo cliente está ligada no tipo.
- **D-05** A confirmação do cliente tem campo próprio (`client_confirmed_at`); não reaproveita nem substitui a confirmação da equipe e não altera o `status` do compromisso.
- **D-06** Idempotente: a segunda confirmação não muda nada nem responde de novo; resposta tardia ou sem lembrete recente segue o fluxo normal.
- **D-07** O lembrete continua transacional e sob as regras atuais (telefone, canal conectado, janela de horário e de 24 h, contato não bloqueado). Chave por tipo e chave de instalação `AGENDA_CONFIRMACAO_CLIENTE` para desligar sem apagar dados.
- **D-08** A confirmação aparece na agenda (selo "confirmado pelo cliente") e no cartão do contato; "pediu para remarcar" aparece como pendência.
- **D-09** Prova pela tela em ambiente fresco estilo VPS, com WhatsApp real (WAHA) e o cliente respondendo "1" e "2".

## Fora de escopo

- Entender respostas livres do cliente ("posso mudar para as 15h?") por IA; isso segue o fluxo normal do agente.
- Remarcar ou cancelar automaticamente.
- Lembretes por e-mail (canal de e-mail da mudança 005) ou por SMS.
- Google Agenda: novo código ou o processo de verificação do app.
- Mudar a regra de janela de horário e de 24 h do canal oficial.
- Cobrança de no-show ou multa por falta.

## Riscos e premissas

- **Risco:** "1" ou "ok" que não era resposta ao lembrete (o cliente respondendo a outra pergunta) ser lido como confirmação. Mitigação: só vale até 48 h depois de um lembrete enviado a esse contato, para compromisso futuro e pendente; a resposta de agradecimento cita data e hora, para o cliente corrigir.
- **Risco:** lembrete padrão incomodar quem não quer. Mitigação: só tipos novos; chave por tipo e de instalação.
- **Risco:** número do WhatsApp ser denunciado por lembrete fora de hora. Mitigação: a janela de horário atual continua valendo.
- **Risco:** colisão com o agente de IA respondendo ao "1" ao mesmo tempo. Mitigação: a regra fixa roda antes e, ao tratar a mensagem, o agente não responde a ela.
- **Premissa:** a mensagem de entrada chega normalizada ao turno de entrada, onde a regra pode ser aplicada antes do agente.
- **Dependência:** nenhuma credencial do dono além do WhatsApp conectado para a prova pela tela.
