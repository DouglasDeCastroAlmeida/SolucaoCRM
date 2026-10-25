# Inventário de acessos (sem valores)

Cada linha diz: para que serve, onde o segredo vive hoje, como entregar a uma sessão nova sem expor, e o que fazer se faltar.
Nunca escreva valores neste arquivo. Rotacionar um segredo = gerar um novo no painel do serviço e atualizar o lugar indicado.

| Recurso | Para que serve | Onde vive hoje | Como entregar à sessão nova | Se faltar |
|---|---|---|---|---|
| **GitHub (repo)** `DouglasDeCastroAlmeida/SolucaoCRM` | clonar, branch, PR, merge, disparar workflows (`deploy-prod`, `e2e`) | login do dono; `gh` CLI com token no PC | App do GitHub conectado à conta Claude (nuvem) ou `gh auth login` (local). Escopos: `repo`, `workflow`; `user` só para a sonda de minutos | sem PR/merge/deploy automático: o dono faz o clique na tela do GitHub |
| **GitHub Secrets** (SSH_HOST, SSH_PORT, SSH_USER, SSH_PRIVATE_KEY, SSH_KNOWN_HOSTS) e variáveis `URL_PUBLICA` | o pipeline entra na VPS como usuário `deploy` (chave restrita ao comando de deploy) | Settings > Secrets do repositório; ambiente `producao` restrito à `main` | já estão no GitHub; a sessão nova NÃO precisa vê-los | — |
| **GHCR** (imagens `ghcr.io/douglasdecastroalmeida/*`) | a VPS puxa as imagens | token de leitura na VPS (deploy) | nada a entregar | imagens não sobem na VPS |
| **VPS Hostinger** `srv2049015` (IP no `docs/solucao-crm/evidencias/001-fundacao/dns.txt`) | sondas, diagnóstico, instalar scripts | usuários `root` (chave do dono), `deploy` (chave restrita), `dev` (sem Docker, só leitura via `sudo crm-status`) | **Não confirmado** que a nuvem alcance a porta 22. Alternativa: sessão LOCAL para o que toca a VPS; a nuvem faz só código e PR | a nuvem não roda sondas nem inspeciona a VPS; o deploy continua pelo GitHub |
| **Supabase Cloud (homologação)** projeto `solucao-crm-hml` | banco da hml | `C:\Users\Douglas\.secrets\supabase-hml.env` (PC) e `/opt/crm-hml/.env` (VPS) | só se a sessão precisar tocar o banco da hml; pedir ao dono para configurar como segredo do ambiente, nunca colar | testes que precisam desse banco não rodam; use Postgres local (Docker) |
| **Cloudflare R2** bucket `solucao-crm-backups` | backup externo | `C:\Users\Douglas\.secrets\backup-r2.env` (PC) e `/opt/crm-deploy/.env.backup` (VPS, 0600) | normalmente nenhuma: o backup roda na VPS | — |
| **Chave `age`** (restaurar backups) | abrir os backups | `C:\Users\Douglas\.secrets\age-chave-privada.txt` + gerenciador de senhas + pen drive | NUNCA para a nuvem; só o dono, no momento de restaurar | sem restauração (a chave pública na VPS só cifra) |
| **Sentry** projeto `solucao-crm` | erros | DSN em `C:\Users\Douglas\.secrets\sentry.env` e no `.env` da VPS | nada a entregar | — |
| **UptimeRobot** | alerta de queda | conta do dono | nada a entregar | — |
| **Hostinger (DNS/painel)** | registros A de corretora.io | conta do dono | só o dono mexe | — |

Regra geral: a sessão NUNCA precisa ler valores de segredos. Quando precisar usar um, o dono salva o arquivo e a sessão o leva ao destino
(VPS ou Secrets do GitHub) sem imprimir. Em nuvem, prefira "segredos de rede" a variáveis de ambiente comuns (essas são legíveis por quem usa o ambiente).
