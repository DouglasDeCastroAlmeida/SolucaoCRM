# Delta: ci-cd

## MODIFICADOS

### Requisito: CI enxuto dentro da cota gratuita

O sistema DEVE rodar em PR apenas verify e invariants com uma só versão do Postgres, publicar imagens somente para linux/amd64 (A-05), manter desligados acolhida, relogio, mysql-integracao e os jobs de release herdados do upstream (que dependem de um GitHub App que não é nosso) e rodar o e2e completo apenas por disparo manual (A-07). O corte de versão e a publicação da versão DEVEM ser feitos só pelos workflows manuais próprios `corte-de-versao.yml` e `publicar-versao.yml`, que usam apenas o token padrão (ver `release-proprio`). O consumo de minutos DEVE ser registrado e comparado à cota.

- Cenário: Dado um PR, quando o CI roda, então não executa e2e completo nem matriz cheia.
- Cenário: Dado um merge na main, quando o CI roda, então o e2e completo não roda sozinho.
- Cenário: Dado um merge na main, quando o CI roda, então nenhum corte de versão nem tag nasce sozinho; só o disparo manual dos workflows próprios os produz.
