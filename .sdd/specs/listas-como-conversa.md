# listas-como-conversa

## Requisitos

### Requisito: Linha de lista no padrão de conversa

Contatos, Tarefas, Casos, Follow-ups e os cartões da Central DEVEM desenhar cada item pelo componente `LinhaDeLista`: avatar ou ícone, título, prévia e horário ou situação à direita, com foco de teclado visível.

- Cenário: Dado uma lista dessas telas com itens, quando exibida, então cada item é uma linha com avatar, título, prévia e informação à direita.

### Requisito: Comportamento das listas inalterado

Busca, filtro, ordenação, paginação, seleção em lote e ações por item (por exemplo Aprovar e Recusar na Central) DEVEM dar o mesmo resultado de antes da mudança, e os estados vazio, de erro e de carga DEVEM existir no estilo novo. A mudança NÃO DEVE acrescentar, remover ou alterar rota, permissão ou dado.

- Cenário: Dado uma lista vazia, com erro ou carregando, quando exibida, então o estado correspondente aparece.
- Cenário: Dado um cartão da Central, quando o usuário aprova ou recusa, então a ação ocorre como antes.

### Requisito: Funil e agenda mantêm a forma

O funil em quadro e a agenda em calendário DEVEM manter a forma e herdar apenas cores, cantos, tipografia e cabeçalho da casca.

- Cenário: Dado a agenda, quando exibida, então segue em calendário com a casca nova.
