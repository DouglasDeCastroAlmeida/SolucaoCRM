# Leva 1 (casca estilo WhatsApp) na homologação: comparação para o dono

Refeito do zero em 29/10/2026 contra https://hml.corretora.io, já com a imagem 8bc1140d9 (que corrige o contraste do número do sino no tema escuro). Nada foi criado nem alterado lá: o menu e o tema ficaram como estavam. As medidas linha por linha estão em [medidas.md](medidas.md).

## Para o dono olhar primeiro

As 6 capturas que melhor mostram a nova cara:

1. [Inbox, claro, computador](inbox-claro-1440.png): menu fino à esquerda, barra de cima, três colunas de conversa.
2. [Inbox, escuro, computador](inbox-escuro-1440.png): o mesmo no tema escuro; olhe o número do sino (agora texto escuro sobre o coral).
3. [Inbox, claro, celular](inbox-claro-390.png): barra de baixo com Inbox, Funis, Agenda, Desempenho e Mais.
4. [Contatos, escuro, celular](contacts-escuro-390.png): botões grandes para o dedo, tema escuro.
5. [Configurações, claro, computador](settings-claro-1440.png): cartões de atalho.
6. [Menu expandido](menu-expandido-claro-1440.png): o menu aberto com 240 px e os grupos (Atendimento, CRM, Agente de IA, Canais, Análise).

## Resumo em palavras simples

- **Tudo passou.** Menu recolhido com 64 px no computador (18 de 18 capturas), barra de cima com 56 px (36 de 36), nenhuma rolagem lateral (36 de 36), botões da barra de baixo do celular com 44 px (18 de 18, no limite exato), menu abre com 240 px, lembra a escolha ao recarregar e volta a recolher.
- **O contraste do sino no escuro agora passa.** Antes era 3,48:1 (mínimo 4,5). Agora o spec de contraste passa nas 6 telas, nos dois temas. Valor lido nos pixels da captura [inbox-escuro-390.png](inbox-escuro-390.png) (fundo coral 200/114/99, texto 22/21/16): cerca de 5,3:1. É uma leitura aproximada da imagem; o spec não imprime o número, só reprova abaixo de 4,5.
- **Ressalva (não é falha):** a hml não tem funil, contato nem conversa. A tela Funis mostra só a lista de funis, sem colunas, então a forma do kanban com cartões **não foi provada**.
- **Detalhe de captura:** em duas fotos o sino saiu sem o número (carregou depois da foto): [usage-escuro-1440.png](usage-escuro-1440.png) e [settings-escuro-390.png](settings-escuro-390.png). Também no [menu expandido](menu-expandido-claro-1440.png) a lista de conversas aparece como retângulos cinza (carregando). Nada disso é defeito medido.

## Medidas por tela (36 capturas, todas PASSOU)

Legenda: Menu = largura do menu recolhido (esperado 64 no computador; no celular o menu é gaveta). Topo = altura da barra de cima (56). Lateral = sem rolagem lateral. Alvo = menor botão da barra de baixo (44 ou mais, só celular).

| Tela | Tema | Tamanho | Menu | Topo | Lateral | Alvo | Captura |
|---|---|---|---|---|---|---|---|
| Inbox | claro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [inbox-claro-1440.png](inbox-claro-1440.png) |
| Inbox | claro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [inbox-claro-390.png](inbox-claro-390.png) |
| Inbox | escuro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [inbox-escuro-1440.png](inbox-escuro-1440.png) |
| Inbox | escuro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [inbox-escuro-390.png](inbox-escuro-390.png) |
| Contatos | claro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [contacts-claro-1440.png](contacts-claro-1440.png) |
| Contatos | claro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [contacts-claro-390.png](contacts-claro-390.png) |
| Contatos | escuro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [contacts-escuro-1440.png](contacts-escuro-1440.png) |
| Contatos | escuro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [contacts-escuro-390.png](contacts-escuro-390.png) |
| Funis | claro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [kanban-claro-1440.png](kanban-claro-1440.png) |
| Funis | claro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [kanban-claro-390.png](kanban-claro-390.png) |
| Funis | escuro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [kanban-escuro-1440.png](kanban-escuro-1440.png) |
| Funis | escuro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [kanban-escuro-390.png](kanban-escuro-390.png) |
| Agenda | claro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [agenda-claro-1440.png](agenda-claro-1440.png) |
| Agenda | claro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [agenda-claro-390.png](agenda-claro-390.png) |
| Agenda | escuro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [agenda-escuro-1440.png](agenda-escuro-1440.png) |
| Agenda | escuro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [agenda-escuro-390.png](agenda-escuro-390.png) |
| Tarefas | claro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [tasks-claro-1440.png](tasks-claro-1440.png) |
| Tarefas | claro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [tasks-claro-390.png](tasks-claro-390.png) |
| Tarefas | escuro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [tasks-escuro-1440.png](tasks-escuro-1440.png) |
| Tarefas | escuro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [tasks-escuro-390.png](tasks-escuro-390.png) |
| Agentes | claro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [agents-claro-1440.png](agents-claro-1440.png) |
| Agentes | claro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [agents-claro-390.png](agents-claro-390.png) |
| Agentes | escuro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [agents-escuro-1440.png](agents-escuro-1440.png) |
| Agentes | escuro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [agents-escuro-390.png](agents-escuro-390.png) |
| Uso de IA | claro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [usage-claro-1440.png](usage-claro-1440.png) |
| Uso de IA | claro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [usage-claro-390.png](usage-claro-390.png) |
| Uso de IA | escuro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [usage-escuro-1440.png](usage-escuro-1440.png) |
| Uso de IA | escuro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [usage-escuro-390.png](usage-escuro-390.png) |
| Análise | claro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [analise-claro-1440.png](analise-claro-1440.png) |
| Análise | claro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [analise-claro-390.png](analise-claro-390.png) |
| Análise | escuro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [analise-escuro-1440.png](analise-escuro-1440.png) |
| Análise | escuro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [analise-escuro-390.png](analise-escuro-390.png) |
| Configurações | claro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [settings-claro-1440.png](settings-claro-1440.png) |
| Configurações | claro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [settings-claro-390.png](settings-claro-390.png) |
| Configurações | escuro | 1440 | PASSOU (64) | PASSOU (56) | PASSOU (0) | n/a | [settings-escuro-1440.png](settings-escuro-1440.png) |
| Configurações | escuro | 390 | gaveta (oculta) | PASSOU (56) | PASSOU (0) | PASSOU (44) | [settings-escuro-390.png](settings-escuro-390.png) |

