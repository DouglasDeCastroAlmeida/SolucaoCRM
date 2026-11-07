# Evidência T-040 (AC-010.3): jornada da cobrança pela tela, na homologação

Data: 03/11/2026. Ambiente: `https://marca-a.corretora.io` (hml), banco Supabase da hml, Asaas **sandbox**.
Sonda: `scripts/sondas/jornada-cobranca-hml.mjs` (+ helper `jornada-cobranca-hml.regua.mts`). Fotos e JSON de cada passo:
`evidence/003-billing/jornada-hml/` (e-mails e campos mascarados; medidas por `getBoundingClientRect`/`scrollWidth`).

**Veredito: PARCIAL.** A jornada do trial em diante foi provada pela tela; o cadastro de conta nova e o pagamento novo no
Checkout NÃO foram refeitos (motivos abaixo). Nenhum bug de produto encontrado.

## Como o tempo foi simulado (honestidade sobre o que isto prova)

Conta usada: a de teste que já existia (`[teste-003]`), cujo checkout o dono pagou no sandbox em 2/11 (A1 a A4 e B1 a B4 de
`conferir-pagamento-hml.mjs` seguem PASSOU depois da jornada). As datas da linha de `cobranca_assinaturas` foram deslocadas
pela sonda e devolvidas ao original no fim. A régua rodou: no passo 2, pelo **cron real da hml** (rodada do minuto 43); nos demais,
pela função que o cron chama (`aplicarRegua`), executada a partir da máquina de desenvolvimento contra o banco da hml, porque o
segredo do cron não está ao alcance e esperar uma rodada por passo levaria 5 h. O Asaas **não** foi alterado: ele nunca cobrou nem
marcou atraso de verdade (o sandbox só cobra o cartão no vencimento, 09/11). Os e-mails não saíram (a hml e a máquina local não têm
`RESEND_API_KEY`; os avisos foram gravados e aparecem na Central).

## Resultado por passo

| # | Passo | Resultado | Evidência |
|---|---|---|---|
| 0 | Cadastro de conta nova na marca de teste | **NÃO MEDIDO** | A instalação está em `signup_mode = so_convite`; abri-la é decisão do dono e a sonda não mexe nisso. A marca tem `cadastro_aberto = true`, mas a política da instalação fecha tudo. |
| 1 | Checkout do Asaas sandbox, primeira cobrança em hoje+7, aviso "Você só será cobrado em DD/MM" | **PASSOU antes (2/11), não refeito** | `evidence/003-billing/pagamento-hml/` e a seção "Prova do externalReference" do README. |
| 2 | Estado de partida: trial com cartão, empresa ativa, faixa "Seu teste grátis termina em 7 dias" | PASSOU | [base-app](evidence/003-billing/jornada-hml/01-base-app.png), [base-plano](evidence/003-billing/jornada-hml/01-base-plano.png) |
| 3 | Aviso "Seu cartão será cobrado em 2 dias, em 05/11" (cron real) | PASSOU | [trial-aviso-app](evidence/003-billing/jornada-hml/02-trial-aviso-app.png), [trial-aviso-central](evidence/003-billing/jornada-hml/02-trial-aviso-central.png), [trial-aviso-plano](evidence/003-billing/jornada-hml/02-trial-aviso-plano.png), Central e faixa na tela |
| 4 | Aviso "Seu cartão será cobrado amanhã, 04/11" | PASSOU | [trial-amanha-app](evidence/003-billing/jornada-hml/03-trial-amanha-app.png), [trial-amanha-central](evidence/003-billing/jornada-hml/03-trial-amanha-central.png), [trial-amanha-plano](evidence/003-billing/jornada-hml/03-trial-amanha-plano.png) |
| 5 | Primeira cobrança paga: sem faixa, plano "Em dia", sem aviso | PASSOU (simulado no banco) | [cobrou-app](evidence/003-billing/jornada-hml/04-cobrou-app.png), [cobrou-plano](evidence/003-billing/jornada-hml/04-cobrou-plano.png). A cobrança real no Asaas: **NÃO MEDIDO** |
| 6 | Atraso: aviso "Não conseguimos cobrar o seu cartão…", empresa segue ativa (tolerância de 3 dias) | PASSOU (simulado) | [atraso-app](evidence/003-billing/jornada-hml/05-atraso-app.png), [atraso-central](evidence/003-billing/jornada-hml/05-atraso-central.png), [atraso-plano](evidence/003-billing/jornada-hml/05-atraso-plano.png) |
| 7 | Aviso final "suspende em breve", empresa segue ativa | PASSOU (simulado) | [aviso-final-app](evidence/003-billing/jornada-hml/06-aviso-final-app.png), [aviso-final-central](evidence/003-billing/jornada-hml/06-aviso-final-central.png) |
| 8 | Suspensão: /app cai em `/account-suspended`, "Conta suspensa", "Em atraso desde 30/10/2026", botão Pagar agora | PASSOU (simulado) | [suspende-hub](evidence/003-billing/jornada-hml/07-suspende-hub.png) |
| 9 | Reativação: régua reativa, /app abre, painel volta | PASSOU (simulado) | [reativa-app](evidence/003-billing/jornada-hml/08-reativa-app.png), [reativa-central](evidence/003-billing/jornada-hml/08-reativa-central.png), [reativa-plano](evidence/003-billing/jornada-hml/08-reativa-plano.png) |
| 10 | Restauração da linha original e limpeza | PASSOU | `09-restaurar.json` |

