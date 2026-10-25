# Guia de testes da esteira

Lido pelos subagentes `sdd-implementer`, `sdd-reviewer` e `sdd-auditor`. Vale para qualquer stack; os perfis acrescentam as ferramentas.

## 1. Pirâmide

| Camada | Tag | Usar para | Proporção |
| :-- | :-- | :-- | :-- |
| Contrato | `TEST-CONTRACT` | Schemas e formatos de entrada/saída nas bordas | Toda borda nova |
| Unitário | `TEST-UNIT` | Regras de negócio puras | A maioria |
| Integração | `TEST-INT` | Rota/serviço + banco real, filas, arquivos | Um por fluxo e caminho de erro relevante |
| UI | `TEST-UI` | Comportamento de componente | Componentes com lógica |
| E2E | `TEST-E2E` | Jornada crítica completa | Poucos: só os critérios que exigem o sistema inteiro |
| Smoke | `CHECK-SMOKE` | Sistema sobe e responde | Um por mudança de infra/deploy |

Escolha a camada **mais baixa** que prova o critério de aceite. E2E é caro de escrever, de rodar e de ler a saída.

## 2. Ciclo TDD

1. **Red:** escreva o teste com o ID do critério (`AC-001.1: ...`). Rode só ele. Confirme que falha **pela asserção**, não por import, sintaxe ou setup.
2. **Green:** o mínimo de código para passar. Rode só ele.
3. **Refactor:** com tudo verde, limpe. Rode os testes do arquivo/módulo.
4. A suíte completa, lint e typecheck rodam **no fechamento da fatia**, não a cada passo.

Correção de bug: o primeiro passo é sempre um teste que reproduz o bug e falha. Ele fica como teste de regressão.

## 3. Qualidade do teste

- **Comportamento, não implementação:** verifique o resultado observável (retorno, resposta HTTP, estado persistido, texto na tela), não chamadas internas.
- **Um motivo para falhar:** um comportamento por teste; nome no formato `AC-001.1: quando X, então Y`.
- **Arrange, Act, Assert** visíveis; nada de lógica (if/loop) dentro do teste.
- **Mock só na fronteira:** serviços de terceiros, relógio, aleatoriedade, e-mail. Nunca mocke o próprio código que está sendo testado nem o banco num teste de integração.
- **Determinístico:** relógio e aleatoriedade controlados; sem dependência de ordem entre testes; sem rede real para terceiros.
- **Sem espera fixa:** nada de `sleep`/`waitForTimeout`. Espere por condição (elemento visível, resposta recebida, evento emitido).
- **Dados próprios:** cada teste cria o que usa (factories/builders) e não depende de dado deixado por outro.
- **Asserção específica:** compare valores esperados; evite só "não lançou erro" ou snapshots gigantes.
- **Caminhos de erro:** entrada inválida, permissão negada, dependência fora do ar e limites decididos no Grill têm teste.

## 4. Testes instáveis (flaky)

Um teste que falha às vezes é um defeito. Não aumente timeout nem adicione retry para escondê-lo: encontre a causa (espera fixa, ordem, relógio, dado compartilhado) e corrija. Se não der agora, marque como pulado com o motivo e abra uma mudança S para corrigir.

## 5. Cobertura

- Se `commands.coverage` e `quality.coverageMin` estiverem configurados, o auditor roda a cobertura e compara com o mínimo.
- Cobertura é sinal, não meta: 100% de linhas com asserções fracas não prova nada. O que vale é cada critério de aceite ter teste que falharia sem a implementação.

## 6. Economia de tokens

A saída de testes é uma das maiores fontes de consumo de contexto. Regras:

- Rode tudo por `node .sdd/bin/sdd.mjs run <comando>`: ele mostra só o resumo (final da saída e linhas de erro) e guarda a saída completa em `.sdd/runs/<comando>.log`. Use `--full` ou leia o log com `grep`/`tail` apenas quando o resumo não bastar.
- Durante o TDD use `run testFocused <arquivos>`; a suíte completa só no fechamento da fatia e na verificação.
- Configure reporters curtos nos comandos (`--reporter=dot`, `--reporter=line`, `-q`) e pare na primeira falha quando fizer sentido (`--bail`, `-x`).
- Não cole saídas longas em artefatos: resuma (comando → totais) e aponte o log.
- Navegador via MCP (capturas de tela) só para depurar uma falha específica, nunca como verificação de rotina.
