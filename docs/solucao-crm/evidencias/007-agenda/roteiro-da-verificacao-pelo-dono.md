# Roteiro da verificação pela tela (T-024) — para o dono fazer à noite

Mudança 007: lembretes padrão e confirmação pelo cliente. Ambiente: **homologação** (`https://hml.corretora.io`).
Tempo estimado: 15 minutos. Você precisa de: o login da conta de teste da homologação, o WhatsApp da
homologação conectado, e um celular que possa receber e responder mensagens (o seu).

> Nunca cole senha, chave ou código de login neste arquivo nem no chat. Se aparecer algo secreto numa
> tela, não tire print dessa parte.

## Antes de começar (1 minuto)
1. Abra `https://hml.corretora.io/app/connections` e confirme que existe um número do WhatsApp com
   bolinha verde (conectado). Se não estiver, conecte pelo QR e volte aqui.
2. Tenha um **contato seu** cadastrado com o número do celular que vai usar. Se não existir, crie em
   Contatos (nome qualquer, telefone com DDD).

## Parte 1 — Tipo novo já nasce com lembretes
1. Abra **Configurações › Agenda** (`/app/settings/tenant/agenda`).
2. Clique para criar um **tipo de agendamento novo** (nome livre, por exemplo "Teste lembrete").
3. Na lista, o tipo novo deve mostrar o lembrete **ligado**, com **1440 e 120** minutos (24 h e 2 h).
   - Esperado: sim. Se aparecer desligado, anote e me avise.
4. Clique em **Editar** nesse tipo e confira o texto padrão. Ele deve citar o nome do contato, o serviço,
   o dia, a hora e o nome da organização, e **não** a frase "Responda 1 ... 2 ..." (ela só aparece depois
   do próximo passo).

## Parte 2 — Ligar a confirmação pelo cliente
1. Ainda em **Editar**, marque **"Pedir confirmação ao cliente"** e salve.
2. Clique em **"Ativar lembretes padrão"** se o botão aparecer (só aparece em tipo sem lembrete). Não é
   necessário neste tipo novo.
3. Abra o tipo de novo: o texto do lembrete só ganha a frase "Responda 1 para confirmar ou 2 para
   remarcar" quando os lembretes padrão são (re)gerados com a chave ligada. Se quiser ver a frase, crie
   **outro** tipo novo depois de ligar a chave global, ou use "Ativar lembretes padrão" num tipo sem lembrete.
   - Isto é uma limitação conhecida: ligar a chave **não reescreve** um lembrete que já existe.

## Parte 3 — Confirmar com "1"
1. Em **Agenda**, marque um horário **futuro** para o seu contato, usando o tipo da Parte 2.
2. Para não esperar 24 h, peça a mim para registrar que o lembrete já foi enviado nesse horário
   (eu faço pelo banco, só leitura/escrita nesse registro de teste). Diga "pronto para o passo 3".
3. No celular, responda ao WhatsApp da homologação com **1**.
4. Em até 1 minuto, abra **Agenda** (`/app/agenda`): o horário deve mostrar o selo
   **"Confirmado pelo cliente"** com a hora da confirmação.
5. O celular deve receber um agradecimento curto citando o dia e a hora.
6. Responda **1** de novo: **nada** deve mudar e nenhuma nova mensagem deve chegar.

## Parte 4 — Pedir para remarcar com "2"
1. Marque **outro** horário futuro para o mesmo contato (ou outro contato seu), mesmo tipo.
2. Peça a mim para registrar o lembrete como enviado (mesmo procedimento).
3. No celular, responda **2**.
4. Esperado, em até 1 minuto:
   - na **Agenda**, o horário mostra **"Pediu para remarcar"** em destaque;
   - na **Central** (`/app/ai/inbox`) aparece **um** aviso "Um cliente pediu para remarcar um horário";
   - a **conversa** vai para a fila de uma pessoa (o agente de IA fica em silêncio nela);
   - o celular recebe uma mensagem dizendo que a equipe entrará em contato;
   - **nada** foi cancelado: o horário continua marcado.
5. Responda **2** de novo: nenhum aviso novo, nenhuma mensagem nova.

## Parte 5 — A equipe remarca e a pendência some
1. Na Agenda, **remarque** esse horário para outra data.
2. Esperado: o selo "Pediu para remarcar" **some** e o aviso da Central **fecha**.

## Parte 6 — Desligar
1. Em **Editar** o tipo, desmarque "Pedir confirmação ao cliente" e salve.
2. Marque um novo horário, registre o lembrete como enviado (peça a mim) e responda **1**.
3. Esperado: **nada** é confirmado; a mensagem segue o fluxo normal da conversa.

## O que me mandar depois
- Um "deu certo" por parte, ou o que não bateu (com um print da tela, **sem** dados secretos).
- Eu gravo as evidências em `evidence/007-agenda/` e marco a tarefa T-024.

## Onde olhar se algo falhar
- Runbook completo: `docs/solucao-crm/runbooks/agenda-confirmacao-do-cliente.md`.
- A chave de instalação `AGENDA_CONFIRMACAO_CLIENTE` (vazia = ligada) desliga tudo sem apagar dados.
