# 005 — Jornada do canal de e-mail na homologação (T-044, AC-009.3)

Data: 04/11/2026. Ambiente: `https://marca-a.corretora.io`, organização de teste `[teste-003] Empresa Exemplo`, dono de teste logado pela tela (Playwright). Código da hml conferido: `/api/v1/health` devolve `version c9144c8` (o `c9144c893` desta branch); `/` responde 200 e `/app` responde 307.

Servidor de e-mail: o de TESTE da VPS (IMAP 993 e SMTP 465, certificado verificado, sem `rejectUnauthorized: false`). O "cliente" externo é a segunda caixa do mesmo servidor.

Sonda: `scripts/sondas/jornada-email-hml.mjs` (passos `base`, `conectar`, `receber`, `ignorar`, `responder`, `pausar`, `senha`, `teto`, `limpar`, chamáveis um a um). Resultados em JSON: `evidence/005-email/jornada-hml/*.json`. Fotos com e-mails e campos mascarados; medidas por `scrollWidth` e `getBoundingClientRect`. Nenhuma senha, e-mail inteiro ou segredo foi impresso ou gravado em arquivo versionado.

## Resultado em uma linha

**A jornada PAROU no passo 2 (Conectar).** O botão Conectar recusa com "cifra indisponível nesta instalação — a chave não foi gravada": o banco da hml nunca recebeu a chave de cifra (`private.app_secrets` vazio e GUC `app.nuvemshop_oauth_key` ausente — conferido só por leitura). Sem caixa gravada não há como receber, responder, ignorar, pausar ou limitar. Os passos 3 a 9 **não foram medidos**. Instalar a chave no banco da hml é mudança de ambiente que a tarefa não autorizava (o banco só podia ser lido/limpo na organização de teste); fica como pendência do dono, com o comando abaixo.

## Tabela de passos

| # | Passo (AC) | Resultado | Evidência |
|---|---|---|---|
| 0 | Hml roda o commit certo (c9144c8), `/`=200 e `/app`=307, organização sem caixa | PASSOU | [01-base.json](evidence/005-email/jornada-hml/01-base.json) |
| 0b | E-mail ANTIGO (anterior à conexão) deixado na caixa do servidor para provar AC-001.5 | PASSOU (preparo) | [01-base.json](evidence/005-email/jornada-hml/01-base.json) |
| 1a | Conexões tem a aba E-mail e, sem caixa, o assistente já abre | PASSOU | [aba vazia](evidence/005-email/jornada-hml/02-conectar-01-aba-vazia.png) |
| 1b | Gmail: 3 passos da senha de app e servidores do Gmail (AC-001.1) | PASSOU | [gmail](evidence/005-email/jornada-hml/02-conectar-02-gmail.png) |
| 1c | Outro provedor: servidor/porta/segurança/usuário/senha; Conectar travado antes do Testar (AC-001.2, 001.3) | PASSOU | [preenchido](evidence/005-email/jornada-hml/02-conectar-03-preenchido.png) |
| 1d | Testar entra na caixa e envia o e-mail de teste ("Deu certo" em ~2 s) e libera Conectar (AC-001.3) | PASSOU | [testado](evidence/005-email/jornada-hml/02-conectar-04-testado.png) |
| 1e | Conectar grava a caixa e ela aparece com estado e Pausar (AC-001.5) | **FALHOU** (achado 1) | [conectar falhou](evidence/005-email/jornada-hml/02-conectar-05-conectar-falhou.png) |
| 1f | Nenhum e-mail antigo importado (AC-001.5) | NÃO MEDIDO | exige a caixa conectada |
| 2 | Receber: conversa no Inbox com assunto, texto, contato e canal; anexo baixa; HTML limpo sob demanda (AC-002.*, 004.*, 008.5) | NÃO MEDIDO | bloqueado pelo achado 1 |
| 3 | Ignorar: automático de remetente novo não vira conversa; lista de ignorados; promover; não é cliente (AC-003.*) | NÃO MEDIDO | bloqueado pelo achado 1; ver achado 2 (a tela não existe no código) |
| 4 | Responder pelo Composer: Re:, In-Reply-To, References, assinatura, sem recibo (AC-004.*) | NÃO MEDIDO | bloqueado pelo achado 1 |
| 5 | Pausar e retomar sem perder nem reimportar (AC-008.1/2) | NÃO MEDIDO | bloqueado pelo achado 1 |
| 6 | Configurar com senha errada recusa sem salvar (AC-001.4) | NÃO MEDIDO | bloqueado pelo achado 1; o aviso na Central por senha recusada pela rodada nunca seria medido sem mexer no servidor |
| 7 | Teto 1 e duas respostas: a 2ª na fila com aviso e hora (AC-005.*) | NÃO MEDIDO | bloqueado pelo achado 1 |
| 8 | Limpeza | PASSOU (sem o que limpar) | ver "Estado em que a organização ficou" |

Medidas de tela (todas as 5 telas fotografadas): janela 1280 px, `scrollWidth` 1280, 0 botões fora da janela (JSON do passo 2).

## Achados

