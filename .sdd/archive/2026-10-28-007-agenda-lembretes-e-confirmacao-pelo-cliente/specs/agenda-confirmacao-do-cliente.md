# Delta: agenda-confirmacao-do-cliente

> Comportamento ENTREGUE pela mudança 007 (migration 0719, sem tela de configuração nova além do campo por tipo).

## ADICIONADOS

### Requisito: Tipo novo nasce com lembretes padrão

Todo tipo de agendamento criado DEVE nascer com o lembrete ligado em 24 h e 2 h antes, com texto padrão em pt-BR, en ou es conforme o idioma da organização, citando contato, serviço, dia, hora e nome da organização.

- Cenário: Dado um tipo novo, quando é criado, então a lista o mostra com lembrete ligado em 1440 e 120 minutos.

### Requisito: Confirmação do cliente pelo WhatsApp

Quando o tipo tem "Pedir confirmação ao cliente" ligado e a chave de instalação `AGENDA_CONFIRMACAO_CLIENTE` não está desligada, uma resposta "1", "sim", "confirmo", "ok" ou "confirmado" até 48 h depois do lembrete, a um compromisso futuro e pendente do mesmo contato e da mesma organização, DEVE gravar a confirmação do cliente (`client_confirmed_at`) sem alterar o status nem a confirmação da equipe, responder com dia e hora e auditar `agenda.client_confirmed`. Repetir a resposta quando todos os horários elegíveis já estão tratados NÃO DEVE mudar nada nem enviar mensagem.

- Cenário: Dado dois horários abertos, quando o cliente responde "1" duas vezes, então a segunda vale para o outro horário (o mais próximo ainda não tratado); com todos tratados, nada muda.

### Requisito: Pedido de remarcar pelo cliente

Uma resposta "2", "cancelar", "não vou" ou "remarcar" nas mesmas condições DEVE registrar o pedido (`client_reschedule_requested_at`) sem cancelar nem remarcar, levar a conversa à fila de uma pessoa com o agente em silêncio, abrir UM aviso na Central (`agenda_cliente_pediu_remarcar`, nunca para contato anonimizado), responder ao cliente e auditar `agenda.client_requested_reschedule`. Quando a equipe remarca ou cancela pela Agenda, o pedido DEVE ser limpo e fechar só o aviso daquele horário.

- Cenário: Dado um pedido de remarcar, quando a equipe remarca o horário, então o selo some e o aviso daquele horário fica resolvido.

### Requisito: Selos na Agenda e chave por tipo

A Agenda DEVE mostrar "Confirmado pelo cliente" e "Pediu para remarcar". Com a chave do tipo desligada, a resposta NÃO DEVE confirmar nada e segue o fluxo normal da conversa. As respostas automáticas seguem as regras do canal e ficam barradas enquanto ele estiver em modo de teste.

- Cenário: Dado a chave do tipo desligada, quando o cliente responde "1", então nenhum horário é confirmado.
