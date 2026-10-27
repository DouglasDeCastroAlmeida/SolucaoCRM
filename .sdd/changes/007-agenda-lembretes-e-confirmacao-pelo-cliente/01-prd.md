# PRD: Agenda: lembretes e confirmação pelo cliente

> Mudança `007-agenda-lembretes-e-confirmacao-pelo-cliente` · porte M · 2026-10-27
> O QUÊ e o PORQUÊ. Nada de como implementar. Derivado de `00-grill.md`.

## Como ler este PRD (o que já existe e o que é novo)

Os lembretes já existem e são ricos: vários degraus por tipo de agendamento, texto próprio por degrau, controle para não repetir, canal remetente, janela de horário, janela de 24 h do canal oficial, e a regra de que lembrete é transacional (`lib/agenda/lembretes.ts`, cron `app/api/v1/cron/agenda-reminder`). **Esses comportamentos não mudam** e valem como piso. O que é novo:
- o **padrão de fábrica** (24 h e 2 h ligados) para tipos novos;
- a **confirmação pelo cliente** ("responda 1") e o **pedido de remarcar** ("2"), que não existem;
- o **selo e a pendência** na agenda e no cartão do contato.

## Problema

O autônomo perde dinheiro com falta: o cliente esquece, não avisa, e o horário fica vazio. Lembrar ajuda, mas sem resposta o autônomo não sabe se o cliente vai. Hoje o lembrete sai (quando configurado), mas o cliente responder "1" não faz nada: a mensagem cai numa conversa que o autônomo precisa abrir, ler e marcar à mão. E como o lembrete nasce desligado, a maioria nunca o liga. O custo de não resolver é a falta de comparecimento e o trabalho manual de confirmar horário por horário.

## Objetivos e métricas

- Um tipo de agendamento novo envia lembretes de 24 h e 2 h sem nenhuma configuração.
- Uma resposta "1" do cliente marca o compromisso como confirmado em até 1 minuto, sem ninguém abrir a conversa.
- Zero compromisso cancelado ou remarcado sem decisão humana.
- Zero mudança de comportamento em tipos de agendamento existentes após a implantação.
- Zero confirmação errada: "1" fora do contexto de um lembrete recente segue o fluxo normal.

## Personas e cenários

- **Autônomo (nutricionista, corretor):** abre a agenda do dia e vê quem confirmou, quem ainda não respondeu e quem pediu para remarcar.
- **Cliente final:** recebe o lembrete no WhatsApp e responde "1" ou "2" sem abrir link nem aplicativo.
- **Atendente:** recebe na fila humana a conversa de quem pediu para remarcar.

## Requisitos funcionais

### REQ-001: Lembretes padrão para tipos novos

Como autônomo, quero que um tipo novo já lembre o cliente sem eu configurar.

- **AC-001.1** Dado um tipo de agendamento criado depois desta mudança, quando é salvo, então nasce com dois lembretes ligados (24 h e 2 h antes), com texto padrão em pt-BR, en e es, editável.
- **AC-001.2** Dado os tipos de agendamento que já existiam, quando a mudança é implantada, então nenhum tem lembrete ligado, desligado, alterado ou reenviado por causa dela.
- **AC-001.3** Dado a tela de um tipo existente sem lembretes, quando o admin clica em "ativar lembretes padrão", então os lembretes de 24 h e 2 h ficam ligados com o texto padrão, e só então.
- **AC-001.4** Dado o texto padrão, quando renderizado, então usa o nome do contato, o serviço, a data, a hora e o nome da organização, e nunca um nome de marca fixo.
- **AC-001.5** Dado o texto padrão, quando a confirmação pelo cliente está ligada no tipo, então inclui "Responda 1 para confirmar ou 2 para remarcar"; desligada, a frase não aparece.
- **AC-001.6** Dado um contato sem telefone, ou sem canal conectado, ou bloqueado, ou fora da janela de horário do canal, quando o lembrete deveria sair, então não sai, como já é hoje.

### REQ-002: Confirmação pelo cliente

Como autônomo, quero que a resposta "1" confirme o horário sozinha.

- **AC-002.1** Dado um lembrete enviado a um contato, quando ele responde só "1", então o compromisso é marcado como confirmado pelo cliente e ele recebe uma resposta curta de agradecimento com data e hora.
- **AC-002.2** Dado a resposta "sim", "confirmo", "ok" ou "confirmado", em qualquer caixa, com ou sem pontuação ou emoji, quando recebida nas mesmas condições, então vale como "1".
- **AC-002.3** Dado um lembrete enviado há até 48 horas para um compromisso futuro ainda não confirmado, quando o cliente responde com a confirmação, então ela é aceita; fora dessas condições não é.
- **AC-002.4** Dado uma resposta "1" sem lembrete recente, ou depois do horário do compromisso, quando recebida, então segue o fluxo normal da conversa (agente ou humano).
- **AC-002.5** Dado um compromisso já confirmado, quando o cliente responde "1" de novo, então nada muda e nenhuma nova resposta é enviada.
- **AC-002.6** Dado um cliente com dois compromissos futuros com lembrete recente, quando responde "1", então vale para o mais próximo e a resposta cita data e hora dele.
- **AC-002.7** Dado a confirmação do cliente, quando gravada, então usa um campo próprio, não altera o status do compromisso e não substitui a confirmação da equipe.
- **AC-002.8** Dado uma mensagem tratada como confirmação, quando o agente de IA está ligado, então ele não responde a essa mensagem.
- **AC-002.9** Dado o agente de IA desligado, quando o cliente responde "1", então a confirmação funciona do mesmo jeito.

