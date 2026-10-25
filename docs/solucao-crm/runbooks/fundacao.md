# Runbook da fundação (subprojeto 0)

Escrito para quem **não é de infraestrutura**. Cada seção diz: o que é, como saber se está bem, e o que fazer se não estiver.
Nada aqui exige colar segredo em chat. Segredos vivem em `C:\Users\Douglas\.secrets\` (seu computador), nos Secrets do GitHub e nos `.env` da VPS.

## 0. O mapa em uma frase
Uma VPS (`179.199.155.156`, Hostinger KVM4) roda tudo atrás de **um único Caddy** (o do CRM) que é dono das portas 80 e 443:
`app.corretora.io` → CRM de produção · `hml.corretora.io` → homologação (a criar) · `valescaalmeida.com` → site do vava.

| Pasta na VPS | O que é | Dono |
|---|---|---|
| `/opt/crm-prod` | o CRM de produção (código, `.env`, banco Supabase em `.runtime/`) | usuário `deploy` |
| `/opt/crm-hml` | a homologação | usuário `deploy` |
| `/opt/crm-deploy` | os scripts que o pipeline executa (`deploy.sh`, backup, medição) | `root` (o `deploy` só executa) |
| `/opt/vava` | o site do vava (só HTTP interno) | `root` |
| `/root/backups/vava-*` | cópia completa do vava antes da troca de portas | `root` |

Usuários: `root` (só você/eu em ações combinadas), `deploy` (só pela chave do pipeline, só roda o comando de deploy), `dev` (Claude Code: sem Docker, sem ler produção; usa `sudo crm-status`).

## 1. Está tudo bem? (30 segundos)
```
bash tests/infra/vps/sondas.sh portas producao swap firewall isolamento-dev dns
```
Deve terminar com `sondas: TUDO OK`. Cada linha `FAIL` diz qual critério falhou.
Ou, na VPS como `dev`: `sudo crm-status` (containers e logs, sem segredos).

## 2. Deploy normal (o dia a dia)
1. Faça merge na `main` pelo PR. O CI publica as imagens com tag = SHA do commit.
2. A **homologação** recebe sozinha (`deploy-hml.yml`). Confira `https://hml.corretora.io`.
3. Para **produção**: GitHub → Actions → **Deploy em produção** → *Run workflow* (branch `main`, SHA vazio = o último). O seu clique é a aprovação (o plano Free do GitHub não tem "Required reviewers"; com o GitHub Pro basta marcar a caixa no ambiente `producao`).
4. O `deploy.sh` faz backup, troca as imagens, espera `/` = 200 e `/app` = 307 por até 90 s e, se falhar, **volta sozinho** à versão anterior (código de saída 10; 11 = falhou e não conseguiu voltar → alerta crítico, veja a seção 5).

Regra de ouro das migrations: **só adicione** (coluna/tabela nova) num deploy; apagar/renomear fica para um deploy posterior. Assim voltar a versão do app nunca quebra o banco.

## 3. Backup e restauração
- **Diário às 03:17** (cron do `deploy`): gera o backup do kit (banco, sessões do WhatsApp, anexos), **criptografa com `age`** e envia ao Cloudflare R2 (bucket privado `solucao-crm-backups`). O script se recusa a enviar se o bucket passar de **7 GB** (o plano gratuito é 10 GB) e avisa em `/opt/crm-deploy/dados/alertas.log`.
- No painel do R2 há uma regra que **apaga objetos com mais de 14 dias**.
- **A chave que abre os backups** é a *privada*: `C:\Users\Douglas\.secrets\age-chave-privada.txt` (guarde também no gerenciador de senhas, em 2 lugares). **Sem ela os backups não abrem.** A VPS só tem a chave pública.
- **Restaurar** (num banco VAZIO): copie a chave privada para `/dev/shm/.k.txt` na VPS (memória, some no reinício), rode
  `BACKUP_ENV_FILE=/opt/crm-deploy/.env.backup /opt/crm-deploy/restaurar-backup-externo.sh --objeto <db-....sql.gz.age> --identidade /dev/shm/.k.txt --destino /dev/shm/rt`,
  restaure o `.sql.gz` num Postgres vazio (veja `hostgator-setup-kit/restore.sh`) e **apague a chave** (`shred -u /dev/shm/.k.txt`).
- Provado em 23/10/2026 (`docs/solucao-crm/evidencias/001-fundacao/backup-real-e-restauracao.txt`): 197 tabelas, 635 políticas, usuário e organização idênticos.
- ⚠️ Armadilha: restaurar dentro do banco `postgres` de uma imagem Supabase nova **falha** em `auth.users`, porque a imagem já nasce com o schema `auth` incompleto. Use um banco vazio.

