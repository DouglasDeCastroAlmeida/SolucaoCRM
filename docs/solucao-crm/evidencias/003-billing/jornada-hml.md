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

## Resíduos

- Banco da hml: linha de cobrança e `onboarded_at` da empresa de teste restaurados; os 6 avisos da Central criados pela jornada
  foram apagados. Ficam as linhas de `api_audit_log` (somente-anexar: suspensão, reativação e rodada do cron).
- Sandbox Asaas: 3 assinaturas ACTIVE; uma é a da empresa de teste (checkout `ab1cba87…`), **duas são duplicatas de testes
  anteriores** (checkouts `9093cd13…` e `d268aefc…`, criadas em 2/11 e 31/10). Não foram apagadas.
- Arquivos fora do repositório (em `~/.secrets/`): `jornada-003-original.json`, `jornada-003-onboarded.json`, `jornada-003-base-ids.json`.
