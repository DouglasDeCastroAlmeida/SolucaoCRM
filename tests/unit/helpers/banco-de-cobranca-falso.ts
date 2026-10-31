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
        async executar() {
          if (acao === "select") return { data: linhas.filter((l) => casa(l, filtros)).map((l) => ({ ...l })), error: null };
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
