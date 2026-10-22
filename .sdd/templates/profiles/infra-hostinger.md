# Perfil: Infra Docker em VPS Hostinger

> **Quando usar:** aplicação publicada com Docker Compose numa VPS (Hostinger KVM ou equivalente), com HTTPS e deploy por GitHub Actions.

Se o projeto já tem pipeline, orquestrador ou proxy próprios, **o que existe prevalece**: aplique deste perfil só o que não conflita e registre a divergência como decisão (D-xx) no Grill.

## Containers

- `Dockerfile` **multi-stage**: build separado do runtime; imagem final mínima.
- Processo roda com **usuário não-root**.
- `HEALTHCHECK` em todo serviço exposto; o Compose usa `depends_on` com `condition: service_healthy`.
- Imagens com **tag imutável** (versão ou SHA do commit), nunca só `latest` em produção.
- Volumes nomeados para dados persistentes; nada de estado dentro do container.

## Rede e HTTPS

- **Caddy** como proxy reverso com TLS automático (Let's Encrypt).
- Só 80/443 expostos publicamente; banco, Redis e serviços internos apenas na rede do Compose.
- Algumas VPS da Hostinger já vêm com proxy (Traefik) ocupando 80/443: detecte antes e publique atrás dele em vez de subir outro proxy.

## Segredos e configuração

- `.env` só no servidor, com permissão restrita; nunca no git nem na imagem.
- Segredos do pipeline em GitHub Secrets.
- `.env.example` versionado, sem valores reais.

## Deploy e rollback

- GitHub Actions: testes → build → push da imagem → deploy por SSH com script idempotente.
- **Rollback em menos de 2 minutos**: voltar a tag anterior no `.env`/Compose e `docker compose up -d`. O script de deploy guarda a tag anterior.
- Migrações compatíveis com a versão anterior da aplicação (ver perfil api-node), para o rollback não quebrar o banco.
- Backup automático do banco antes de cada deploy, com restauração testada.

## Observabilidade

- Logs dos containers com rotação (`max-size`, `max-file`).
- Healthcheck externo simples (uptime) no domínio público.

## Testes

| Tarefa | O que verifica |
| :-- | :-- |
| `CHECK-SMOKE` | Sobe o Compose localmente (ou em CI), espera os healthchecks e chama a rota de saúde e uma rota crítica |
| Revisão do deploy | Script de deploy e rollback executados em ambiente de teste antes da primeira produção |

## Ferramentas no Claude Code

- Para mudanças de porte L de infraestrutura, peça revisão humana do diff de `Dockerfile`, Compose e workflow antes do `/sdd:approve`.
- Nunca execute comandos no servidor de produção a partir do agente sem confirmação explícita do usuário.

## Definition of Done adicional

- Imagem builda em CI e passa no smoke test.
- Rollback documentado e testado para a mudança.
- Nenhum segredo novo fora do `.env`/GitHub Secrets.
