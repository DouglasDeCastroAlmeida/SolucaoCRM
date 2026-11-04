import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * CANAL DE E-MAIL x LGPD (mudança SDD 005, pendência do ADR-008; migration 0728).
 *
 * Anonimizar o contato (`fn_lgpd_cascade_redact_contact`) precisa alcançar o que o canal de
 * e-mail guarda SEM `contact_id`: `email_ignorados` (cabeçalho do que não virou conversa) e
 * `email_remetentes_ignorados` ("não é cliente"), e TODOS os anexos das mensagens de e-mail
 * (não só o primeiro, que tem ponteiro em `media_storage_path`).
 *
 * - AC-009.2: o efeito no banco, e o isolamento: a outra organização, com o MESMO endereço,
 *   não é tocada; rodar de novo é no-op.
 *
 * Namespace de ids `e5a50728-`: os arquivos rodam em paralelo no mesmo banco.
 */

const ORG_A = "e5a50728-0000-4000-8000-0000000000a1";
const ORG_B = "e5a50728-0000-4000-8000-0000000000a2";
const SESS_A = "e5a50728-2222-4000-8000-0000000000a1";
const SESS_B = "e5a50728-2222-4000-8000-0000000000a2";
const ALVO = "e5a50728-3333-4000-8000-0000000000a1";
const OUTRO_DA_A = "e5a50728-3333-4000-8000-0000000000a3";
const CONTATO_B = "e5a50728-3333-4000-8000-0000000000a2";
const CONVERSA_A = "e5a50728-4444-4000-8000-0000000000a1";
const CONVERSA_B = "e5a50728-4444-4000-8000-0000000000a2";
const MSG_A = "e5a50728-5555-4000-8000-0000000000a1";
const MSG_B = "e5a50728-5555-4000-8000-0000000000a2";
const PEDIDO = "e5a50728-6666-4000-8000-0000000000a1";

const ENDERECO = "titular-0728@exemplo.test";
const OUTRO_ENDERECO = "outra-pessoa-0728@exemplo.test";

const ANEXO_1 = `${ORG_A}/${CONVERSA_A}/${MSG_A}-0.pdf`;
const ANEXO_2 = `${ORG_A}/${CONVERSA_A}/${MSG_A}-1.png`;
const ANEXO_3 = `${ORG_A}/${CONVERSA_A}/${MSG_A}-2.png`;
/** Caminho de outra organização dentro do metadata da A: o expurgo nunca o alcança. */
const ANEXO_ALHEIO = `${ORG_B}/${CONVERSA_B}/${MSG_B}-0.pdf`;
const ANEXO_DA_B = `${ORG_B}/${CONVERSA_B}/${MSG_B}-1.pdf`;

function valor(consulta: string): string {
  return (sql(consulta).trim().split("\n").at(-1) ?? "").trim();
}

function naFila(caminho: string): number {
  return Number(valor(`select count(*) from public.storage_redaction_queue where object_path = '${caminho}';`));
}

function linhas(tabela: string, org: string, filtro: string): number {
  return Number(valor(`select count(*) from public.${tabela} where organization_id = '${org}' and ${filtro};`));
}

let retorno: string;

beforeAll(() => {
  sql(`
    insert into storage.buckets (id, name) values ('whatsapp-media', 'whatsapp-media')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name, settings) values
      ('${ORG_A}', 'email-0728-a', 'Org A', 'Org A', '{}'::jsonb),
      ('${ORG_B}', 'email-0728-b', 'Org B', 'Org B', '{}'::jsonb)
    on conflict (id) do nothing;

    insert into public.channel_sessions (id, organization_id, provider, email_address, status, webhook_secret_encrypted)
    values
      ('${SESS_A}', '${ORG_A}', 'email', 'caixa-0728-a@exemplo.test', 'WORKING', '\\x00'::bytea),
      ('${SESS_B}', '${ORG_B}', 'email', 'caixa-0728-b@exemplo.test', 'WORKING', '\\x00'::bytea)
    on conflict (id) do nothing;

    insert into public.contacts (id, organization_id, name, display_name, email) values
      ('${ALVO}', '${ORG_A}', 'Titular', 'Titular', '${ENDERECO}'),
      ('${OUTRO_DA_A}', '${ORG_A}', 'Outro', 'Outro', '${OUTRO_ENDERECO}'),
      ('${CONTATO_B}', '${ORG_B}', 'Titular em B', 'Titular em B', '${ENDERECO}')
    on conflict (id) do nothing;

    insert into public.conversations (id, organization_id, contact_id, channel_session_id, channel, status, is_group) values
      ('${CONVERSA_A}', '${ORG_A}', '${ALVO}', '${SESS_A}', 'email', 'open', false),
      ('${CONVERSA_B}', '${ORG_B}', '${CONTATO_B}', '${SESS_B}', 'email', 'open', false)
    on conflict (id) do nothing;

    insert into public.messages (id, organization_id, conversation_id, contact_id, channel_session_id,
                                 direction, sent_via, status, type, body, media_storage_path, metadata)
    values
      ('${MSG_A}', '${ORG_A}', '${CONVERSA_A}', '${ALVO}', '${SESS_A}', 'inbound', 'external_device', 'received', 'text',
       'Segue o contrato', '${ANEXO_1}',
       jsonb_build_object('email', jsonb_build_object('anexos', jsonb_build_array(
         jsonb_build_object('nome', 'contrato.pdf', 'caminho', '${ANEXO_1}'),
         jsonb_build_object('nome', 'rg.png', 'caminho', '${ANEXO_2}'),
         jsonb_build_object('nome', 'cpf.png', 'caminho', '${ANEXO_3}'),
         jsonb_build_object('nome', 'grande.zip', 'caminho', null),
         jsonb_build_object('nome', 'alheio.pdf', 'caminho', '${ANEXO_ALHEIO}')))),
       ),
      ('${MSG_B}', '${ORG_B}', '${CONVERSA_B}', '${CONTATO_B}', '${SESS_B}', 'inbound', 'external_device', 'received', 'text',
       'Da outra organizacao', '${ANEXO_DA_B}',
       jsonb_build_object('email', jsonb_build_object('anexos', jsonb_build_array(
         jsonb_build_object('nome', 'b.pdf', 'caminho', '${ANEXO_DA_B}'))))
      )
    on conflict (id) do nothing;

    insert into public.email_ignorados (organization_id, channel_session_id, message_id, uid, remetente, assunto, recebido_em, motivo) values
      ('${ORG_A}', '${SESS_A}', '<t1-0728@x>', 1, '${ENDERECO}', 'Assunto do titular', now(), 'lista_de_inscricao'),
      ('${ORG_A}', '${SESS_A}', '<t2-0728@x>', 2, '${ENDERECO}', 'Outro assunto', now(), 'lista_de_inscricao'),
      ('${ORG_A}', '${SESS_A}', '<o-0728@x>', 3, '${OUTRO_ENDERECO}', 'De outra pessoa', now(), 'lista_de_inscricao'),
      ('${ORG_B}', '${SESS_B}', '<b-0728@x>', 1, '${ENDERECO}', 'Mesmo endereco em B', now(), 'lista_de_inscricao')
    on conflict do nothing;

    insert into public.email_remetentes_ignorados (organization_id, endereco_normalizado) values
      ('${ORG_A}', '${ENDERECO}'),
      ('${ORG_A}', '${OUTRO_ENDERECO}'),
      ('${ORG_B}', '${ENDERECO}')
    on conflict do nothing;

    insert into public.lgpd_requests (id, organization_id, request_type, source, scope, due_at)
    values ('${PEDIDO}', '${ORG_A}', 'redact', 'manual', 'contact', now() + interval '15 days')
    on conflict (id) do nothing;
  `);

  retorno = valor(`select public.fn_lgpd_cascade_redact_contact('${ORG_A}', '${ALVO}', '${PEDIDO}')::text;`);
});

