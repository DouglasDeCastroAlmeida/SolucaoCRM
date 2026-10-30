# Leva 2 (listas como conversa) na homologação — comparação e medidas

Feita na homologação (hml.corretora.io, imagem 03284b9d1), nunca na produção. A hml estava vazia, então criei **dados fictícios** com o prefixo "[teste-009]" (8 contatos, 6 tarefas, 1 fluxo de follow-up), tirei as fotos e **apaguei tudo** no fim. Casos e avisos da Central não têm como ser criados sem efeito externo (precisam de canal/conversa): ficaram no estado real da hml (casos e fila vazios; a Central mostra 3 avisos reais da própria hml, sem nome de cliente). O contato "bloqueado" não foi criado: não há porta que bloqueie sem mensagem de saída.

Medidas completas: [medidas.md](medidas.md). Roteiro que gerou tudo: tests/journeys/visual-whatsapp-leva-2.spec.ts.

## Resumo em uma frase

No computador (1440) a leva 2 está boa: sem rolagem lateral, linhas de 62 a 125 px, contraste ok (uma exceção pequena). **No celular (390) ela NÃO está pronta**: Contatos, Tarefas, Follow-ups (Fluxos) e Central falham em alvo de toque, e Follow-ups (Fluxos) e Central estão visivelmente quebrados. Não consertei nada, só registrei.

## Resultado por medida (resumo)

| Medida | Computador 1440 | Celular 390 |
|---|---|---|
| Sem rolagem lateral | PASSOU em todas as telas | PASSOU em todas (mas Casos fica cortado à direita sem rolagem; veja Achados) |
| Altura mínima da linha >= 44 px | PASSOU (linhas de 62 a 125 px) | PASSOU (a menor é 62,7 px, em Tarefas) |
| Menor alvo de toque por linha >= 44 px | n/a (mouse) | **FALHOU** em Contatos (42 px, caixa de selecionar), Tarefas (28 px, editar/apagar), Follow-ups Fluxos (24 px) e Central (35,8 px, "Revisar conexão") |
| Ações da tarefa visíveis sem hover | n/a | PASSOU (10 de 10 visíveis) |
| Contraste >= 4,5 de todo texto da tela | PASSOU, exceto Tarefas escuro: "Atrasadas" 4,37 | igual: Tarefas escuro "Atrasadas" 4,37 |
| Busca filtra em Contatos | PASSOU (8 linhas viraram 1) | não medido |
| Ordenar por Nome muda a ordem | PASSOU (o 2º clique inverte) | não medido |
| Caixa da linha seleciona, aparece a barra de lote; cancelar limpa | PASSOU ([captura do lote](contacts-lote-claro-1440.png)) | não medido |
| Concluir tarefa e reabrir | PASSOU (foi a done e voltou a pending) | não medido |
| Abrir uma linha leva ao detalhe | PASSOU | não medido |

## Tabela por tela, tema e tamanho

