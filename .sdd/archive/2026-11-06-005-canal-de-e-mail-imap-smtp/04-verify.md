# Verificação: Canal de e-mail (IMAP/SMTP)

> Mudança `005-canal-de-e-mail-imap-smtp` · porte L · 2026-11-06
> Prova de que o que foi pedido foi entregue, e só isso. Evidência, não opinião.

## Evidências

Executadas pelo auditor (`sdd-auditor`) nesta sessão, no checkout local (node_modules antigo, sem `sanitize-html`):
- testes focados do canal (`lib/channels/email`, `tests/unit/email-*`, `i18n-canal-de-email`, `components/connections`) → 32 arquivos passaram, 1 pulado, 4 falharam só na coleta (`html-seguro.test.ts`, `parse.test.ts`, `ignorados.test.ts`, `rodada.test.ts`: `Failed to resolve import "sanitize-html"`, problema do ambiente local; nenhuma falha de asserção)
- `typecheck` → 3 erros, todos em `html-seguro.ts` pelo mesmo `sanitize-html` ausente; nenhum outro
- `lint` → 0 erros, 672 avisos
- `pnpm audit --audit-level=high` → 36 vulnerabilidades (9 high), nenhuma nas dependências novas do e-mail (imapflow, mailparser, nodemailer, sanitize-html)
- cobertura → não configurada no projeto
- suíte completa, invariantes de banco e e2e → NÃO rodados localmente; cobertos pelo CI da main (`verify`, `invariants`), verde na main `e3408877b` e nos PRs #64 a #69
- sonda de produção pós-deploy (06/11/2026, run `42194444619`) → TUDO PASSOU, 9 de 9 itens
- jornada na hml: rodada 1 completa (04/11); rodada 2 parcial (06/11), bloqueio de ambiente

## Rastreabilidade

`sdd trace` ficou INCONCLUSIVO: lista os ACs sem tarefas e mistura testes de outras mudanças, porque os IDs `AC-001.1` etc. se repetem entre mudanças (limitação da ferramenta; `.sdd/bin` também está alterado no working tree por outra causa). Conferência manual por citação de ID nos arquivos do escopo do e-mail: todo AC tem ao menos um arquivo de teste, exceto AC-009.1 (V-6) e AC-009.3 (jornada), provados por evidência em `docs/solucao-crm/evidencias/005-email/` e `evidence/005-email/`. Todas as tarefas T-001 a T-060 estão `[x]`. Amostra por ID, sem leitura de cada corpo de teste.

## Revisão de código

Revisão independente por fatia feita durante a implementação (gate `per-slice`); os achados da revisão dos commits da cascata LGPD foram aplicados (T-059, T-060, PR #67). Dívidas aceitas e registradas em `03-tasks.md`: UID que sempre lança trava o cursor; `avancarCursor` sem guarda no banco; `display_name` igual ao endereço quando o cabeçalho não traz nome.

## Segurança

Lido pelo auditor, não executado: destino seguro contra SSRF (portas fixas, valida todas as respostas do DNS, só IP público, fixa o IP resolvido contra DNS rebinding); `requireSupportWrite` nas rotas mutantes (`testar` também exige admin); senha cifrada e fora de logs (varredura por testes); HTML higienizado; dependências novas pinadas e sem advisory high; cascata LGPD corrigida e coberta por teste unitário e por invariante de banco no CI. Por ser porte L e tocar dados sensíveis e credenciais, recomenda-se rodar também o `/security-review` nativo.

## Desvios de escopo

- Além do PRD, dentro das tarefas: Fatia 7 (lista de ignorados, remover caixa pela tela) e T-059/T-060.
- Aquém do PRD (dívidas conhecidas): botão "Não é cliente" no cabeçalho da conversa (AC-003.4 coberto pela lista de ignorados e pelo caminho com `conversation_id`); texto da tela Configurar sobre o teto de envio.
- AC-009.3 provado só em parte: rodada 2 da jornada na hml incompleta (servidor de e-mail de teste deixou de aceitar a hml); o dono aceitou entregar com a rodada 1 completa e seu teste real com o Gmail (T-046 vale pela palavra dele).

## Specs vivas

`specs/canal-de-email.md` (nova capacidade, 10 requisitos ADICIONADOS).

## Parecer

**APROVADO com ressalvas.** Nenhum achado bloqueante. Ressalvas: suíte completa, e2e e invariantes de banco provados pelo CI e não localmente; `trace` automático inconclusivo; AC-009.3 parcial; dívidas listadas acima. Produção implantada e sonda 9/9.
