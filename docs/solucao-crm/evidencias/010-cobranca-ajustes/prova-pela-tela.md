# 010 — prova pela tela do botão "Pagar agora" (T-005)

Mudança `010-ajustes-de-texto-e-botao-da-cobranca-no-trial-com-cartao`. Ambiente: homologação (`marca-a`), commit `08f85e427`
(contém a 010), empresa de teste `[teste-003] Empresa Exemplo`, navegador Playwright entrando como o dono da empresa.
Sonda: `scripts/sondas/prova-010-pagar-agora-hml.mjs` (derivada da jornada 003; o tempo é simulado nas datas da linha de
cobrança da empresa de teste e a régua roda pelo caminho do produto). Ao fim, a linha e os avisos foram devolvidos ao original
(passo `restaurar`: passou).

| Critério | Estado na tela | Resultado | Evidência |
|---|---|---|---|
| AC-002.1 | Teste grátis com cartão, 1ª cobrança agendada e em dia: o painel do plano **não** tem "Pagar agora" | PASSOU | [plano em teste](evidence/010-cobranca-ajustes/02-trial-aviso-plano.png), [faixa em /app](evidence/010-cobranca-ajustes/02-trial-aviso-app.png), [resultado](evidence/010-cobranca-ajustes/02-trial-aviso.json) |
| AC-002.2 | Pagamento vencido (em atraso): o painel do plano **mostra** "Pagar agora" | PASSOU | [plano em atraso](evidence/010-cobranca-ajustes/05-atraso-plano.png), [Central](evidence/010-cobranca-ajustes/05-atraso-central.png), [resultado](evidence/010-cobranca-ajustes/05-atraso.json) |
| Partida | Estado antes da prova | PASSOU | [plano](evidence/010-cobranca-ajustes/01-base-plano.png), [app](evidence/010-cobranca-ajustes/01-base-app.png) |

Medidas por ferramenta em todas as telas: largura do conteúdo igual à da janela (1100 px) e nenhum botão fora da janela.

## O que NÃO foi medido
- O texto do aviso de atraso (AC-001.1/001.2) está provado por teste unitário; o e-mail não saiu porque a hml não tem Resend configurado.
- O hub de conta suspensa com "Pagar agora" já foi fotografado na jornada 003, antes da 010; não foi refeito aqui.
- Duas tentativas deram tempo esgotado de rede ao abrir `/app` na hml e foram repetidas; o resultado acima é o da repetição.

## Todas as capturas
[partida: app](evidence/010-cobranca-ajustes/01-base-app.png) · [partida: plano](evidence/010-cobranca-ajustes/01-base-plano.png) ·
[teste: app](evidence/010-cobranca-ajustes/02-trial-aviso-app.png) · [teste: Central](evidence/010-cobranca-ajustes/02-trial-aviso-central.png) · [teste: plano](evidence/010-cobranca-ajustes/02-trial-aviso-plano.png) ·
[atraso: app](evidence/010-cobranca-ajustes/05-atraso-app.png) · [atraso: Central](evidence/010-cobranca-ajustes/05-atraso-central.png) · [atraso: plano](evidence/010-cobranca-ajustes/05-atraso-plano.png) ·
[restauração](evidence/010-cobranca-ajustes/09-restaurar.json)
