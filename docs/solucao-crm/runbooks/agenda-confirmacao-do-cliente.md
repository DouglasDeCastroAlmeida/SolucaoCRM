# Agenda: lembretes e confirmação pelo cliente

Para quem opera a instalação (o dono). Explica o que mudou na agenda, como ligar a
confirmação pelo cliente, como desligar e o que fazer quando alguém responde "2".

## 1. O que mudou

- **Tipo de agendamento novo já nasce com lembretes.** O cliente recebe uma mensagem no
  WhatsApp 24 horas e outra 2 horas antes do horário, com um texto padrão (em português,
  espanhol ou inglês, conforme o idioma da organização). Você pode editar o texto.
- **Tipos que já existiam não mudaram.** Nenhum ganhou lembrete, perdeu lembrete ou
  recebeu mensagem por causa desta atualização.
- **Confirmação pelo cliente (opcional, por tipo).** Com ela ligada, o lembrete pede:
  "Responda 1 para confirmar ou 2 para remarcar." Quando o cliente responde:
  - **"1"** (ou "sim"): a agenda mostra o selo **Confirmado pelo cliente** e o cliente
    recebe um agradecimento com dia e hora.
  - **"2"** (ou "cancelar", "não vou", "remarcar"): a agenda mostra **Pediu para remarcar**,
    aparece um aviso na Central e a conversa vai para a fila de atendimento. **Nada é
    cancelado nem remarcado sozinho.**
- Resposta que não é de um lembrete recente segue o fluxo normal da conversa.

## 2. Como ligar a confirmação em um tipo

1. Abra **Configurações › Agenda** (tipos de agendamento).
2. No tipo desejado, clique em **Editar**.
3. Marque **Pedir confirmação ao cliente** e clique em **Salvar**.

Vale só para esse tipo. Os outros seguem como estavam.

## 3. "Ativar lembretes padrão" (tipos antigos)

Tipo antigo sem lembretes mostra o botão **Ativar lembretes padrão**. Clique nele para ligar
os lembretes de 24 h e 2 h com o texto padrão. Só clicando: nada liga sozinho. Se o tipo já
tem lembretes, o sistema avisa e não mexe.

## 4. A chave `AGENDA_CONFIRMACAO_CLIENTE` (liga/desliga da instalação)

- Fica no arquivo `.env` da instalação. Vazia ou ausente = ligada.
- Para **desligar tudo** (interruptor de emergência): escreva `AGENDA_CONFIRMACAO_CLIENTE=off`
  (também vale `false`, `0`, `no` ou `desligado`, em maiúscula ou minúscula) e recrie o app
  como no runbook de deploy (`docs/runbooks/deploy.md`, com os dois arquivos de compose).
- Desligada, "1" e "2" voltam a ser mensagens comuns da conversa e o lembrete deixa de
  pedir a resposta. **Nenhum dado é apagado**: o que já foi confirmado continua na agenda.

## 5. Como desligar só em um tipo

Em **Configurações › Agenda**, **Editar** o tipo, desmarque **Pedir confirmação ao cliente**
e **Salvar**.

## 6. O que fazer quando alguém responde "2"

1. Veja o aviso **Um cliente pediu para remarcar um horário** na Central, ou a marca
   **Pediu para remarcar** no compromisso da agenda.
2. Abra a conversa (ela já está na fila de atendimento, e o agente de IA fica calado nela).
3. Combine o novo horário com o cliente e **remarque ou cancele pela agenda**. Ao fazer
   isso, a marca de pedido some.
4. Até lá, o horário continua reservado para o cliente.

## 7. Situação do Google Agenda

A sincronização com o Google Agenda já funciona. O que falta é externo ao sistema: a
**verificação do aplicativo pelo Google**. Até ela sair, o Google permite **até 100 usuários**
conectados e mostra aos clientes uma **tela de aviso** ("app não verificado") na hora de
autorizar. Quem passa por ela precisa clicar em "Avançado" e continuar. Acompanhe o processo
no painel do Google Cloud; quando for aprovado, a tela de aviso some sem mudar nada no
sistema.

## 8. Conferir depois de atualizar

Na VPS, a partir da pasta do projeto (somente leitura):

```bash
bash tests/infra/vps/sondas.sh agenda-tipos-inalterados
```

Tem de dizer que as 3 colunas novas existem, que **nenhum** tipo tem a confirmação ligada
(antes de você ligar a primeira) e que `/` responde 200 e `/app` responde 307.