### REQ-003: Pedido de remarcar

Como autônomo, quero ser avisado quando o cliente não pode ir, sem perder o controle do que remarcar.

- **AC-003.1** Dado um lembrete recente, quando o cliente responde só "2", "cancelar", "não vou" ou "remarcar", então o compromisso é marcado como "cliente pediu para remarcar", a conversa vai para a fila de uma pessoa, a Central avisa, e o cliente recebe uma resposta dizendo que a equipe entrará em contato.
- **AC-003.2** Dado um pedido de remarcar, quando tratado, então nenhum compromisso é cancelado, remarcado ou liberado automaticamente.
- **AC-003.3** Dado um pedido já registrado, quando o cliente repete "2", então não gera novo aviso nem nova resposta.
- **AC-003.4** Dado um compromisso marcado como "pediu para remarcar", quando a equipe o remarca ou cancela pela agenda, então a pendência some.

### REQ-004: Visibilidade

Como autônomo, quero ver o estado de cada horário de relance.

- **AC-004.1** Dado um compromisso confirmado pelo cliente, quando a agenda é exibida, então mostra o selo "confirmado pelo cliente", com a hora da confirmação.
- **AC-004.2** Dado um compromisso com pedido de remarcar, quando a agenda e o cartão do contato são exibidos, então mostram a pendência destacada.
- **AC-004.3** Dado os textos dos selos e das respostas automáticas, quando exibidos em en ou es, então aparecem traduzidos pelo dicionário.

### REQ-005: Controle, privacidade e segurança

- **AC-005.1** Dado um tipo com a confirmação do cliente desligada, quando o cliente responde "1", então a mensagem segue o fluxo normal.
- **AC-005.2** Dado a chave de instalação `AGENDA_CONFIRMACAO_CLIENTE` desligada, quando alguém responde "1" ou "2", então nada é confirmado nem marcado, e nenhum dado existente é apagado.
- **AC-005.3** Dado um contato de outra organização, quando responde "1", então só os compromissos da organização dele são considerados.
- **AC-005.4** Dado uma confirmação ou pedido de remarcar, quando tratado, então a auditoria registra a ação, o compromisso e a classificação, sem o texto da mensagem do cliente.
- **AC-005.5** Dado qualquer rota nova que altere dados, quando chamada, então declara requireSupportWrite antes do efeito, valida com Zod e gera auditoria.

### REQ-006: Prova e liberação segura

- **AC-006.1** A mudança de schema DEVE sair como migration versionada com apêndice idempotente no baseline, funções novas com revoke de PUBLIC e anon e RLS testada entre duas organizações.
- **AC-006.2** A jornada completa (tipo novo, lembrete no WhatsApp real, cliente responde "1" e outro responde "2", selo na agenda) DEVE ser provada pela tela num ambiente de homologação com WAHA.
- **AC-006.3** Dado a produção com os tipos de agendamento existentes, quando a mudança é implantada, então a sonda de produção dá o mesmo resultado de antes e nenhum lembrete novo é enviado.
- **AC-006.4** QUANDO textos novos são exibidos o sistema DEVE tirá-los do dicionário em pt-BR, en e es, sem texto fixo de marca.

## Requisitos não funcionais

- **Desempenho:** a decisão "isto é confirmação?" é uma regra pura e leve, executada antes do agente; não faz chamada à IA nem à rede.
- **Idempotência:** nenhuma resposta duplicada mesmo com a mesma mensagem entregue duas vezes pelo canal.
- **Privacidade:** o texto do cliente não vai para auditoria; guarda-se só a classificação.
- **Compatibilidade:** lembretes e tipos existentes não mudam de comportamento.
- **Idioma e acessibilidade:** pt-BR, en e es pelo dicionário; selos legíveis por leitor de tela.

## Fora de escopo

- Entender respostas livres do cliente por IA.
- Remarcar ou cancelar automaticamente.
- Lembretes por e-mail ou SMS.
- Google Agenda: novo código ou o processo de verificação do app (vai para o roteiro do dono).
- Mudar as regras de janela de horário e de 24 h do canal oficial.
- Cobrança de falta (no-show).

## Dependências e riscos

- **"1" ou "ok" que não era resposta ao lembrete:** mitigado pela janela de 48 h, compromisso futuro e pendente, e resposta que cita data e hora.
- **Lembrete padrão incomodar:** só tipos novos; chave por tipo e de instalação.
- **Denúncia do número por lembrete fora de hora:** a janela de horário atual continua valendo.
- **Colisão com o agente de IA:** a regra fixa roda antes e o agente não responde à mensagem tratada.
- **Premissa:** a mensagem de entrada chega normalizada ao ponto onde a regra pode atuar antes do agente; a conferência é uma tarefa.
- **Dono:** WhatsApp conectado para a prova pela tela.