Medidas: em todas as telas, largura do conteúdo = largura da janela (1100 px) e nenhum botão ou faixa fora da janela;
a faixa do teste ocupa 1100 de 1100 px.

## Achados (nenhum corrigido, conforme a tarefa)

1. **Instalação em `so_convite` impede provar o cadastro de conta nova** (não é bug): para fechar o passo 0 o dono precisa abrir o
   cadastro da hml por um tempo (`/admin/cadastro`) ou autorizar a sonda a fazê-lo.
2. **Sem `/app` até terminar o onboarding**: a empresa de teste ainda não tinha concluído o onboarding, então `/app` caía em
   `/onboarding/welcome` e a faixa nunca aparecia; a sonda ligou `onboarded_at` na empresa de teste e o desfez ao fim. Para quem
   acabou de pagar o Checkout, a primeira tela é o onboarding; a faixa de teste só aparece depois dele (provavelmente intencional).
3. **Texto do e-mail de atraso x tela**: o aviso diz "Troque o cartão em Plano e cobrança", mas o hub da suspensão (e o painel) de
   uma conta `trial_com_cartao` oferece só "Pagar agora" e "Já paguei" (link da fatura), sem ação de trocar o cartão. Causa provável:
   `PainelDaAssinatura`/`AcoesDaAssinatura` não tem caminho de troca de cartão para o trial com cartão. Vale decisão do dono.
4. O painel do plano durante o trial com cartão mostra "Pagar agora" ao lado de "Teste grátis até 09/11/2026 · 1ª cobrança
   agendada": o botão convida a pagar antes da data (pode ser desejado, mas contradiz "você só será cobrado em DD/MM").

## Tratamento dos achados 3 e 4

Os achados 3 (texto "Troque o cartão" sem tela de troca) e 4 ("Pagar agora" durante o trial com cartão) foram tratados pela mudança
010 (`.sdd/changes/010-ajustes-de-texto-e-botao-da-cobranca-no-trial-com-cartao/`): o aviso agora manda pagar pelo link da fatura e o
painel esconde o botão enquanto a 1ª cobrança está agendada e em dia. A troca de cartão de verdade segue como mudança separada, a
abrir antes de ligar a cobrança real. A prova pela tela da 010 ainda será feita.

## Resíduos

- Banco da hml: linha de cobrança e `onboarded_at` da empresa de teste restaurados; os 6 avisos da Central criados pela jornada
  foram apagados. Ficam as linhas de `api_audit_log` (somente-anexar: suspensão, reativação e rodada do cron).
- Sandbox Asaas: 3 assinaturas ACTIVE; uma é a da empresa de teste (checkout `ab1cba87…`), **duas são duplicatas de testes
  anteriores** (checkouts `9093cd13…` e `d268aefc…`, criadas em 2/11 e 31/10). Não foram apagadas.
- Arquivos fora do repositório (em `~/.secrets/`): `jornada-003-original.json`, `jornada-003-onboarded.json`, `jornada-003-base-ids.json`.

## Rodada final (06/11/2026): conta nova pela tela e pagamento novo no Checkout (fecha a T-040)

O que faltava no veredito PARCIAL de 03/11. Ambiente: hml, marca de teste `marca-a`, código da main `b13b36bff`.

