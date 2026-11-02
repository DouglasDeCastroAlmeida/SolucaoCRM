/**
 * Um dublê em memória do PostgREST para as tabelas da cobrança, no que o trial com
 * cartão usa: `select/update/insert` com `eq`/`is`, `select()` depois do update,
 * `maybeSingle()`. Imita o gatilho `fn_touch_updated_at` (cada escrita muda
 * `updated_at`) — é ele que torna o compare-and-set por versão possível.
 * Chave única só onde a regra do teste a exige (`unicas`).
 */
type Linha = Record<string, unknown>;
type Filtro = { coluna: string; valor: unknown };

export interface BancoFalso {
  cliente: never;
  tabelas: Record<string, Linha[]>;
  /** Quantas escritas (update/insert) cada tabela recebeu. */
  escritas: Record<string, number>;
}

function casaOu(l: Linha, expr: string): boolean {
  return expr.split(",").some((termo) => {
    const m = /^([a-z_]+).(is.null|not.is.null|gt.(.+))$/.exec(termo);
    if (!m) throw new Error(`dublê: filtro .or() não suportado: ${termo}`);
    const v = l[m[1]!];
    if (m[2] === "is.null") return v == null;
    if (m[2] === "not.is.null") return v != null;
    return v != null && Date.parse(String(v)) > Date.parse(m[3]!);
  });
}

export function bancoDeCobrancaFalso(
  tabelas: Record<string, Linha[]>,
  opcoes: { unicas?: Record<string, string[]> } = {},
): BancoFalso {
  let versao = 0;
  const escritas: Record<string, number> = {};
  const casa = (l: Linha, f: Filtro[]) => f.every((x) => (x.valor === null ? l[x.coluna] == null : l[x.coluna] === x.valor));

  const cliente = {
    from(nome: string) {
      tabelas[nome] ??= [];
      const linhas = tabelas[nome];
      const filtros: Filtro[] = [];
      let acao: "select" | "update" | "insert" = "select";
      let valores: Linha = {};
      let devolve = false;
      let teto: number | null = null;
      let ordem: { coluna: string; asc: boolean } | null = null;
      const grupos: string[] = [];
      const q = {
        select() {
          if (acao === "select") acao = "select";
          else devolve = true;
          return q;
        },
        update(v: Linha) {
          acao = "update";
          valores = v;
          return q;
        },
        insert(v: Linha) {
          acao = "insert";
          valores = v;
          return q;
        },
        eq(coluna: string, valor: unknown) {
          filtros.push({ coluna, valor });
          return q;
        },
        is(coluna: string, valor: unknown) {
          filtros.push({ coluna, valor });
          return q;
        },
        /** Vários `.or()` se combinam em E, como no PostgREST. Aceita `col.is.null`, `col.not.is.null` e `col.gt.<valor>`. */
        or(expr: string) {
          grupos.push(expr);
          return q;
        },
        order(coluna: string, o?: { ascending?: boolean }) {
          ordem = { coluna, asc: o?.ascending !== false };
          return q;
        },
        limit(n: number) {
          teto = n;
          return q;
        },
        async executar() {
          if (acao === "select") {
            let r = linhas.filter((l) => casa(l, filtros) && grupos.every((g) => casaOu(l, g)));
            if (ordem) {
              const { coluna, asc } = ordem;
              // nulos primeiro, como o PostgREST faz em ordem descendente
              const chave = (l: Linha) => (l[coluna] == null ? Infinity : Date.parse(String(l[coluna])));
              r = [...r].sort((a, b) => (asc ? chave(a) - chave(b) : chave(b) - chave(a)));
            }
            if (teto !== null) r = r.slice(0, teto);
            return { data: r.map((l) => ({ ...l })), error: null };
          }
          escritas[nome] = (escritas[nome] ?? 0) + 1;
          if (acao === "insert") {
            const chave = opcoes.unicas?.[nome];
            if (chave && linhas.some((l) => chave.every((c) => l[c] === valores[c]))) {
              return { data: null, error: { code: "23505", message: "duplicate key" } };
            }
            linhas.push({ ...valores, updated_at: `v${++versao}` });
            return { data: null, error: null };
          }
          const alvo = linhas.filter((l) => casa(l, filtros));
          for (const l of alvo) Object.assign(l, valores, { updated_at: `v${++versao}` });
          return { data: devolve ? alvo.map((l) => ({ ...l })) : null, error: null };
        },
        async maybeSingle() {
          const r = await q.executar();
          const lista = (r.data ?? []) as Linha[];
          return { data: lista[0] ?? null, error: r.error };
        },
        then(ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) {
          return q.executar().then(ok, ko);
        },
      };
      return q;
    },
  };
  return { cliente: cliente as never, tabelas, escritas };
}