Telas com forma própria: a Agenda mostrou a tela e o alternador Dia/Semana/Mês nos dois temas e tamanhos (PASSOU). Funis abriu sem erro, mas sem colunas (a hml não tem funil).

## Menu expandido

| Medida | Resultado | Captura |
|---|---|---|
| Expandir mostra 240 px | PASSOU (240) | [menu-expandido-claro-1440.png](menu-expandido-claro-1440.png) |
| Continua expandido ao recarregar | PASSOU | mesma captura |
| Recolher volta a 64 px e persiste ao recarregar | PASSOU | sem captura |

## Contraste do texto (mínimo 4,5)

Medido em 6 telas (Inbox, Contatos, Tarefas, Agentes, Uso de IA, Configurações), a 1360 px, nos dois temas.

| Tema | Resultado |
|---|---|
| Claro | PASSOU nas 6 telas |
| Escuro | PASSOU nas 6 telas (o sino que falhava com 3,48 agora fica perto de 5,3; veja [inbox-escuro-1440.png](inbox-escuro-1440.png) e [inbox-escuro-390.png](inbox-escuro-390.png)) |

## Celular a 390 px (spec celular-390, rodada na hml)

| Caso | Resultado |
|---|---|
| Inbox sem rolagem lateral, botões da barra de baixo com 44 px ou mais | PASSOU |
| Funis idem | PASSOU |
| Contatos idem | PASSOU |
| A barra de baixo não cobre o campo de texto com o teclado aberto | PASSOU |

## Antes (casca antiga, da mudança 006)

Capturas já versionadas, feitas em 29/10 na hml antes desta leva:

- Tema claro, Uso de IA: [13-tema-light-uso.png](evidence/006-agente/hml-2026-10-29/13-tema-light-uso.png). Compare com [usage-claro-1440.png](usage-claro-1440.png).
- Tema escuro, Uso de IA: [17-tema-dark-uso.png](evidence/006-agente/hml-2026-10-29/17-tema-dark-uso.png). Compare com [usage-escuro-1440.png](usage-escuro-1440.png).
- Tema claro, Agente: [15-tema-light-agente.png](evidence/006-agente/hml-2026-10-29/15-tema-light-agente.png). Compare com [agents-claro-1440.png](agents-claro-1440.png) (a antiga é a tela de edição de um agente; só vale a cor geral).
- Tema escuro, Agente: [19-tema-dark-agente.png](evidence/006-agente/hml-2026-10-29/19-tema-dark-agente.png). Compare com [agents-escuro-1440.png](agents-escuro-1440.png) (mesma ressalva).

## O que NÃO foi possível comparar

- **O WhatsApp Web não é capturado por nós.** A referência é a que o dono tem; "ficou com a cara do WhatsApp?" é julgamento do dono, olhando estas capturas.
- As capturas "antes" são de página inteira em tela estreita e **não mostram menu lateral nem barra de cima**; antes e depois só se comparam em cor, fundo e cartões.
- Não há "antes" de Inbox, Contatos, Funis, Agenda, Tarefas, Análise e Configurações.
- **Kanban com colunas e cartões:** a hml não tem funil (as capturas [kanban-claro-1440.png](kanban-claro-1440.png), [kanban-escuro-1440.png](kanban-escuro-1440.png), [kanban-claro-390.png](kanban-claro-390.png) e [kanban-escuro-390.png](kanban-escuro-390.png) mostram só a lista de funis).
- Nenhum nome de cliente aparece: a hml não tem contatos nem conversas. Nomes de funis e o endereço de retorno do Google estão borrados por precaução. O agente visível é de teste ("[teste-006] Agente"). Todas as capturas foram olhadas uma a uma: sem e-mail, chave ou nome de cliente.
