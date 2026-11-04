/**
 * Banco em memória para os testes do canal de e-mail (mudança 005).
 *
 * Imita só o que `lib/channels/email/*` usa do client do Supabase: `from().select/insert/
 * update/upsert/delete` com `eq/neq/is/in/lt/order/limit/maybeSingle/single`, `rpc` e
 * `storage`. Honra as UNIQUE declaradas (devolve `23505`, como o Postgres), gera `id`,
 * `created_at` e a coluna gerada `contacts.email_normalized`.
 *
 * Não é um motor SQL: filtro que o código passe a usar e que não esteja aqui LANÇA, em vez
 * de ser ignorado em silêncio (o defeito que um dublê frouxo esconde).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Linha = Record<string, unknown>;
type Filtro = { tipo: "eq" | "neq" | "is" | "in" | "lt" | "gt"; coluna: string; valor: unknown };

export const UNICOS_PADRAO: Record<string, string[][]> = {
  messages: [["organization_id", "external_id"]],
  contacts: [["organization_id", "email_normalized"]],
  email_ignorados: [["organization_id", "channel_session_id", "message_id"]],
  email_remetentes_ignorados: [["organization_id", "endereco_normalizado"]],
  email_sync_estado: [["channel_session_id"]],
  conversations: [["organization_id", "contact_id", "channel_session_id"]],
  email_envios_dia: [["channel_session_id", "dia"]],
};

export interface BancoFalso {
  client: SupabaseClient;
  tabelas: Record<string, Linha[]>;
  chamadasRpc: Array<{ nome: string; args: Record<string, unknown> }>;
  uploads: Array<{ bucket: string; caminho: string; tamanho: number }>;
  /** Força uma falha na próxima operação em `tabela` (`insert`, `update`, `select`...). */
  falharEm(tabela: string, op: string, erro: { code?: string; message: string }): void;
}