1. A hml estava em "cadastro apenas por convite" (`/admin/cadastro`); abri o cadastro só durante o teste e o fechei de novo (verificado: a tela voltou a recusar).
2. Cadastro pela tela da marca, com plano de teste de 7 dias. O e-mail `@example.com` fez o gancho de envio falhar (`envio_falhou:send_failed`) e o Supabase cancelou a criação; com o endereço de teste do Resend (`delivered@resend.dev`) o cadastro passou. A confirmação foi pelo mesmo caminho do link do e-mail (`/login/continuar` com o `token_hash`).
3. A organização nasceu `suspended`, `trial_com_cartao` e `pagamento_inicial_pendente`. `/app` caiu em `/account-suspended`; `/cobranca/iniciar` mostrou "Você só será cobrado em 13/11", pediu o CPF e redirecionou ao Checkout do Asaas sandbox.
4. O dono pagou no Checkout com o cartão de teste do Asaas, pelo celular (o reCAPTCHA não admite automação).
5. O retorno do Checkout não voltou para uma sessão logada, então a conta seguiu suspensa. A conciliação horária (`lib/billing-trial/conciliar.ts`) a reativou às 19:44Z, na rodada do minuto 43.
6. `conferir-pagamento-hml.mjs`: A1 a A4 e B1 a B4 PASSOU (`evidence/003-billing/pagamento-hml-2/conferir-pagamento.txt`). A assinatura foi achada pelo `checkoutSession`, é única e a conta foi reativada com UMA assinatura.

Achados (para melhoria, nenhum bloqueia a 003):
- Quando o e-mail de confirmação não pode ser enviado, a tela de cadastro disse "Já enviamos…" mas a conta não foi criada.
- Se a pessoa paga num navegador sem sessão (celular), a reativação espera até 1 hora pela conciliação.

Produção (06/11/2026, após o deploy da main, todas as marcas desligadas): `sonda-producao-cobranca.mjs` P1 a P3 PASSOU (`/` 200, `/app` 307, health 200); contagens no banco por leitura: marcas com cobrança ligada 0, organizações suspensas por cobrança 0, assinaturas em trial com cartão 0, organizações 1.

Resíduos: no sandbox do Asaas há agora 4 assinaturas ACTIVE (a nova é a do checkout `57c55a90…`); na hml, uma organização e um usuário de teste novos (`delivered+t003…@resend.dev`); credenciais só em `~/.secrets/teste-003-novo-hml.env`.

## Mudança 011 (07/11/2026): pagar sem voltar ao site reativa em segundos

Fecha os dois achados da rodada final de 06/11. Ambiente: hml, marca de teste `marca-a`, código da main `1587b98`. Provas em `evidence/011-atrito/`.

1. **Payload do webhook (T-001).** O aviso `SUBSCRIPTION_CREATED` do Asaas **traz** o `checkoutSession` (log `cobranca.webhook_cliente_desconhecido` com `tem_checkout_session: true`). O corpo do aviso continua sem ser gravado.
2. **Defeito achado só pela prova real.** A 1ª tentativa (07/11 00:22Z) ainda caiu em `cliente_desconhecido`: a busca por `checkout_provedor_id` filtrava `provedor = asaas`, e a coluna `provedor` é NULA até o cliente do Asaas ser gravado. Corrigido no PR #76 (a busca aceita `provedor` nulo ou o do aviso).
3. **Conta nova paga sem voltar ao site (T-014).** Aviso recebido às 13:18:25Z, empresa achada pelo checkout (`cobranca.webhook_achado_por_checkout`), `tenant.reactivated` às 13:18:39Z: cerca de 14 s, antes da conciliação horária (minuto 43). `conferir-pagamento-hml.mjs`: A1 a A4 e B1 a B4 PASSOU, uma só assinatura (`evidence/011-atrito/conferir-pagamento.txt`).
4. **Hub na espera (T-015).** Conta suspensa em "confirmando" mostra "Confirmando seu pagamento", "Se passar de 1 hora, fale com o suporte" e o botão "Verificar agora" (`evidence/011-atrito/hub-confirmando.png`). Essa conta de teste não foi paga; o estado foi reproduzido gravando na linha o que o retorno do navegador grava (`checkout_url` nulo, sessão guardada, prazo de 1 h).
5. **Cadastro.** Coberto por testes de unidade (`envio-de-acesso-da-marca.test.ts`, AC-003.1 a AC-003.5): falha de envio devolve a reserva de 60 s, sucesso a mantém. Não houve prova pela tela na hml (o e-mail de teste não falha de propósito).

Resíduos na hml: 3 organizações de teste `[teste-011]` e seus usuários (`delivered+t011…@resend.dev`); a de ids `f84f30c7…` segue suspensa, sem pagamento. O cadastro da hml foi aberto só durante cada criação de conta e voltou a "só convite" (verificado).
Observação: o worker registrou `cobranca.nota_nao_pedida` com `parse_error` logo após a reativação; fora do escopo da 011, a investigar.
