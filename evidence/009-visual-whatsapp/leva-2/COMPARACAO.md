# Leva 2 (listas como conversa) na homologação: prova final

Rodada em 30/10/2026 na homologação (imagem ea1c2258f), nunca na produção. Os dados são todos fictícios, com o prefixo "[teste-009]", criados pela API do app com a sessão do navegador e removidos no fim. Os números completos estão em [medidas.md](medidas.md). O spec é `tests/journeys/visual-whatsapp-leva-2.spec.ts`.

Resultado: os 4 testes do spec passaram (computador, celular, 7 passos de comportamento e contagem final de falhas igual a zero).

## Para o dono olhar primeiro

1. [Contatos no celular (claro)](contacts-claro-390.png)
2. [Tarefas no celular (escuro, com o selo Urgente)](tasks-escuro-390.png)
3. [Fluxos de follow-up no celular (claro)](followups-fluxos-claro-390.png)
4. [Central de avisos no celular (claro)](central-claro-390.png)
5. [Contatos no computador (claro)](contacts-claro-1440.png)
6. [Central de avisos no computador (escuro)](central-escuro-1440.png)

O que procurar: no celular cada linha ficou alta, com os botões empilhados e do tamanho de um dedo, e o nome do contato aparece inteiro. A faixa rosa no topo é um aviso real da homologação (WhatsApp desconectado); no celular ela cobre um pedaço da primeira linha porque a página foi rolada até a lista.

## Antes e depois

| Medida | Antes | Agora (hml) | Situação |
|---|---|---|---|
| Contatos no celular: caixa de seleção | 42 px | 44 px | passou |
| Contatos no celular: nome do contato | ausente | visível inteiro (ver [Contatos](contacts-claro-390.png)) | passou |
| Tarefas no celular: menor alvo | 28 px | 44 px | passou |
| Fluxos no celular: menor alvo | 24 px | 44 px | passou |
| Central no celular: menor alvo | 35,8 px | 44 px | passou |
| Central no celular: rolagem lateral | 918 px | 0 px | passou |
| Tarefas, "Atrasadas": contraste | 4,37 | nenhum texto abaixo de 4,5 (ver [Tarefas](tasks-claro-390.png)) | passou |
| Selo "Urgente": contraste | 4,26 | 5,63 (claro) e 5,26 (escuro) | passou |

Em todas as 32 combinações de tela, tema e tamanho: rolagem lateral 0, nenhum elemento de `<main>` além da janela e nenhum texto abaixo de 4,5:1.

## Tabela por tela, tema e tamanho

| Tela | Celular claro | Celular escuro | Computador claro | Computador escuro | Medidas |
|---|---|---|---|---|---|
| Contatos | [390 claro](contacts-claro-390.png) | [390 escuro](contacts-escuro-390.png) | [1440 claro](contacts-claro-1440.png) | [1440 escuro](contacts-escuro-1440.png) | 8 linhas; celular: linha mais baixa 161 px, menor alvo 44 px; computador: menor alvo 36 px |
| Tarefas | [390 claro](tasks-claro-390.png) | [390 escuro](tasks-escuro-390.png) | [1440 claro](tasks-claro-1440.png) | [1440 escuro](tasks-escuro-1440.png) | 5 linhas; celular: menor alvo 44 px, ações visíveis 10/10; selo urgente 5.63 (claro) e 5.26 (escuro) |
| Casos | [390 claro](cases-claro-390.png) | [390 escuro](cases-escuro-390.png) | [1440 claro](cases-claro-1440.png) | [1440 escuro](cases-escuro-1440.png) | vazio na hml (sem casos): lista e painel não aparecem lado a lado |
| Follow-ups, aba Fluxos | [390 claro](followups-fluxos-claro-390.png) | [390 escuro](followups-fluxos-escuro-390.png) | [1440 claro](followups-fluxos-claro-1440.png) | [1440 escuro](followups-fluxos-escuro-1440.png) | 1 linha; celular: menor alvo 44 px (Renomear), ações empilhadas |
| Follow-ups, aba Fila | [390 claro](followups-fila-claro-390.png) | [390 escuro](followups-fila-escuro-390.png) | [1440 claro](followups-fila-claro-1440.png) | [1440 escuro](followups-fila-escuro-1440.png) | vazio na hml (fila sem itens) |
| Central de avisos | [390 claro](central-claro-390.png) | [390 escuro](central-escuro-390.png) | [1440 claro](central-claro-1440.png) | [1440 escuro](central-escuro-1440.png) | 3 avisos reais; celular: menor alvo 44 px, linha mais baixa 265 px |
| Funis | [390 claro](kanban-claro-390.png) | [390 escuro](kanban-escuro-390.png) | [1440 claro](kanban-claro-1440.png) | [1440 escuro](kanban-escuro-1440.png) | sem lista de linhas; sem rolagem lateral e sem contraste ruim |
| Agenda | [390 claro](agenda-claro-390.png) | [390 escuro](agenda-escuro-390.png) | [1440 claro](agenda-claro-1440.png) | [1440 escuro](agenda-escuro-1440.png) | sem lista de linhas; sem rolagem lateral e sem contraste ruim |

Captura extra do comportamento: [Contatos com uma linha selecionada e a barra de lote](contacts-lote-claro-1440.png).

## Comportamento (7 passos, todos passaram)

- Busca filtra a lista (8 linhas para 1 com "Carla Inventada")
- Ordenar por Nome muda a ordem e o segundo clique inverte
- Caixa da linha seleciona e aparece a barra de lote (ver [captura](contacts-lote-claro-1440.png))
- Cancelar o lote limpa a seleção e a barra some
- Abrir uma linha leva ao detalhe do contato
- Marcar tarefa como concluída grava a situação `done`
- Desmarcar a tarefa a reabre (`pending`)

## Achados

- Casos e Follow-ups, aba Fila, estão vazios na hml (sem rota de criação sem efeito externo): a regra "lista e painel não ficam lado a lado no celular" só foi medida no estado vazio.
- Nenhum contato bloqueado pôde ser criado (sem porta de API sem efeito externo).
- O último passo do roteiro, que falhou na corrida anterior, passou: a leitura da situação da tarefa agora espera o estado, não o tempo. Nenhum defeito de produto foi observado.
- As iniciais dos avatares aparecem como "[E", "[T" porque o nome dos dados fictícios começa com colchete; é efeito do dado de teste.

## Dados fictícios

Criados: 8 contatos, 6 tarefas e 1 fluxo. Removidos no fim do spec (try/finally). Conferência final está no fim de [medidas.md](medidas.md). Nenhum e-mail, senha ou chave aparece nas capturas.