## 4. Trocar o dono das portas / voltar o vava ao estado antigo
- A cópia completa do vava está em `/root/backups/vava-20261023-024205`. Para voltar tudo: `04-mover-vava.sh --desfazer <pasta>` (admin).
- Reversão rápida (segundos): pare o Caddy do CRM (`docker compose -f docker-compose.prod.yml -f docker-compose.single-server.yml stop caddy`, em `/opt/crm-prod`) e suba o vava antigo com `docker compose -f /root/vava-rollback.yml up -d --force-recreate` (usa a imagem guardada `vava-website:antes-da-troca`).
- Para **publicar outro site** pelo Caddy do CRM: crie `/opt/crm-prod/caddy-sites/<nome>.caddy` e ponha o container na rede `crm-prod_caddy-sites` (veja o `vava.caddy`).

## 5. O deploy falhou (código 10 ou 11)
- **10**: voltou sozinho. Veja a causa em *Actions* → o job `deploy` (o log não tem segredos). Corrija e faça novo merge.
- **11**: não voltou. Na VPS (como root): `cd /opt/crm-prod && docker compose -f docker-compose.prod.yml -f docker-compose.single-server.yml ps`; se `app` estiver parado, edite `APP_IMAGE`/`WORKER_IMAGE`/`SCHEDULER_IMAGE` no `.env` para a tag anterior e rode `up -d` **com os dois arquivos de compose** (sem o segundo o domínio inteiro dá 404). O `.env` anterior também fica em backup no processo do deploy.
- Depois de qualquer deploy: `https://app.corretora.io/` = 200 e `/app` = 307.

## 6. Memória e disco
`medir-memoria.sh` roda a cada 10 min e guarda a série em `/opt/crm-deploy/dados/memoria.tsv` (14 dias). `medir-memoria.sh --resumo` diz "ok" ou "ATENÇÃO". **Se a memória disponível ficar abaixo de 2 GB por 24 h**, o alerta diz que é hora de **mover a produção para uma VPS própria** (decisão D-02 da fundação; também no primeiro cliente pagante).
Alertas ficam em `/opt/crm-deploy/dados/alertas.log` (e no syslog, `crm-alerta`).

## 7. Custo do GitHub Actions
O plano gratuito dá 2.000 min/mês para repositório privado. Cada rodada completa do CI gasta ~70–90 min (4 partes de teste de 8–24 min). **Empurre pouco** (um push por fatia) e junte commits. Consulte o uso em GitHub → Settings → Billing → Usage. O teto de tempo do job foi subido para 40 min e o orçamento para 35 (o runner é compartilhado e varia muito).

## 8. Onde estão as provas
`docs/solucao-crm/evidencias/001-fundacao/` e as sondas em `tests/infra/vps/sondas.sh`. Tudo sem segredos.

## 9. O que mudou na fase final (24–25/10/2026) e como operar
- **Baseline do banco:** o `deploy.sh` só o reaplica quando `supabase/baseline.sql` muda (marca `.baseline-aplicado` na pasta do ambiente). Para forçar: `FORCAR_BASELINE=1` (com `sudo -u deploy env FORCAR_BASELINE=1 /opt/crm-deploy/deploy.sh <hml|prod> <sha> <dono>`). Na hml o baseline leva ~12 min (banco nos EUA); o SSH do pipeline tem keepalive para não cair.
- **Saúde do deploy:** usa o endereço público (`NEXT_PUBLIC_APP_URL` do `.env`), não `localhost`. O rollback devolve imagens, `.env` **e o código**. Rollback medido: 5 s.
- **Homologação:** `/opt/crm-hml`, publicada pelo Caddy da produção SÓ pelo apelido `crm-hml-app` (ligado pelo `deploy.sh`, `publica_hml`). Nunca anexe a rede `caddy-sites` pelo compose da hml: o apelido `app` vazaria tráfego da produção.
- **e2e (decisão A-07):** só roda por disparo manual (Actions → e2e → Run workflow). Faça isso antes de entregas importantes.
- **Sentry:** `SENTRY_DSN` no `.env` de prod e hml (do dono). Vazio = Sentry da comunidade do projeto original; `off` = desligado. Nunca deixe vazio.
- **Custo do GitHub:** em repositório PRIVADO a cota gratuita (2.000 min/mês) acabou em 24/10 e os jobs param ("recent account payments have failed...", sem cobrança por falta de cartão). Em repositório PÚBLICO os minutos são ilimitados, mas o código e o histórico ficam visíveis a todos: nunca commite `.env`, tokens ou chaves. A sonda `infra/solucao/minutos-github.sh` mede o uso.
- **Código na VPS:** `/opt/crm-prod` passa a seguir os commits da `main` a cada `deploy-prod` (`git checkout --detach <sha>`); não edite arquivos versionados lá.
