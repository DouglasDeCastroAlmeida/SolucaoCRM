# Delta: agente-transferencia-e-ferramentas

## ADICIONADOS

### Requisito: Transferência para humano

O agente DEVE transferir a conversa à fila humana quando o cliente pede uma pessoa ou quando não sabe responder com segurança, e parar de responder nela. Duas falhas seguidas de chamada de ferramenta na mesma conversa DEVEM transferir com o motivo registrado. A pessoa que assume DEVE ver o histórico e o motivo.

- Cenário: Dado o cliente pedindo atendente, quando o agente recebe a mensagem, então a conversa vai à fila humana.
- Cenário: Dado dois erros seguidos de ferramenta, quando o segundo ocorre, então a conversa é transferida com motivo.

### Requisito: Ferramentas do agente idempotentes e restritas à organização

As ferramentas de agendar, mover etapa, criar tarefa (crm_create_task) e consultar conhecimento DEVEM ser idempotentes (repetição não duplica efeito), validar argumentos (inválido devolve erro claro ao modelo e não grava) e atuar só na organização do agente. A consulta de conhecimento DEVE citar a fonte.

- Cenário: Dado a mesma criação de tarefa repetida, quando executada, então existe uma só tarefa.
- Cenário: Dado argumentos inválidos, quando a ferramenta roda, então erro claro e nada gravado.
