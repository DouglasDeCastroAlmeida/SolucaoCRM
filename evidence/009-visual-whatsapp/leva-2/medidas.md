# Medidas — leva 2 (listas como conversa) na homologação

Base: https://hml.corretora.io. Gerado por tests/journeys/visual-whatsapp-leva-2.spec.ts. Dados: só fictícios com o prefixo "[teste-009]".
Esperado: rolagem lateral <= 0; no celular altura de cada linha >= 44 px, menor alvo por linha >= 44 px,
ações da linha visíveis sem hover; contraste de todo texto de <main> >= 4.5:1.

- PASSOU contacts/claro/1440: rolagem lateral=0; linhas=8; linha mais baixa=66.91px; menor alvo=36px ("Iniciar conversa com [teste-009] Heitor "); ações visíveis sem hover=24/24; textos medidos=74; abaixo de 4.5:1=0
- PASSOU tasks/claro/1440: rolagem lateral=0; linhas=5; linha mais baixa=62.69px; menor alvo=36px ("Editar a tarefa"); ações visíveis sem hover=0/10; textos medidos=34; abaixo de 4.5:1=0
- PASSOU cases/claro/1440: rolagem lateral=0; linhas=0 (estado vazio); textos medidos=8; abaixo de 4.5:1=0
- PASSOU followups-fluxos/claro/1440: rolagem lateral=0; linhas=1; linha mais baixa=67.91px; menor alvo=32px ("Renomear"); ações visíveis sem hover=4/4; textos medidos=21; abaixo de 4.5:1=0
- PASSOU followups-fila/claro/1440: rolagem lateral=0; linhas=0 (estado vazio); textos medidos=8; abaixo de 4.5:1=0
- PASSOU central/claro/1440: rolagem lateral=0; linhas=3; linha mais baixa=124.81px; menor alvo=32px ("Revisar conexão"); ações visíveis sem hover=3/3; textos medidos=30; abaixo de 4.5:1=0
- PASSOU kanban/claro/1440: rolagem lateral=0; linhas=n/a; textos medidos=10; abaixo de 4.5:1=0
- PASSOU agenda/claro/1440: rolagem lateral=0; linhas=n/a; textos medidos=46; abaixo de 4.5:1=0
- PASSOU contacts/escuro/1440: rolagem lateral=0; linhas=8; linha mais baixa=66.91px; menor alvo=36px ("Iniciar conversa com [teste-009] Heitor "); ações visíveis sem hover=24/24; textos medidos=74; abaixo de 4.5:1=0
- FALHOU tasks/escuro/1440: rolagem lateral=0; linhas=5; linha mais baixa=62.69px; menor alvo=36px ("Editar a tarefa"); ações visíveis sem hover=0/10; textos medidos=34; abaixo de 4.5:1=1 | contraste < 4.5: "Atrasadas" 4.37
- PASSOU cases/escuro/1440: rolagem lateral=0; linhas=0 (estado vazio); textos medidos=8; abaixo de 4.5:1=0
- PASSOU followups-fluxos/escuro/1440: rolagem lateral=0; linhas=1; linha mais baixa=67.91px; menor alvo=32px ("Renomear"); ações visíveis sem hover=4/4; textos medidos=21; abaixo de 4.5:1=0
- PASSOU followups-fila/escuro/1440: rolagem lateral=0; linhas=0 (estado vazio); textos medidos=8; abaixo de 4.5:1=0
- PASSOU central/escuro/1440: rolagem lateral=0; linhas=3; linha mais baixa=124.81px; menor alvo=32px ("Revisar conexão"); ações visíveis sem hover=3/3; textos medidos=30; abaixo de 4.5:1=0
- PASSOU kanban/escuro/1440: rolagem lateral=0; linhas=n/a; textos medidos=10; abaixo de 4.5:1=0
- PASSOU agenda/escuro/1440: rolagem lateral=0; linhas=n/a; textos medidos=46; abaixo de 4.5:1=0
- FALHOU contacts/claro/390: rolagem lateral=0; linhas=8; linha mais baixa=110.72px; menor alvo=42px ("Selecionar contato [teste-009] Heitor Ex"); ações visíveis sem hover=24/24; textos medidos=66; abaixo de 4.5:1=0 | menor alvo 42 px ("Selecionar contato [teste-009] Heitor Ex")
- FALHOU tasks/claro/390: rolagem lateral=0; linhas=5; linha mais baixa=62.69px; menor alvo=28px ("Editar a tarefa"); ações visíveis sem hover=10/10; textos medidos=34; abaixo de 4.5:1=0 | menor alvo 28 px ("Editar a tarefa")
- PASSOU cases/claro/390: rolagem lateral=0; linhas=0 (estado vazio); textos medidos=8; abaixo de 4.5:1=0
- FALHOU followups-fluxos/claro/390: rolagem lateral=0; linhas=1; linha mais baixa=184.34px; menor alvo=24px ("[E[teste-009] Fluxo de exemploRascunhoVe"); ações visíveis sem hover=4/4; textos medidos=21; abaixo de 4.5:1=0 | menor alvo 24 px ("[E[teste-009] Fluxo de exemploRascunhoVe")
- PASSOU followups-fila/claro/390: rolagem lateral=0; linhas=0 (estado vazio); textos medidos=8; abaixo de 4.5:1=0
- FALHOU central/claro/390: rolagem lateral=0; linhas=3; linha mais baixa=918.67px; menor alvo=35.81px ("Revisar conexão"); ações visíveis sem hover=3/3; textos medidos=30; abaixo de 4.5:1=0 | menor alvo 35.81 px ("Revisar conexão")
- PASSOU kanban/claro/390: rolagem lateral=0; linhas=n/a; textos medidos=10; abaixo de 4.5:1=0
- PASSOU agenda/claro/390: rolagem lateral=0; linhas=n/a; textos medidos=34; abaixo de 4.5:1=0
- FALHOU contacts/escuro/390: rolagem lateral=0; linhas=8; linha mais baixa=110.72px; menor alvo=42px ("Selecionar contato [teste-009] Heitor Ex"); ações visíveis sem hover=24/24; textos medidos=66; abaixo de 4.5:1=0 | menor alvo 42 px ("Selecionar contato [teste-009] Heitor Ex")
- FALHOU tasks/escuro/390: rolagem lateral=0; linhas=5; linha mais baixa=62.69px; menor alvo=28px ("Editar a tarefa"); ações visíveis sem hover=10/10; textos medidos=34; abaixo de 4.5:1=1 | contraste < 4.5: "Atrasadas" 4.37; menor alvo 28 px ("Editar a tarefa")
- PASSOU cases/escuro/390: rolagem lateral=0; linhas=0 (estado vazio); textos medidos=8; abaixo de 4.5:1=0
- FALHOU followups-fluxos/escuro/390: rolagem lateral=0; linhas=1; linha mais baixa=184.34px; menor alvo=24px ("[E[teste-009] Fluxo de exemploRascunhoVe"); ações visíveis sem hover=4/4; textos medidos=21; abaixo de 4.5:1=0 | menor alvo 24 px ("[E[teste-009] Fluxo de exemploRascunhoVe")
- PASSOU followups-fila/escuro/390: rolagem lateral=0; linhas=0 (estado vazio); textos medidos=8; abaixo de 4.5:1=0
- FALHOU central/escuro/390: rolagem lateral=0; linhas=3; linha mais baixa=918.67px; menor alvo=35.81px ("Revisar conexão"); ações visíveis sem hover=3/3; textos medidos=30; abaixo de 4.5:1=0 | menor alvo 35.81 px ("Revisar conexão")
- PASSOU kanban/escuro/390: rolagem lateral=0; linhas=n/a; textos medidos=10; abaixo de 4.5:1=0
- PASSOU agenda/escuro/390: rolagem lateral=0; linhas=n/a; textos medidos=34; abaixo de 4.5:1=0

