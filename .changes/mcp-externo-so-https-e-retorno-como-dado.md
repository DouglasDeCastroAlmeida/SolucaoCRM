---
impacto: exige_acao
secao: alterado
titulo: O servidor MCP externo exige https, e o que ele devolve entra como dado externo
---

A conexão com o servidor MCP externo agora passa pela mesma proteção que as demais saídas do produto: só aceita endereço `https`, não segue redirecionamento, espera no máximo 10 segundos e lê no máximo 1 MB da resposta. O que o servidor devolve (inclusive mensagens de erro) chega ao modelo marcado como dado externo e com tamanho limitado, e não altera as ferramentas nem as permissões do agente. A descrição de cada ferramenta é limitada e prefixada, e uma ferramenta que o administrador já viu não vira "só leitura" sozinha se o servidor mudar de ideia depois. A auditoria guarda só o nome dos campos e os tamanhos, nunca os valores.

Também mudam dois comportamentos do agente: quando o saldo de IA zera, a conversa passa a ir para uma pessoa na hora (antes esperava a recarga por até 6 horas), e um modelo sem preço conhecido passa a contar no teto de custo por uma estimativa conservadora, marcada como "estimada". Por isso um agente que usa um modelo sem preço pode chegar ao aviso e ao teto antes do que chegava.

## Requer atenção

Se você usa um servidor MCP externo com endereço `http://`, ou cujo endereço redireciona para outro, ele deixa de funcionar depois de atualizar: troque o endereço em Configurações › Servidor MCP externo por um endereço `https` direto. Se o seu servidor demora mais de 10 segundos para responder, a ferramenta passa a falhar com erro claro. Confira também o teto de custo de IA de cada empresa na tela de uso, porque o custo de modelos sem preço agora é contado.