describe("AC-009.2: anonimizar o contato alcança o canal de e-mail", () => {
  it("AC-009.2: a cascata rodou e o contato foi anonimizado (controle de vacuidade)", () => {
    expect(retorno).toContain('"already_anonymized": false');
    expect(valor(`select is_anonymized::text from public.contacts where id = '${ALVO}';`)).toBe("true");
  });

  it("AC-009.2: os e-mails ignorados do endereço do titular somem; os de outra pessoa ficam", () => {
    expect(linhas("email_ignorados", ORG_A, `remetente = '${ENDERECO}'`)).toBe(0);
    expect(linhas("email_ignorados", ORG_A, `remetente = '${OUTRO_ENDERECO}'`)).toBe(1);
  });

  it("AC-009.2: o 'não é cliente' do endereço do titular some; o de outra pessoa fica", () => {
    expect(linhas("email_remetentes_ignorados", ORG_A, `endereco_normalizado = '${ENDERECO}'`)).toBe(0);
    expect(linhas("email_remetentes_ignorados", ORG_A, `endereco_normalizado = '${OUTRO_ENDERECO}'`)).toBe(1);
  });

  it("AC-009.2: a outra organização, com o MESMO endereço, não é tocada", () => {
    expect(linhas("email_ignorados", ORG_B, `remetente = '${ENDERECO}'`)).toBe(1);
    expect(linhas("email_remetentes_ignorados", ORG_B, `endereco_normalizado = '${ENDERECO}'`)).toBe(1);
    expect(valor(`select is_anonymized::text from public.contacts where id = '${CONTATO_B}';`)).toBe("false");
    expect(valor(`select body from public.messages where id = '${MSG_B}';`)).toBe("Da outra organizacao");
  });

  it("AC-009.2: as contagens saem no retorno da cascata", () => {
    expect(retorno).toMatch(/"email_ignorados": 2/);
    expect(retorno).toMatch(/"email_remetentes_ignorados": 1/);
  });

  it("AC-009.2: TODOS os anexos do e-mail vão para a fila de remoção (não só o primeiro)", () => {
    expect(naFila(ANEXO_1)).toBe(1);
    expect(naFila(ANEXO_2)).toBe(1);
    expect(naFila(ANEXO_3)).toBe(1);
  });

  it("AC-009.2: caminho de outra organização dentro do metadata nunca entra na fila, nem o anexo da B", () => {
    expect(naFila(ANEXO_ALHEIO)).toBe(0);
    expect(naFila(ANEXO_DA_B)).toBe(0);
  });

  it("AC-009.2: o metadata e o corpo da mensagem foram redigidos", () => {
    expect(valor(`select metadata::text from public.messages where id = '${MSG_A}';`)).toBe("{}");
    expect(valor(`select body from public.messages where id = '${MSG_A}';`)).toBe("[mensagem anonimizada]");
  });

  it("AC-009.2: rodar de novo é no-op e não mexe na outra organização", () => {
    const de_novo = valor(`select public.fn_lgpd_cascade_redact_contact('${ORG_A}', '${ALVO}', '${PEDIDO}')::text;`);
    expect(de_novo).toContain('"already_anonymized": true');
    expect(linhas("email_ignorados", ORG_B, `remetente = '${ENDERECO}'`)).toBe(1);
  });
});
