# Leia primeiro — continuação do projeto numa sessão nova (nuvem ou outro computador)

Este arquivo substitui a memória local do Claude Code (`~/.claude/projects/.../memory`), que não vai junto para a nuvem.
Escrito para quem assume o trabalho SEM ter visto a conversa anterior. Não contém segredos.

## 1. O que é o projeto
CRM whitelabel/multicliente para profissionais autônomos, fork do DeskcommCRM (MIT) em `DouglasDeCastroAlmeida/SolucaoCRM`
(hoje PÚBLICO só para destravar a cota de minutos do GitHub Actions; a intenção é voltar a PRIVADO).
Spec autoritativa: `docs/solucao-crm/specs/2026-10-21-crm-autonomos-design.md` (decisões D-01..D-14; subprojetos 0..9 na seção 12).
Doutrina de código do upstream (prevalece em conflito): `CLAUDE.md` e `AGENTS.md` na raiz. Nunca sobrescreva esses dois arquivos.
Mapa dos arquivos nossos: fim de `docs/solucao-crm/LEIA-PRIMEIRO.md`. Operação da infra: `docs/solucao-crm/runbooks/fundacao.md`.

## 2. Onde estamos
- **Subprojeto 0 (fundação) CONCLUÍDO e arquivado** (25/10/2026): `.sdd/archive/2026-10-25-001-...`; specs vivas em `.sdd/specs/`.
- Produção `app.corretora.io` (Supabase self-hosted na VPS), homologação `hml.corretora.io` (Supabase Cloud Free), site vava `valescaalmeida.com`;
  um só Caddy (o do CRM) é dono de 80/443. Backup diário cifrado (age) para Cloudflare R2. UptimeRobot e Sentry do dono ativos.
- Deploy: merge na `main` → CI publica imagens no GHCR (tag = SHA) → `deploy-hml` automático; produção = Actions → "Deploy em produção" → Run workflow
  (o clique do dono é a aprovação, decisão A-06). Rollback medido: 5 s.
- **Próximo: subprojeto 1** — só quando o dono pedir, com `/sdd:new` e Grill (uma pergunta por vez, com recomendação).
  Ordem/dependências na seção 12 da spec (3 e 4 podem ir juntos depois do 0; a Inbox estilo WhatsApp é o subprojeto 3, D-14).

## 3. Regras do dono (valem sempre)
1. O dono é **leigo em infraestrutura**: explique em português simples; para painéis (Hostinger, GitHub, Cloudflare, Supabase, Sentry), dê cliques exatos e diga em qual site/tela.
2. **Nunca peça segredos no chat.** Segredos vão em arquivo que o dono cria (ele mesmo salva), nos Secrets do GitHub ou no `.env` da VPS. Nunca imprima `git remote -v`,
   `.env`, tokens nem linhas de comando com senha (já vazou três vezes por descuido); mascare sempre.
3. **A esteira SDD é obrigatória** para toda mudança de comportamento: `/sdd:new` → grill → prd → design → tasks → implement → verify → archive.
   Cada `/sdd:approve` é do dono e só vale se a mensagem dele for APENAS `/sdd:approve`. Nunca aprove por conta própria; nunca use `--force`.
4. Nunca trabalhe direto na `main`: branch + PR (o repo não tem proteção de branch; a disciplina é nossa).
5. Ações destrutivas, de produção ou irreversíveis (apagar, force push, deploy de produção, mexer na VPS): mostre o que fará e espere o "ok".
   O dono já autorizou execução autônoma dentro de uma tarefa combinada, mas mantenha dry-run, reversão e pare se algo sair diferente do previsto.
6. Plano Claude Pro (cota limitada): fatias pequenas, sem leituras amplas. Não varra `docs/` do upstream (só leia o doc específico quando o assunto pedir).
7. Custo zero: o dono não quer cobrança em nenhum serviço (GitHub sem cartão, Cloudflare R2 com teto de 7 GB de 10 GB, Supabase Free).
8. Um push por fatia; CI barato (e2e só por disparo manual, decisão A-07).

## 4. Armadilhas que já custaram caro
- `deploy.sh` roda de `/opt/crm-deploy` (dono root): mudar no repositório NÃO atualiza a VPS; instale com `install -m755 -o root -g root`.
- A homologação nunca deve anexar a rede `caddy-sites` pelo compose (o apelido `app` roubava tráfego da produção); quem liga é o `publica_hml` do `deploy.sh`.
- `SENTRY_DSN` vazio manda erros ao Sentry da comunidade do upstream; use sempre a DSN do dono ou `off`.
- Scripts gerados por heredoc/`node -e` com barras e aspas se corrompem: use a ferramenta de edição de arquivos.
- No Windows a cópia local tem CRLF; empacote testes com `git archive`. Rode os testes shell no Linux.
- Depois de mudar `.env` na VPS, `docker compose up -d` NÃO recria sozinho: use `--force-recreate` e depois confira o que o container realmente lê.
- O instalador do kit cria as extensões `vector`, `citext` e `pg_trgm` ANTES do baseline; no Supabase Cloud isso precisa ser feito à mão.
- `gh pr merge`, `gh workflow run` e comandos na VPS podem ser bloqueados pelo classificador de permissões do Claude Code: pare e explique ao dono; não contorne.

## 5. Acessos que a sessão precisa
Veja `docs/solucao-crm/migracao-nuvem/inventario-de-acessos.md` (o que, onde está hoje, como entregar sem expor, e o que fazer se faltar).

## 6. Pendências do dono
Voltar o repositório a privado (depois da entrega); rotacionar os tokens do GitHub e do R2 e a senha do banco da homologação (apareceram em conversas);
medir os minutos do GitHub no mês fechado (fim de novembro, `infra/solucao/minutos-github.sh`, precisa `gh auth refresh -s user`);
ensaio de restauração com o CRM inteiro (runbook).
