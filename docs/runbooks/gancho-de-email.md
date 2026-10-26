# Gancho de e-mail de acesso (marca por endereço)

Com o gancho ligado, o Supabase Auth (GoTrue) deixa de enviar o e-mail de acesso
(confirmação, convite, recuperação, link mágico, troca de e-mail, reautenticação)
e chama o app em `POST /api/hooks/auth/send-email`, assinado (Standard Webhooks).
O app monta o e-mail com a marca do endereço em que o pedido nasceu e envia pelo
roteador de e-mail da instalação (SMTP ou Resend). Sem e-mail configurado o envio
falha com erro claro, e a tela diz "não conseguimos enviar, tente de novo".

Desligado (padrão), nada muda: o GoTrue segue com o SMTP e os moldes de antes.

## Segredo (nunca no chat nem no repositório)

```bash
echo "v1,whsec_$(openssl rand -base64 32)"
```

O MESMO valor vai em dois lugares:

1. `.env` do app: `AUTH_HOOK_SECRET=<valor>`
2. Quem envia o e-mail para o GoTrue (abaixo).

## Self-host (single-server)

No `.env` do Supabase (o override do kit já mapeia as três chaves, com padrão desligado):

```
GOTRUE_HOOK_SEND_EMAIL_ENABLED=true
GOTRUE_HOOK_SEND_EMAIL_URI=http://app:3000/api/hooks/auth/send-email
GOTRUE_HOOK_SEND_EMAIL_SECRETS=<o mesmo valor>
```

Recrie o serviço `auth` do Supabase e o `app`.

## Supabase Cloud

Painel do projeto: Authentication > Hooks > Send Email > tipo HTTPS.
URL: `https://<domínio público do app>/api/hooks/auth/send-email`. Em "Secret",
gere ou cole o segredo (o painel mostra `v1,whsec_...`) e ponha o mesmo valor em
`AUTH_HOOK_SECRET` no app.

## Como conferir

- Chamada sem assinatura: `401` e nenhum e-mail.
- Pedir recuperação de senha em um endereço de marca: o e-mail chega com nome,
  logo e remetente da marca, e o link aponta para o mesmo domínio.
- Falha de envio: aviso na tela, `auth.email_hook_send_failed` em `/app/audit` e
  alerta no Sentry (sem e-mail em claro nem token).
- Novo pedido do mesmo e-mail e ação em menos de 60 s: a tela pede para aguardar.

## Desligar

`GOTRUE_HOOK_SEND_EMAIL_ENABLED=false` (ou apagar as três linhas) e recriar o
`auth`. Se `AUTH_HOOK_SECRET` ficar vazio no app, toda chamada ao gancho é `401`.
