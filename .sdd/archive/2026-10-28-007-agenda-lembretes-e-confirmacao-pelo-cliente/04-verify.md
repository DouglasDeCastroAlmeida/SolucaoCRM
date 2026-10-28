# Verificação: Agenda: lembretes padrão e confirmação pelo cliente

> Mudança `007-agenda-lembretes-e-confirmacao-pelo-cliente` · porte M · 2026-10-27
> Prova de que o que foi pedido foi entregue, e só isso. Evidência, não opinião.

## Evidências

Este PC tem 6 GB de RAM; typecheck, lint, suíte e `test:db` rodam no CI, que é o juiz.

- `gh pr checks 18` (PR mesclado) → verify (partes 1 a 4), build-and-size, invariants, invariants-majors (17), invariants-alcance e imagens-ok **passaram**. É a prova do baseline em instalação nova e em atualização (T-004).
- `npx vitest run lib/agenda/aplicar-confirmacao-do-cliente.test.ts` → 17 passed; `lib/agenda/limpar-pedido-de-remarcar.test.ts` → 3 passed (auditor).
- Deploy em produção autorizado por escrito → sonda verde (`agenda-tipos-inalterados`, `/` = 200, `/app` = 307).
- Jornada com WhatsApp real **em produção** (não em homologação), 2026-10-27, organização "Minha Empresa": `evidence/007-agenda/jornada-em-producao-2026-10-27.md` e J50 em `docs/testing/user-journey-map.md`. Registros de teste apagados ao fim.
- **Não verificado por mim:** o baseline aplicado num banco e o isolamento RLS entre duas organizações — só o resultado do CI.

## Rastreabilidade

`sdd trace` marca os 30 critérios com ✅, mas a matriz é ruidosa: casa por palavra e lista testes de outras mudanças (`marcas-*`, `tests/infra/*.sh`, `.restauracao/*`). O auditor conferiu pelos IDs nos testes os critérios de REQ-002 e REQ-003 (`AC-002.1`, `AC-002.7`...). Para REQ-001, REQ-004 e REQ-006 a base é o CI verde e arquivos específicos: `lembrete-padrao.test.ts`, `SeloDaConfirmacaoDoCliente.test.tsx`, `textos-da-confirmacao-i18n.test.ts`, `agenda-confirmacao-cliente-rotas-e-auditoria.test.ts`, `tests/invariants/agenda-*`. Os ✅ do `trace` não provam cobertura sozinhos.

## Revisão de código

Revisão por fatia feita nas Fatias 1 a 6. O auditor leu `lib/agenda/aplicar-confirmacao-do-cliente.ts`: filtra `organization_id` e `contact_id` em toda leitura e UPDATE (vindos da conversa ingerida, nunca do corpo); UPDATE condicional dá a idempotência; só altera os campos próprios, nunca `status` nem a confirmação da equipe; nunca lança, e falha no envio da resposta não desfaz a gravação.

## Segurança

- LGPD: `contacts.is_anonymized` é lido antes de criar o aviso na Central.
- Auditoria sem o texto do cliente (`agenda.client_confirmed`, `agenda.client_requested_reschedule`).
- Rota nova `tipos/lembretes-padrao`: `requireSupportWrite` antes do efeito, Zod e `audit`.
- Chave `AGENDA_CONFIRMACAO_CLIENTE` em `lib/env.ts` e `.env.example`; ausente liga, desligada não apaga dado.
- Migration 0719: tem `-- manifest:`, é aditiva e idempotente, sem função nova (nada a revogar); apêndice no baseline antes da varredura anon; o CHECK de `agent_inbox_items_kind` foi recriado com o kind novo.

## Desvios de escopo

- Nada além do "Fora de escopo" do PRD (sem IA, sem remarcar ou cancelar automático, sem e-mail ou SMS, sem Google Agenda).
- **Aquém da spec (declarado):**
  1. **AC-006.2 parcial.** A jornada foi em produção, não em homologação. As partes 1 e 2 do roteiro (criar tipo pela tela) **não foram executadas**: o tipo foi criado pelo banco. Não está provado pela tela o texto padrão nos três idiomas (AC-001.1) nem o botão "Ativar lembretes padrão" (AC-001.3).
  2. As respostas automáticas ("Obrigado pela confirmação..." e "Entendido...") foram criadas e **barradas pelo modo de teste do canal** (`pre_go_live`). **Não está provado que chegam ao celular.**
  3. O selo no "cartão do contato" do PRD **não foi implementado como previsto**.
  4. **Texto do AC-003.3 / AC-002.6:** o critério diz que repetir "2" não gera aviso novo; a regra implementada leva cada resposta ao horário mais próximo ainda não tratado, e só com todos tratados a repetição é inerte. Foi observado em produção; o texto do critério e o roteiro devem ser lidos assim.
  5. Duplicação pequena em `montarAgradecimento` e `diaEHora` (formatação de data e hora); só qualidade.

## Specs vivas

`specs/agenda-confirmacao-do-cliente.md` desta mudança descreve o comportamento entregue.

## Parecer

**APROVADO COM RESSALVAS.** O código, a migration e os testes conferem com a spec, o CI do PR #18 passou inteiro, a produção está estável e a jornada com WhatsApp real confirmou "1", "2", remarcação e chave desligada. Nenhum achado bloqueante. Ficam declaradas como **não provadas**: a criação do tipo pela tela, a entrega das respostas automáticas ao cliente e o cartão do contato.