export function criarBancoFalso(
  inicial: Record<string, Linha[]> = {},
  opcoes: { unicos?: Record<string, string[][]> } = {},
): BancoFalso {
  const unicos = opcoes.unicos ?? UNICOS_PADRAO;
  const tabelas: Record<string, Linha[]> = {};
  for (const [nome, linhas] of Object.entries(inicial)) {
    tabelas[nome] = linhas.map((l) => ({
      ...l,
      ...(nome === "contacts" && typeof l.email === "string" ? { email_normalized: l.email.trim().toLowerCase() } : {}),
    }));
  }
  const chamadasRpc: BancoFalso["chamadasRpc"] = [];
  const uploads: BancoFalso["uploads"] = [];
  const falhas = new Map<string, { code?: string; message: string }>();
  let contador = 0;
  const novoId = () => `00000000-0000-4000-8000-${String(++contador).padStart(12, "0")}`;
  const t = (nome: string) => (tabelas[nome] ??= []);

  const completar = (tabela: string, l: Linha): Linha => {
    const r: Linha = { id: tabela === "email_sync_estado" ? undefined : novoId(), created_at: new Date().toISOString(), ...l };
    if (r.id === undefined) delete r.id;
    if (tabela === "contacts" && typeof r.email === "string") r.email_normalized = r.email.trim().toLowerCase();
    return r;
  };

  const viola = (tabela: string, nova: Linha, ignorar?: Linha): boolean =>
    (unicos[tabela] ?? []).some((cols) =>
      t(tabela).some(
        (existente) =>
          existente !== ignorar &&
          cols.every((c) => nova[c] !== undefined && nova[c] !== null && existente[c] === nova[c]),
      ),
    );

  const casa = (l: Linha, filtros: Filtro[]): boolean =>
    filtros.every((f) => {
      const v = l[f.coluna];
      switch (f.tipo) {
        case "eq":
          return v === f.valor;
        case "neq":
          return v !== f.valor;
        case "is":
          return f.valor === null ? v === null || v === undefined : v === f.valor;
        case "in":
          return (f.valor as unknown[]).includes(v);
        case "lt":
          return v !== null && v !== undefined && (v as string | number) < (f.valor as string | number);
        case "gt":
          return v !== null && v !== undefined && (v as string | number) > (f.valor as string | number);
      }
    });

  function construtor(tabela: string) {
    let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    let payload: Linha | Linha[] = {};
    let onConflict: string | undefined;
    let pediuRetorno = false;
    const filtros: Filtro[] = [];
    let ordem: { coluna: string; asc: boolean } | null = null;
    let limite: number | null = null;
    let modo: "lista" | "maybe" | "single" = "lista";

    const executar = (): { data: unknown; error: { code?: string; message: string } | null } => {
      const falha = falhas.get(`${tabela}:${op}`);
      if (falha) {
        falhas.delete(`${tabela}:${op}`);
        return { data: null, error: falha };
      }
      let afetadas: Linha[] = [];
      if (op === "insert" || op === "upsert") {
        const novas = (Array.isArray(payload) ? payload : [payload]).map((l) => completar(tabela, l));
        for (const nova of novas) {
          if (op === "upsert") {
            const chave = (onConflict ?? "id").split(",").map((c) => c.trim());
            const igual = t(tabela).find((e) => chave.every((c) => e[c] === nova[c]));
            if (igual) {
              Object.assign(igual, nova, { id: igual.id ?? nova.id });
              afetadas.push(igual);
              continue;
            }
          }
          if (viola(tabela, nova)) return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint on ${tabela}` } };
          t(tabela).push(nova);
          afetadas.push(nova);
        }
      } else if (op === "update") {
        afetadas = t(tabela).filter((l) => casa(l, filtros));
        for (const l of afetadas) Object.assign(l, payload);
      } else if (op === "delete") {
        afetadas = t(tabela).filter((l) => casa(l, filtros));
        tabelas[tabela] = t(tabela).filter((l) => !afetadas.includes(l));
      } else {
        afetadas = t(tabela).filter((l) => casa(l, filtros));
        if (ordem) {
          const o = ordem;
          afetadas = [...afetadas].sort((a, b) => {
            const x = a[o.coluna] as string | number;
            const y = b[o.coluna] as string | number;
            return (x < y ? -1 : x > y ? 1 : 0) * (o.asc ? 1 : -1);
          });
        }
        if (limite !== null) afetadas = afetadas.slice(0, limite);
      }
      if (op !== "select" && !pediuRetorno) return { data: null, error: null };
      const copia = afetadas.map((l) => ({ ...l }));
      if (modo === "lista") return { data: copia, error: null };
      if (copia.length > 1 && modo === "single") return { data: null, error: { code: "PGRST116", message: "mais de uma linha" } };
      if (copia.length > 1 && modo === "maybe") return { data: null, error: { code: "PGRST116", message: "mais de uma linha" } };
      if (copia.length === 0) return modo === "single" ? { data: null, error: { code: "PGRST116", message: "nenhuma linha" } } : { data: null, error: null };
      return { data: copia[0], error: null };
    };

    const api: Record<string, unknown> = {
      select() {
        if (op !== "select") pediuRetorno = true;
        return api;
      },
      insert(l: Linha | Linha[]) {
        op = "insert";
        payload = l;
        return api;
      },
      upsert(l: Linha | Linha[], o?: { onConflict?: string }) {
        op = "upsert";
        payload = l;
        onConflict = o?.onConflict;
        return api;
      },
      update(l: Linha) {
        op = "update";
        payload = l;
        return api;
      },
      delete() {
        op = "delete";
        return api;
      },
      eq: (coluna: string, valor: unknown) => (filtros.push({ tipo: "eq", coluna, valor }), api),
      neq: (coluna: string, valor: unknown) => (filtros.push({ tipo: "neq", coluna, valor }), api),
      is: (coluna: string, valor: unknown) => (filtros.push({ tipo: "is", coluna, valor }), api),
      in: (coluna: string, valor: unknown[]) => (filtros.push({ tipo: "in", coluna, valor }), api),
      lt: (coluna: string, valor: unknown) => (filtros.push({ tipo: "lt", coluna, valor }), api),
      gt: (coluna: string, valor: unknown) => (filtros.push({ tipo: "gt", coluna, valor }), api),
      order: (coluna: string, o?: { ascending?: boolean }) => ((ordem = { coluna, asc: o?.ascending !== false }), api),
      limit: (n: number) => ((limite = n), api),
      maybeSingle: () => ((modo = "maybe"), api),
      single: () => ((modo = "single"), api),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(executar()).then(ok, ko),
    };
    return api;
  }

  const rpcs: Record<string, (args: Record<string, unknown>) => { data: unknown; error: null }> = {
    fn_upsert_email_conversation: (a) => {
      const existente = t("conversations").find(
        (c) => c.organization_id === a.p_org && c.contact_id === a.p_contact && c.channel_session_id === a.p_session,
      );
      if (existente) return { data: existente.id, error: null };
      const nova = completar("conversations", {
        organization_id: a.p_org,
        contact_id: a.p_contact,
        channel_session_id: a.p_session,
        channel: "email",
      });
      t("conversations").push(nova);
      return { data: nova.id, error: null };
    },
    fn_mark_conversation_message: () => ({ data: null, error: null }),
  };

  const client = {
    from: (tabela: string) => construtor(tabela),
    rpc: (nome: string, args: Record<string, unknown>) => {
      chamadasRpc.push({ nome, args });
      const h = rpcs[nome];
      return Promise.resolve(h ? h(args) : { data: null, error: null });
    },
    storage: {
      from: (bucket: string) => ({
        upload: (caminho: string, corpo: Buffer) => {
          uploads.push({ bucket, caminho, tamanho: corpo.length });
          return Promise.resolve({ data: { path: caminho }, error: null });
        },
      }),
    },
  } as unknown as SupabaseClient;

  return {
    client,
    tabelas,
    chamadasRpc,
    uploads,
    falharEm: (tabela, op, erro) => void falhas.set(`${tabela}:${op}`, erro),
  };
}