- PASSOU comportamento: busca filtra a lista (8 linhas -> 1 para "Carla Inventada")
- PASSOU comportamento: ordenar por Nome muda a ordem e o 2º clique inverte (original!=1º clique: true)
- PASSOU comportamento: caixa da linha seleciona e mostra a barra de lote (marcada=true, barra=true)
- PASSOU comportamento: cancelar o lote limpa a seleção e some a barra
- PASSOU comportamento: abrir uma linha leva ao detalhe do contato (URL /app/contacts/<id>)
- PASSOU comportamento: marcar tarefa como concluída grava a situação (situação=done; linha saiu da lista 'Em aberto')
- PASSOU comportamento: desmarcar a tarefa a reabre (restaurada) (situação=pending)

(Nota: as linhas de comportamento são da 2ª execução do roteiro; a 1ª teve o passo de ordenar reprovado por corrida na leitura da lista, corrigida no spec. Medidas de tela são da execução completa.)
## Dados fictícios
- Criados: 8 contatos, 6 tarefas, 1 fluxo(s) de follow-up.
- Obs.: contato bloqueado: sem porta de API que bloqueie sem mensagem/opt-out; não criado
- Obs.: casos e avisos da Central: sem rota de criação sem efeito externo; capturados no estado real da hml
- Removidos: 8 contatos apagados, 0 anonimizados, 6 tarefas, 1 fluxo(s).
- Sobrou: nada
