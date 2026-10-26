# Evidências da mudança 002 (marcas, parceiros e domínios)

Esta pasta recebe a prova de que as marcas funcionam **na VPS de verdade**. Nada aqui é
preenchido de antemão: cada arquivo só existe depois que a medição foi feita, com data.
Sem segredos, tokens, senhas nem e-mails de clientes.

As sondas que gravam aqui ficam em `tests/infra/vps/sondas.sh` (`marcas-login`,
`marcas-removido`, `marcas-rollback`) e pulam sozinhas quando as variáveis de teste não existem.

| Evidência | O que precisa conter | Quem gera |
| --- | --- | --- |
| `marcas-login.txt` | Três endereços de teste, cada um com a marca (nome) que o login mostrou, e a confirmação de que nenhum mostrou o nome de outra marca. | sonda `marcas-login` |
| `marcas-removido.txt` | O domínio removido: HTTPS recusado (sem certificado) e login da instalação com a marca padrão. | sonda `marcas-removido` |
| `marcas-rollback.txt` | Os segundos entre ligar `MARCAS_POR_DOMINIO=off` e recriar o app até o login voltar à marca padrão (limite: 120 s), e a pasta onde foi feito. | sonda `marcas-rollback` |
| `homologacao.md` | Data, endereço da homologação, o que foi aplicado (migrations/baseline) e o resultado de cada passo do runbook `docs/solucao-crm/runbooks/marcas.md`. | quem executa (dono + sessão) |
| `emails.md` | Para cada um dos três endereços: o e-mail recebido de verdade (caixa real), com o nome, o remetente e o link no mesmo endereço. Print ou texto do cabeçalho, sem token. | dono, à mão |
| `spf-dkim.md` | Resultado do teste de SPF e DKIM do domínio de envio (Resend), com a data. | dono, à mão |

Regra: se uma evidência não foi coletada, a linha fica **pendente** aqui no README do
checklist da tarefa, e não se escreve resultado por dedução.