1. **A hml não consegue conectar nenhuma caixa: falta a chave de cifra no banco.**
   - Reprodução: Conexões › E-mail › Outro provedor › preencher › Testar (passa) › Conectar.
   - Esperado: caixa gravada, cartão "Conectada". Obtido: faixa vermelha "cifra indisponível nesta instalação — a chave não foi gravada" e nenhuma linha em `channel_sessions`.
   - Causa: `app/api/v1/channels/email/route.ts` grava a senha por `encryptWebhookSecret` (`lib/webhooks/secrets.ts`) → RPC `fn_encrypt_oauth` → `private.fn_oauth_key()` (baseline), que lê o GUC `app.nuvemshop_oauth_key` ou a linha `nuvemshop_oauth_key` de `private.app_secrets`. Na hml as duas fontes estão vazias (leitura: `select name from private.app_secrets` devolve 0 linhas). O instalador do kit provisiona essa linha (`hostgator-setup-kit/_common.sh`, `scripts/local-stack.sh`, `scripts/gerar-env-e2e.sh`); o banco da hml, que é um projeto Supabase criado à parte, nunca a recebeu.
   - Gravidade: de **ambiente**, não do código — o comportamento do produto (recusar a conexão em vez de guardar a senha em claro) é o desenhado e está correto. Mas vale dois cuidados: (a) a doutrina de QA visual exige que a hml seja o espelho de uma instalação fresca, e uma instalação fresca tem a chave; (b) o mesmo defeito vale para qualquer outro canal que cifre segredo na hml.
   - Para destravar (decisão do dono, fora do alcance desta tarefa): gravar na hml `insert into private.app_secrets (name, value) values ('nuvemshop_oauth_key', '<openssl rand -hex 32>') on conflict (name) do nothing;` e rodar os passos `base` e seguintes da sonda.
2. **A mensagem de erro do Conectar é técnica para um leigo, e a tela mostra "Deu certo" e o erro ao mesmo tempo.** "cifra indisponível nesta instalação — a chave não foi gravada" não diz o que fazer; e o aviso verde "Deu certo. Entramos na caixa…" continua visível abaixo do alerta vermelho (`components/connections/email/AssistenteDeConexao.tsx`: `conectar()` não zera `testado` ao falhar, e `testado` e `erro` renderizam juntos). Ver a foto do passo 1e.
3. **Não há tela para a lista de ignorados, "promover" nem "Não é cliente" (AC-003.3, AC-003.4) — achado de leitura do código, a confirmar ao vivo.** `grep` em `components/` e `app/` por `ignorados`, `remetentes`, `promover` e `não é cliente` só acha as rotas de API (`app/api/v1/channels/email/ignorados`, `.../ignorados/[id]/promover`, `.../remetentes`) e a lib; nenhum componente as chama. O passo `ignorar` da sonda já testa isso (varre as telas de Conexões, Inbox e Configurações atrás de "ignorad" e procura um botão "Não é cliente" na conversa) e usa as rotas só como diagnóstico, marcando-as como "API, diagnóstico, não prova de UX".
4. **A aba E-mail não tem como remover/desconectar a caixa.** O cartão (`CartaoDaCaixa.tsx`) tem só Pausar, Retomar e Configurar. A única saída é `DELETE /api/v1/channel-sessions/[id]` (genérico, sem botão no cartão de e-mail). O passo `limpar` da sonda mede isso e, se não houver botão, usa a rota genérica e registra como achado.

Itens 3 e 4 são hipóteses de leitura de código: o passo correspondente da sonda foi escrito para confirmá-las ou refutá-las pela tela, mas só pôde ser rodado depois do achado 1 ser resolvido.

## O que NÃO foi medido

- Todo o ciclo depois de Conectar: receber (cron `email-rodada` real da hml), ignorar, responder (cabeçalhos `Re:`, `In-Reply-To`, `References`, assinatura, sem recibo), pausar/retomar, senha errada em Configurar, teto diário e fila com aviso. Os passos estão escritos na sonda mas **nunca foram executados contra uma caixa conectada**; seletores dessas telas são, portanto, não calibrados e podem precisar de ajuste na primeira execução.
- Aviso na Central por senha recusada pela rodada (exigiria trocar a senha no servidor de teste, vetado pela tarefa).
- Segundo provedor real (Gmail com senha de app, Outlook, etc.): só o servidor de teste da VPS foi usado.
- Se o scheduler da hml roda a linha `email-rodada` (a sonda confiaria no cron real; não houve oportunidade de observá-lo sem caixa conectada).
- Conteúdo de e-mail com acentos/HTML complexo e anexos grandes (o limite de tamanho).
- Layout em celular (só 1280 px).

## Estado em que a organização de teste ficou

- Nenhuma caixa de e-mail foi gravada (a conexão falhou antes). `channel_sessions` sem linha de e-mail para a organização.
- O onboarding da organização de teste foi marcado como concluído para a sonda abrir `/app` (mesmo procedimento da jornada da cobrança) e **foi desfeito** (`onboarded_at` voltou a `null`).
- Resíduos fora do banco da hml: no servidor de e-mail de teste ficaram na caixa do CRM o e-mail antigo da sonda (assunto `[005] ANTIGO T044-…`) e os e-mails de teste enviados pelo "Testar" (3 execuções do assistente). Não há senha em arquivo do repositório.
