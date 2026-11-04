# Evidência 005 · Sonda real de e-mail (T-001/T-002, AC-009.1, V-6)

Data: 2026-11-03. Script: `scripts/sondas/sonda-email-real.mjs` (lê as credenciais de fora do repositório; mascara e-mail e senha).
Bibliotecas usadas só na sonda, fora do repo: imapflow 2.5.8, mailparser 3.10.0, nodemailer 10.3.1.

## Resultado: FALHOU no primeiro passo

| Passo | Resultado |
|---|---|
| Descoberta do provedor pelo domínio (gmail.com -> imap.gmail.com / smtp.gmail.com) | passou |
| Login IMAP (993, TLS) | **recusado**: `Invalid credentials (Failure)`, `authenticationFailed` |
| Leitura da caixa de entrada | não medido (sem login) |
| Envio SMTP (465/587) | não medido (parou no login, conforme a regra de não tentar outras formas) |
| Chegada da mensagem por IMAP | não medido |
| Outro provedor | não medido (só há uma conta de teste) |

Conta: `t***@gmail.com`. Causa provável: a senha do arquivo não é uma senha de app do Google (ou o IMAP/verificação em duas etapas não está habilitado). Não confirmado: o servidor só devolve "credenciais inválidas".

## 2ª rodada (2026-11-04): servidor de teste próprio na VPS da hml

O dono não conseguiu uma conta Google utilizável. Foi montado um servidor IMAP/SMTP de teste (docker-mailserver 15, `/opt/crm-mail-teste` na VPS, só portas 465, 587 e 993; sem porta 25) em `mail.corretora.io`, com certificado Let's Encrypt emitido pelo Caddy pelo ponto de extensão `caddy-sites/mail-teste.caddy`. Duas caixas de teste; credenciais só em `~/.secrets/email-teste-vps.env`.

| Passo | Resultado |
|---|---|
| Login IMAP (993, TLS verificado) | passou |
| Leitura da caixa de entrada | passou (uidValidity presente) |
| Envio SMTP (465) | passou, 1 destinatário aceito |
| Chegada da mensagem por IMAP | passou |

**O que isto prova:** imapflow + nodemailer fazem o ciclo completo contra um servidor real, com TLS verificado.
**O que NÃO prova (não medido):** o comportamento de Gmail e de outro provedor de mercado (senha de app, limites, particularidades). AC-009.1 pede conta real de provedor; essa parte segue em aberto e deve ser medida antes de vender o canal (T-044/T-047), com uma caixa real do dono.

## 3ª rodada (2026-11-04): Gmail real, com senha de app

| Passo | Resultado |
|---|---|
| Login IMAP (imap.gmail.com:993, TLS) com senha de app | passou |
| Leitura da caixa de entrada (45 mil mensagens, uidValidity presente) | passou |
| Envio SMTP (smtp.gmail.com:465) | passou, 1 destinatário aceito |
| Chegada por IMAP | **chegou, mas depois dos 60 s** que a sonda esperava (a sonda deu "não chegou"; a busca posterior achou 1 mensagem na caixa de entrada) |

**Achado para o desenho:** no Gmail a mensagem enviada a si mesmo aparece na entrada com atraso maior que 60 s. A espera da rodada e do teste de jornada não pode presumir chegada em um minuto; usar tentativas com prazo maior ou checagem na rodada seguinte.
**Não medido:** um segundo provedor de mercado (outra marca além do Gmail) e a recusa de senha de app pelo Gmail em uso real prolongado.
**Limpeza:** a mensagem da sonda foi apagada da conta (entrada, enviados, spam e lixeira, conferido). A senha de app foi removida do disco da máquina de desenvolvimento; o dono revoga a senha de app no Google.

## Decisão da 1ª rodada (superada pela 2ª quanto ao protocolo)

V-6 não está provado. Não seguir para a Fatia 2. Depende do dono gerar uma senha de app (Conta Google > Segurança > Verificação em duas etapas > Senhas de app) e regravá-la no arquivo, ou fornecer outra conta/provedor; depois reexecutar a sonda. Se continuar falhando, a mudança volta ao design (V-6: outros provedores ou auditoria do Gmail).
