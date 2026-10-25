# ci-cd

## Requisitos

### Requisito: CI enxuto dentro da cota gratuita

O sistema DEVE rodar em PR apenas verify e invariants com uma só versão do Postgres, publicar imagens somente para linux/amd64 (A-05), manter desligados acolhida, relogio, mysql-integracao e release do upstream e rodar o e2e completo apenas por disparo manual (A-07). O consumo de minutos DEVE ser registrado e comparado à cota.

- Cenário: Dado um PR, quando o CI roda, então não executa e2e completo nem matriz cheia.
- Cenário: Dado um merge na main, quando o CI roda, então o e2e completo não roda sozinho.

### Requisito: Deploy automático em homologação com teste de fumaça

O sistema DEVE, após o merge e a publicação das imagens, implantar a homologação sozinho usando a imagem com tag igual ao SHA (nunca latest) e confirmar raiz = 200 e /app = 307.

- Cenário: Dado um merge na main, quando as imagens estão publicadas, então a homologação é atualizada e a fumaça passa.

### Requisito: Deploy em produção por disparo manual

O sistema DEVE implantar produção somente por workflow_dispatch a partir da main, no ambiente producao (A-06: o disparo manual do dono é a aprovação), com um deploy por ambiente por vez e sem expor segredos a PR de fork.

- Cenário: Dois deploys quase simultâneos, quando executam, então o segundo espera o primeiro.
- Cenário: Dado um PR de fork, quando o CI roda, então nenhum segredo de deploy fica acessível.

### Requisito: Backup antes do deploy e rollback automático

O sistema DEVE tirar um backup antes de cada deploy em produção, registrar o resultado e, se a raiz não responder 200 ou /app não responder 307 depois do deploy, voltar sozinho à imagem, ao .env e ao código anteriores em menos de 2 minutos.

- Cenário: Dada uma falha provocada em homologação, quando o rollback acontece, então a versão anterior volta a responder em menos de 2 minutos (medido: 5 s).
- Cenário: Dado um PR com migration, quando revisado, então o checklist exige que a migration seja compatível com a versão anterior do app.

### Requisito: Varredura de segredos e logs limpos

O sistema DEVE reprovar PR que contenha chave, token ou senha no diff e DEVE mascarar segredos em logs de deploy, backup e alertas.

- Cenário: Dado um PR com segredo no diff, quando o CI roda, então a varredura reprova.
- Cenário: Dado o log de um deploy ou backup, quando inspecionado, então não contém valores de segredos.