| Tela | Tema | Tamanho | Resultado | O que as medidas disseram | Captura |
|---|---|---|---|---|---|
| contacts | claro | 1440 | PASSOU | 8 linhas de 67 px; menor alvo 36 px (só mouse); contraste ok | [contacts-claro-1440.png](contacts-claro-1440.png) |
| contacts | claro | 390 | FALHOU | menor alvo 42 px (caixa de selecionar); linha 110 px; o nome do contato não aparece na linha | [contacts-claro-390.png](contacts-claro-390.png) |
| contacts | escuro | 1440 | PASSOU | 8 linhas de 67 px; menor alvo 36 px (só mouse); contraste ok | [contacts-escuro-1440.png](contacts-escuro-1440.png) |
| contacts | escuro | 390 | FALHOU | menor alvo 42 px (caixa de selecionar); linha 110 px; o nome do contato não aparece na linha | [contacts-escuro-390.png](contacts-escuro-390.png) |
| tasks | claro | 1440 | PASSOU | 5 linhas de 63 px; contraste ok | [tasks-claro-1440.png](tasks-claro-1440.png) |
| tasks | claro | 390 | FALHOU | editar/apagar com 28 px (precisa 44); ações visíveis sem hover (passou) | [tasks-claro-390.png](tasks-claro-390.png) |
| tasks | escuro | 1440 | FALHOU | contraste: "Atrasadas" 4,37 (piso 4,5); linhas de 63 px | [tasks-escuro-1440.png](tasks-escuro-1440.png) |
| tasks | escuro | 390 | FALHOU | editar/apagar com 28 px; contraste "Atrasadas" 4,37 | [tasks-escuro-390.png](tasks-escuro-390.png) |
| cases | claro | 1440 | PASSOU | estado vazio (nenhum caso aberto) | [cases-claro-1440.png](cases-claro-1440.png) |
| cases | claro | 390 | PASSOU | estado vazio; porém o painel "Selecione um caso" fica cortado à direita (visual, ver Achados) | [cases-claro-390.png](cases-claro-390.png) |
| cases | escuro | 1440 | PASSOU | estado vazio (nenhum caso aberto) | [cases-escuro-1440.png](cases-escuro-1440.png) |
| cases | escuro | 390 | PASSOU | estado vazio; porém o painel "Selecione um caso" fica cortado à direita (visual, ver Achados) | [cases-escuro-390.png](cases-escuro-390.png) |
| followups-fluxos | claro | 1440 | PASSOU | 1 linha de 68 px; ações de 32 px (só mouse); contraste ok | [followups-fluxos-claro-1440.png](followups-fluxos-claro-1440.png) |
| followups-fluxos | claro | 390 | FALHOU | menor alvo 24 px; linha 184 px; texto sobreposto aos botões e botões cortados à direita | [followups-fluxos-claro-390.png](followups-fluxos-claro-390.png) |
| followups-fluxos | escuro | 1440 | PASSOU | 1 linha de 68 px; ações de 32 px (só mouse); contraste ok | [followups-fluxos-escuro-1440.png](followups-fluxos-escuro-1440.png) |
| followups-fluxos | escuro | 390 | FALHOU | menor alvo 24 px; linha 184 px; texto sobreposto aos botões e botões cortados à direita | [followups-fluxos-escuro-390.png](followups-fluxos-escuro-390.png) |
| followups-fila | claro | 1440 | PASSOU | estado vazio (nenhum item na fila) | [followups-fila-claro-1440.png](followups-fila-claro-1440.png) |
| followups-fila | claro | 390 | PASSOU | estado vazio (nenhum item na fila) | [followups-fila-claro-390.png](followups-fila-claro-390.png) |
| followups-fila | escuro | 1440 | PASSOU | estado vazio (nenhum item na fila) | [followups-fila-escuro-1440.png](followups-fila-escuro-1440.png) |
| followups-fila | escuro | 390 | PASSOU | estado vazio (nenhum item na fila) | [followups-fila-escuro-390.png](followups-fila-escuro-390.png) |
| central | claro | 1440 | PASSOU | 3 avisos reais da hml, linhas de 125 px; contraste ok | [central-claro-1440.png](central-claro-1440.png) |
| central | claro | 390 | FALHOU | menor alvo 35,8 px; linhas de 918 px com o conteúdo sumido no meio | [central-claro-390.png](central-claro-390.png) |
| central | escuro | 1440 | PASSOU | 3 avisos reais da hml, linhas de 125 px; contraste ok | [central-escuro-1440.png](central-escuro-1440.png) |
| central | escuro | 390 | FALHOU | menor alvo 35,8 px; linhas de 918 px com o conteúdo sumido no meio | [central-escuro-390.png](central-escuro-390.png) |
| kanban | claro | 1440 | PASSOU | tela de lista de funis (hml sem quadro aberto); contraste ok | [kanban-claro-1440.png](kanban-claro-1440.png) |
| kanban | claro | 390 | PASSOU | tela de lista de funis (hml sem quadro aberto); contraste ok | [kanban-claro-390.png](kanban-claro-390.png) |
| kanban | escuro | 1440 | PASSOU | tela de lista de funis (hml sem quadro aberto); contraste ok | [kanban-escuro-1440.png](kanban-escuro-1440.png) |
| kanban | escuro | 390 | PASSOU | tela de lista de funis (hml sem quadro aberto); contraste ok | [kanban-escuro-390.png](kanban-escuro-390.png) |
| agenda | claro | 1440 | PASSOU | agenda vazia; contraste ok | [agenda-claro-1440.png](agenda-claro-1440.png) |
| agenda | claro | 390 | PASSOU | agenda vazia; contraste ok | [agenda-claro-390.png](agenda-claro-390.png) |
| agenda | escuro | 1440 | PASSOU | agenda vazia; contraste ok | [agenda-escuro-1440.png](agenda-escuro-1440.png) |
| agenda | escuro | 390 | PASSOU | agenda vazia; contraste ok | [agenda-escuro-390.png](agenda-escuro-390.png) |

