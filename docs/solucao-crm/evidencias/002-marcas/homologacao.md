# Prova na homologação — subprojeto 1 (marcas, parceiros e domínios)

Data: 27/10/2026 (UTC). Ambiente: `hml.corretora.io` (Supabase Cloud Free, us-east-1), código da `main` no SHA `b438011`.
Esta página registra só o que foi **medido**; os arquivos `marcas-*.txt` ao lado são a saída bruta das sondas.

## O que foi montado

| Item | Resultado |
|---|---|
| DNS | `marca-a.corretora.io` e `marca-b.corretora.io` apontam para a VPS (registro A criado pelo dono no Hostinger) |
| HTTPS | Caddy emitiu certificado comum (Let's Encrypt) para os dois hosts; `ssl_verify_result=0`; sem `on_demand` (arquivo `caddy-sites/marcas-teste.caddy`, removível) |
| Resend | domínio `mail.corretora.io` verificado (DKIM + SPF), região São Paulo |
| Gancho de e-mail | Supabase Cloud → Authentication → Hooks → Send Email → `https://hml.corretora.io/api/hooks/auth/send-email` |
| Marcas | criadas pelo painel `/admin/marcas`: `marca-a` (subdomínio) e `marca-b` (domínio próprio) |

## Provas

1. **Três endereços, três logins (AC-005.1).** `marcas-login.txt`: `marca-a` mostra "Marca A Teste", `marca-b` mostra "Marca B Teste" e `hml` mostra a marca padrão.
2. **E-mail com a marca (AC-006.1, AC-006.4).** Pedido de redefinição de senha em `marca-a.corretora.io`: o e-mail chegou à caixa do dono em ~1 minuto, remetente "Marca A Teste <acesso@mail.corretora.io>", assunto "Redefinir sua senha · Marca A Teste", e o botão aponta para `https://marca-a.corretora.io/auth/confirm?...`. Não há print versionado: o link carrega um código de redefinição de senha.
3. **Gancho assinado (AC-006.2).** Chamada sem assinatura: HTTP 401. Chamada com assinatura Standard Webhooks válida e corpo inválido: HTTP 400 (passou da assinatura).
4. **Endereço sem marca, sem certificado (AC-007).** `marcas-removido.txt`: `teste.corretora.io` aponta para a VPS, mas não tem site nem marca; o HTTPS é recusado.
5. **Chave de desligamento (AC-002.1).** `marcas-rollback.txt`: com `MARCAS_POR_DOMINIO=off` e só o app recriado, o login voltou à marca padrão em **15 s** (limite 120 s). O `.env` foi restaurado ao fim pela própria sonda.
6. **Produção intacta.** `app.corretora.io/` = 200 durante todo o teste.

7. **Caddyfile novo valida contra o Caddy de produção.** `caddy validate` com a mesma imagem (`caddy:2-alpine`, v2.11.7) sobre `Caddyfile.single-server` do repositório e a pasta real `caddy-sites` da VPS: `Valid configuration` (o arquivo atual, como controle, também). O `ask` global e o bloqueio de `/api/internal/*` são aditivos e inertes sem o arquivo opt-in `marcas.caddy`.

## Achados da prova (corrigidos)

| Achado | Causa | Correção |
|---|---|---|
| Cadastro reprovado com "Hook requires authorization token" | `AUTH_HOOK_SECRET` do container diferente do que o Supabase assinava (o deploy não recriou o app depois da troca do segredo) | recriado o app; provado por assinatura válida → 400 e sem assinatura → 401 |
| E-mail não saía (`not_configured`) | `RESEND_FROM_EMAIL` gravado como "Nome <endereço>"; o sistema só aceita o endereço puro e acrescenta o nome da marca | remetente corrigido; runbook e instrução atualizados |
| Telas mostravam "DeskcommCRM" nas marcas novas | a camada de marca só lia `app_name`, que o painel não preenche; o e-mail já usava `name` | PR #14: `name` como reserva (marca padrão segue herdando) |
| "Muitas tentativas" no cadastro | limite de e-mails do próprio Supabase Cloud (`over_email_send_rate_limit`), estourado pelas tentativas que falharam por causa do remetente | limite elevado para o ambiente de teste |
| Sonda de desligamento usava o compose errado | apontava `docker-compose.traefik.yml` e não religava o alias do Caddy | sonda usa os mesmos arquivos do `deploy.sh` e restaura o `.env` ao fim |

## Pendente (depende do dono ou da produção)

- T-047: implantar em produção só com a marca padrão (clique do dono ou autorização).
- T-048: sonda em produção (`/` = 200, `/app` = 307).
- HTTPS sob demanda de ponta a ponta (`on_demand_tls` + `tls-ask`) **não foi exercitado na homologação**: o Caddy é o da produção e o `ask` global só passa a valer quando o Caddyfile novo chegar à produção. O comportamento da rota está coberto por testes unitários e a sintaxe do Caddyfile já foi validada (item 7).
