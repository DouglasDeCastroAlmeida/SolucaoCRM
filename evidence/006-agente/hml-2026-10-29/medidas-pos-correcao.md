# Prova da 006 na homologacao (T-040 / AC-009.3)

Alvo: https://hml.corretora.io. Gerado pelo spec tests/journeys/agente-006-na-homologacao.spec.ts.

| Passo | Resultado | Observacao |
|---|---|---|
| 1 login | PASSOU | entrou em /app sem pedir segundo fator |
| C1 atualizar ferramentas x3 | PASSOU | 3 atualizacoes seguidas: sem quadro 'O servidor mudou' e a ferramenta continuou ligada (aria-checked=true) |
| C2 frase do teto | PASSOU | aviso diz que o limite e so acompanhamento e a IA nao para sozinha; traducao nova em espanhol presente; idioma devolvido ao portugues |
| C3 contraste escuro | PASSOU | todos os textos medidos (inclusive abas inativas e x dos chips) >= 4,5 no tema escuro |

## Medidas por ferramenta

- login: URL final /app/inbox; organizacoes visiveis ao servico: 1
- antes de atualizar: interruptores ligados=1
- atualizacao 1: quadro "O servidor mudou" presente=false; quadro texto="A lista de ferramentas do servidor continua a mesma."; interruptores ligados=1; primeiro interruptor aria-checked=true
- atualizacao 2: quadro "O servidor mudou" presente=false; quadro texto="A lista de ferramentas do servidor continua a mesma."; interruptores ligados=1; primeiro interruptor aria-checked=true
- atualizacao 3: quadro "O servidor mudou" presente=false; quadro texto="A lista de ferramentas do servidor continua a mesma."; interruptores ligados=1; primeiro interruptor aria-checked=true
- uso pt: cartao="US$ 0,00 gastos de US$ 50,00"; aviso="O limite do mês é só um acompanhamento: a IA não para sozinha ao chegar nele. Escolha parar ao chegar no limite no cartão de orçamento, acima."; contem "sem teto"=false
- uso es: aviso="El límite del mes es solo de seguimiento: la IA no se detiene sola al llegar a él. Elige detenerla al llegar al límite en la tarjeta de presupuesto, arriba."
- escuro agente: textos=164; menor razao geral=4.91; abas=9 (menor 5.18); "x"=3 (menor 5.18); abaixo do minimo=0
- escuro central: textos=24; menor razao geral=5.18; abas=2 (menor 5.18); "x"=0 (menor null); abaixo do minimo=0
- escuro uso: textos=55; menor razao geral=5.83; abas=0 (menor null); "x"=0 (menor null); abaixo do minimo=0
- escuro mcp: textos=14; menor razao geral=5.83; abas=0 (menor null); "x"=0 (menor null); abaixo do minimo=0

## Criado na homologacao (nao apagado)