## Achados (o que o dono precisa saber)

1. **Contatos no celular**: na linha, o nome da pessoa não aparece (só e-mail, telefone, etiquetas e o selo "Ativo"), a linha tem 110 px e os ícones de ação ficam em cima do telefone. Veja [contatos claro 390](contacts-claro-390.png) e [contatos escuro 390](contacts-escuro-390.png). A caixa de selecionar tem 42 px de toque (faltam 2 px).
2. **Tarefas no celular**: os botões editar e apagar medem 28 px (piso 44 px). Eles estão visíveis sem hover (isso passou). Veja [tarefas claro 390](tasks-claro-390.png).
3. **Follow-ups (Fluxos) no celular**: texto "Versão/Handoff" sobreposto ao botão Renomear e botões Duplicar/Exportar cortados na borda. Veja [fluxos claro 390](followups-fluxos-claro-390.png) e [fluxos escuro 390](followups-fluxos-escuro-390.png).
4. **Central no celular**: cada aviso vira um bloco de 918 px quase vazio, com o texto espremido. Veja [central claro 390](central-claro-390.png) e [central escuro 390](central-escuro-390.png). No computador está bom: [central claro 1440](central-claro-1440.png).
5. **Casos no celular**: o painel da direita ("Selecione um caso") escapa da tela e fica cortado, sem barra de rolagem (por isso a medida de rolagem passou). Veja [casos claro 390](cases-claro-390.png) e [casos escuro 390](cases-escuro-390.png). A hml não tem caso, então não há linha de caso para medir.
6. **Contraste**: só um texto reprova, "Atrasadas" no tema escuro (4,37 contra 4,5), em [tarefas escuro 1440](tasks-escuro-1440.png) e [tarefas escuro 390](tasks-escuro-390.png).
7. A hml roda a imagem 03284b9d1. O commit que torna as ações da tarefa visíveis no celular (6c68e064c) pode não estar nessa imagem; a medida "visíveis sem hover" passou mesmo assim, mas os 28 px continuam. Quem confirmar se a correção já está na imagem decide se é defeito aberto.

## Antes (capturas antigas versionadas; só a Central é comparável)

- Central antes, claro: [16-tema-light-central.png](evidence/006-agente/hml-2026-10-29/16-tema-light-central.png)
- Central antes, escuro: [20-tema-dark-central.png](evidence/006-agente/hml-2026-10-29/20-tema-dark-central.png)
- Central depois: [central claro 1440](central-claro-1440.png) e [central escuro 1440](central-escuro-1440.png)

Contatos, Tarefas, Casos e Follow-ups não têm foto antiga na pasta 006; para eles vale a comparação da leva 1 (evidence/009-visual-whatsapp/leva-1/COMPARACAO.md).

## Para o dono olhar primeiro

1. [Contatos, computador, claro](contacts-claro-1440.png) — a lista como conversa, em boa forma.
2. [Contatos com uma linha selecionada e a barra de lote](contacts-lote-claro-1440.png).
3. [Tarefas, computador, escuro](tasks-escuro-1440.png) — grupos por prazo; repare em "Atrasadas".
4. [Central, computador, claro](central-claro-1440.png) — avisos como linhas.
5. [Contatos, celular, claro](contacts-claro-390.png) — onde o nome some.
6. [Follow-ups Fluxos, celular, escuro](followups-fluxos-escuro-390.png) — a tela mais quebrada no celular.

## O que foi criado e removido

Criados na hml (todos com "[teste-009]", dados inventados, e-mail ".invalid"): 8 contatos, 6 tarefas, 1 fluxo de follow-up. Removidos no fim: 8 contatos apagados, 6 tarefas e 1 fluxo apagados; 2 tarefas que sobraram de uma corrida interrompida também foram apagadas. Sobrou: nada (conferido ao final pelo próprio roteiro).
