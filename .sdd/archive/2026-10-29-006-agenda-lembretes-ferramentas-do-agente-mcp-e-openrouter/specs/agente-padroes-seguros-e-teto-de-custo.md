# Delta: agente-padroes-seguros-e-teto-de-custo

## ADICIONADOS

### Requisito: Agente novo nasce sem enviar nada e em aprovar antes de enviar

Agente novo DEVE nascer sem versão publicada e no modo "aprovar antes de enviar" (operation_mode = assisted); nenhuma mensagem sai até um administrador publicar e ligar. Linhas existentes NÃO mudam. A resposta redigida DEVE ficar pendente até aprovação de uma pessoa, e texto alterado depois de aprovado exige nova aprovação. Desligar o agente DEVE parar o envio na hora e manter as respostas pendentes para revisão humana.

- Cenário: Dado um agente novo, quando uma mensagem chega, então a resposta é redigida e fica pendente.
- Cenário: Dado uma resposta aprovada, quando o texto é editado, então exige nova aprovação.

### Requisito: Modo automático só com confirmação do administrador

A troca para "automático" DEVE exigir papel de administrador (outro papel recebe recusa), mostrar tela dizendo que o agente responderá sozinho e que o custo vai na chave do admin, e só valer após o clique de confirmação. A confirmação DEVE ser auditada com quem, quando e qual agente, sem conteúdo de mensagens.

- Cenário: Dado um gerente, quando tenta o modo automático, então a rota recusa.
- Cenário: Dado um admin que confirma, quando o clique acontece, então há uma entrada de auditoria com ator e agente.

### Requisito: Teto de custo obrigatório, aviso em 80 por cento e parada em 100 por cento

Ao publicar um agente, o sistema DEVE garantir um teto de custo com valor padrão (nunca "sem teto" silencioso; modo de teto bloquear para linhas novas). Em 80% DEVE avisar o admin na Central e por e-mail uma única vez no período; em 100% DEVE parar o agente, mandar as conversas pendentes à fila humana e avisar na Central. Novo período zera o contador.

- Cenário: Dado gasto de 80% do teto, quando o limiar é cruzado, então um aviso na Central e um e-mail, uma só vez no período.
- Cenário: Dado gasto de 100%, quando cruzado, então o agente deixa de responder e as pendentes vão à fila humana.

### Requisito: Uso por agente com custo estimado marcado

A tela de uso DEVE mostrar tokens, custo e teto do período por agente e total. Quando o provedor não informa custo, o valor DEVE aparecer marcado "estimado", sem preço inventado.

- Cenário: Dado um provedor sem custo informado, quando o uso é mostrado, então tokens aparecem e o custo vem como estimado.
