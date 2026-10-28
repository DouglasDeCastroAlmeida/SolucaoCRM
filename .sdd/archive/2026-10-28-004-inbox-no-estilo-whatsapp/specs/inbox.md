# Delta: inbox

> Comportamento ENTREGUE pela mudança 004. Só interface: nenhuma rota, tabela ou migration.

## ADICIONADOS

### Requisito: Tema do inbox pela marca com contraste garantido

O inbox DEVE pintar o balão enviado, o contador de não lidas e os realces com os tokens da marca da organização, e o texto sobre essas cores DEVE ter contraste de pelo menos 4,5:1 nos temas claro e escuro, para qualquer cor de destaque.

- Cenário: Dado uma marca com cor de destaque muito clara, quando o balão enviado é desenhado, então o texto escolhido mantém 4,5:1 sobre o fundo.
- Cenário: Dado nenhuma marca configurada, quando o inbox abre, então usa a marca padrão do produto sem erro.

### Requisito: Lista de conversas no estilo de mensageria

A lista DEVE mostrar foto ou iniciais, nome, prévia da última mensagem ("Você:" quando enviada pela equipe, ícone e rótulo para mídia, nunca o endereço do arquivo), horário curto no fuso da organização, contador de não lidas que some ao abrir a conversa e ícone do canal (genérico para canal desconhecido). As abas "Minhas", "Não atribuídas" (rótulo "Fila" mantido, com a dica) e "IA" DEVEM listar só o que o nome diz, com contagem. A linha DEVE ter foco de teclado visível.

- Cenário: Dado uma mensagem de ontem, quando a lista é desenhada, então o horário é "Ontem".

### Requisito: Conversa com grupos de mensagens, recibos pelo dado e falha visível

A conversa DEVE agrupar mensagens seguidas do mesmo lado em menos de 2 minutos, mostrar separador de dia ("Hoje", "Ontem", data), horário dentro do balão e recibos (relógio, ✓, ✓✓, ✓✓ de lido) guiados somente pelo estado informado pelo canal, sem inventar o que o canal não informa. Mensagem que falhou DEVE aparecer com destaque e a causa. Texto longo DEVE quebrar sem estourar a coluna.

- Cenário: Dado um canal que nunca informa leitura, quando a mensagem é enviada, então só aparece o recibo de enviada.

### Requisito: Atalho "/" para respostas prontas só com permissão

O campo de mensagem DEVE abrir o menu de respostas prontas ao digitar "/" quando a pessoa tem a permissão `message-templates.view`, com título, atalho e prévia, filtrando ao digitar e inserindo o texto para revisão. Sem a permissão, o "/" DEVE seguir como texto. Sem respostas cadastradas, o menu DEVE dizer "Nenhum template. Crie em Configurações".

- Cenário: Dado um usuário sem a permissão, quando digita "/", então nenhum menu abre.

### Requisito: Painel do contato recolhível com estado mantido

O painel do contato DEVE poder ser recolhido, deixando só o fio de reabrir, e manter o estado ao trocar de conversa e ao recarregar, sem perder funil, tags, compromissos e notas.

- Cenário: Dado o painel recolhido, quando a pessoa troca de conversa, então ele segue recolhido.

### Requisito: Textos do inbox nos três idiomas

Todo texto novo do inbox DEVE existir em pt-BR, en e es no dicionário, e o código novo NÃO DEVE conter cor ou nome de marca fixo.

- Cenário: Dado o idioma espanhol, quando o inbox abre, então não há texto em português nos elementos novos.
