# Marcas e domínios próprios: passo a passo

Para quem opera a instalação (o dono). Serve para dar a cada parceiro uma marca (nome,
logo, cor) e um endereço próprio, como `crm.clinica.com.br`. Onde a marca não está ligada,
tudo continua igual a antes.

Você vai precisar de: acesso ao painel como administrador da plataforma, acesso ao DNS do
domínio do parceiro e acesso à VPS (pelo terminal).

## 1. Criar a marca e o domínio (pelo painel)

1. Entre no painel e abra `/admin/marcas`.
2. Crie a marca: nome, nome do app, cor, logo e e-mail de suporte.
3. Dentro da marca, adicione o **domínio** (ex.: `crm.clinica.com.br`). Ele nasce
   pendente e só vale depois que você ativa.
4. Vincule as organizações do parceiro a essa marca.

## 2. Apontar o DNS para a VPS

No painel de DNS do domínio do parceiro, crie um registro:

- Tipo **A**, nome `crm` (ou o que for), valor = o **IP público da VPS**.

Espere propagar (de minutos a algumas horas). Para conferir:
`nslookup crm.clinica.com.br` deve mostrar o IP da VPS. O sistema só emite o certificado
HTTPS se o DNS apontar para o IP certo.

## 3. Ligar o HTTPS sob demanda

Na VPS, na pasta da instalação:

1. Abra o `.env` e preencha duas linhas (o editor que você já usa):
   - `TLS_ASK_TOKEN=` com um valor aleatório: `openssl rand -hex 32` gera um. Não cole
     esse valor em conversa nenhuma.
   - `VPS_PUBLIC_IP=` com o IP público da VPS.
2. Copie o modelo para o arquivo ativo:

   ```bash
   cp caddy-sites/marcas.caddy.exemplo caddy-sites/marcas.caddy
   ```

3. Confira se o Caddyfile está válido (deve terminar dizendo `Valid configuration`):

   ```bash
   docker run --rm -e TLS_ASK_TOKEN=x -v $PWD/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
   ```

4. Recrie o app e o caddy para ler o `.env` novo (use os dois arquivos de compose da sua
   VPS, como em `docs/runbooks/deploy.md`).
5. Abra `https://crm.clinica.com.br/login`: a primeira visita pode demorar alguns
   segundos, é o certificado sendo emitido. Deve aparecer o login com a marca do parceiro.

Se o certificado não sai: confira o registro A (passo 2), se o domínio está **ativo** no
painel e se `VPS_PUBLIC_IP` é o IP certo. O Caddy só emite para domínio ativo cujo DNS
aponta para a VPS.

## 4. E-mails de acesso com a marca

Para que o e-mail de recuperar senha, convite e confirmação saia com a marca e o link no
endereço do parceiro, ligue o gancho de e-mail:
siga `docs/runbooks/gancho-de-email.md` (segredo `AUTH_HOOK_SECRET` e as três linhas
do Supabase).

Para os e-mails não caírem no spam, configure no **Resend** o domínio de envio:

- **SPF** e **DKIM**: o Resend mostra os registros (tipo TXT/CNAME) para você criar no DNS
  do domínio de envio. Depois clique em verificar. Os dois precisam ficar "verified".
- O remetente (`RESEND_FROM_EMAIL`) tem de ser desse domínio verificado.

## 5. Desligar (voltar ao comportamento de antes)

Se algo der errado, desligue sem mexer em banco nem em código:

1. No `.env`: `MARCAS_POR_DOMINIO=off`
2. Recrie **só o app**:

   ```bash
   docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml --env-file .env up -d --no-deps --force-recreate app
   ```

   (sem o `-f docker-compose.traefik.yml` o domínio pode passar a dar 404; veja
   `docs/runbooks/deploy.md`.)
3. Em até 2 minutos todos os endereços mostram a marca padrão. Os dados das marcas ficam
   guardados; para religar, volte o valor e recrie o app de novo.

Para parar também a emissão de certificados novos, apague `caddy-sites/marcas.caddy` e
recarregue o caddy.

## O que guardar como prova

Cada passo concluído (e o resultado das sondas) vai para
`docs/solucao-crm/evidencias/002-marcas/`; o README de lá diz o que cada arquivo precisa conter.
