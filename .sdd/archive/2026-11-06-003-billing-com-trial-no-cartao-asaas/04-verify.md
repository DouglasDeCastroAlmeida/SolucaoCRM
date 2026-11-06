# Verificação: Billing com trial no cartão (Asaas)

> Mudança `003-billing-com-trial-no-cartao-asaas` · porte L · 2026-11-06
> Prova de que o que foi pedido foi entregue, e só isso. Evidência, não opinião.

## Evidências

Executadas pelo auditor (`sdd-auditor`) nesta sessão, na main `5079dd896`:
- testes focados da cobrança (`lib/cobranca`, `lib/billing-trial`, `app/cobranca`, webhook e rotas de cobrança, invariantes `*billing-trial*` e `*cobranca*`, `signUp.marca-cobra`) → 64 arquivos, 1000 testes passaram, 0 falhas
- `typecheck` → 3 erros, todos em `lib/channels/email/html-seguro.ts` (`sanitize-html` ausente na junction local, mudança 005); nenhum em código da cobrança
- `lint` → 1 erro e 681 avisos; o erro é um backup antigo em `.restauracao/` (não é desta mudança), os avisos são antigos em `tests/` e `scripts/`
- suíte completa (`|cercas|`) → falhou em cerca de 18 arquivos de infraestrutura (guardas de release, git/gh/bash, números de migration, e2e); nenhum é de cobrança. Três reexecutados com timeout maior passaram (13/13); um falha por separador de caminho do Windows; os demais não foram reexecutados, então ficam INCONCLUSIVOS localmente. O CI da main está verde nos PRs desta etapa.
- `pnpm audit --audit-level=high` (rodado por mim, com pnpm de verdade, depois do auditor) → 36 vulnerabilidades (4 low, 23 moderate, 9 high), as mesmas 36 da verificação da 005; o auditor não conferiu uma a uma se alguma está em dependência da cobrança, e esta mudança não adicionou dependência
- e2e e RLS entre duas marcas contra banco real → NÃO verificados localmente (dependem de servidor e Supabase)
- cobertura → não configurada no projeto
- jornada na hml (06/11/2026): conta nova pela tela, pagamento no Checkout do sandbox, `conferir-pagamento-hml.mjs` A1 a A4 e B1 a B4 PASSOU, uma só assinatura, reativada pela conciliação horária
- produção (06/11/2026): sonda `sonda-producao-cobranca.mjs` P1 a P3 PASSOU; marcas ligadas 0, suspensas por cobrança 0, trials com cartão 0, organizações 1

## Rastreabilidade

`sdd trace` marca todos os AC-001.x a AC-010.x como ✅, mas mistura testes de outras mudanças porque os IDs se repetem; o auditor NÃO a aceitou como prova. Conferência manual por citação de ID dentro do escopo da cobrança: todo AC tem teste ou evidência nomeada. Sem teste automatizado, por natureza: AC-010.1 (prova no sandbox) e AC-010.3 (jornada pela tela), provados por `docs/solucao-crm/evidencias/003-billing/README.md`, `jornada-hml.md`, `sonda-sandbox.json` e `evidence/003-billing/`. Cobertura única (um arquivo só): AC-001.3, AC-001.5. AC-002.1 é coberto por invariante estático, não por execução contra banco real. AC-005.6 PARCIAL e AC-003.5 parcial, por decisão do dono (ver Desvios). Todas as 45 tarefas estão `[x]`.

## Revisão de código

Revisão independente por fatia feita durante a implementação (gate `per-slice`). O auditor não achou defeito bloqueante no escopo da cobrança.

## Segurança

Lido pelo auditor, coberto por teste, não executado contra ambiente real: webhook do Asaas com token em tempo constante, token nunca gravado, só o ponteiro do evento gravado, limite de corpo, rate limit e idempotência por `webhook_events_log`, estado decidido pela releitura na API; chave do Asaas só no cabeçalho, nunca na URL, o prefixo da chave escolhe a base (chave de produção nunca vai ao sandbox); rotas de cobrança com `requireRole("admin")` e `requireSupportWrite()`, organização vinda da sessão; volta do Checkout com selo HMAC em tempo constante e limite de 6 por minuto; nenhuma chamada direta a `fetch` fora do adaptador, base restrita a lista (sem SSRF); CPF/CNPJ guardado só como HMAC-SHA256 em tabela sem acesso de cliente (RLS e revoke); o número do cartão nunca passa pelo servidor.

Achado de segurança, baixo: `linkSeguro` (`lib/cobranca/provedores/asaas.ts:282`) valida só o esquema https do link do Checkout, não o host; hoje quem limita o destino é a CSP `form-action`. Sugestão: checar o host contra `ASAAS_ORIGENS_DO_CHECKOUT` no adaptador.

Por ser porte L, com pagamento e dados pessoais, recomenda-se rodar também o `/security-review` nativo.

## Desvios de escopo

- Nada fora do "Fora de escopo" foi encontrado (sem reembolso por API, sem split, Stripe intacto).
- Aceitos e documentados: AC-005.6 PARCIAL (decisão do dono, só avisa na Central após 90 dias, sem exclusão automática); exceção ao AC-010.1 em 30/10, depois provada em 31/10 e de novo em 06/11; reembolso feito manualmente no painel do Asaas.
- Aquém do pedido, dependem do dono: AC-003.5 (para quem recebe `trial_ja_usado` a mensagem só informa, não oferece "assinar já"); o cancelamento comum dentro dos 7 dias esconde o botão de reembolso.
- Resíduos: a conta `trial_com_cartao` abandonada sem cartão nunca expira (fail-safe, sem acesso); o CPF/CNPJ digitado no Checkout do Asaas pode diferir do reservado na nossa tela (conferência na volta ficou como pendência); pagar num navegador sem retorno ao site deixa a reativação para a conciliação horária (tratado na mudança 011); ligar a cobrança numa marca em produção depende do CNPJ e do roteiro `docs/runbooks/cobranca-ligar-marca.md`.

## Specs vivas

`specs/cobranca-com-trial-no-cartao.md` (nova capacidade, 10 requisitos ADICIONADOS).

## Parecer

**APROVADO com ressalvas.** Nenhum achado bloqueante no escopo da cobrança. Ressalvas: suíte completa de cercas, e2e e RLS entre duas marcas provados pelo CI e não localmente; `sdd trace` automático inconclusivo; AC-003.5 e AC-005.6 parciais por decisão do dono; um achado baixo de segurança (host do link do Checkout) e os resíduos listados acima. Produção implantada com todas as marcas desligadas e sonda passando.
