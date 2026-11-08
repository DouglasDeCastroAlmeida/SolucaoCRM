/**
 * Alvo da jornada de capturas do visual de mensageiro (issue #103).
 *
 * A jornada pode rodar de dois jeitos: no banco local semeado (padrão, como sempre) ou contra a
 * HOMOLOGAÇÃO (`VISUAL_ALVO=hml`). Este módulo é a parte sem Playwright dessa escolha, para que a recusa
 * de qualquer outro host e a ausência de segredo em saída sejam provadas por teste de unidade:
 *
 *  - `resolverAlvo` aborta antes de abrir qualquer página se o alvo não for exatamente a homologação;
 *  - `navegacaoPermitida` serve de cerca durante a execução (nenhuma navegação sai do host);
 *  - `lerCredenciaisHml` lê e-mail e senha do ambiente ou do arquivo local de segredos do dono;
 *  - `redigir` e `montarIndice` garantem que nenhum desses valores chegue a log, relatório ou arquivo.
 */

export const HOST_DA_HOMOLOGACAO = "hml.corretora.io";
export const URL_DA_HOMOLOGACAO = `https://${HOST_DA_HOMOLOGACAO}`;

export type Alvo = { modo: "local" } | { modo: "hml"; baseURL: string };
type Ambiente = Record<string, string | undefined>;

function ehExatamenteAHomologacao(texto: string): boolean {
  let u: URL;
  try {
    u = new URL(texto);
  } catch {
    return false;
  }
  return (
    u.protocol === "https:" &&
    u.hostname === HOST_DA_HOMOLOGACAO &&
    u.port === "" &&
    u.username === "" &&
    u.password === "" &&
    u.pathname === "/" &&
    u.search === "" &&
    u.hash === ""
  );
}

/** Decide o modo da jornada. Qualquer coisa que não seja "vazio" ou exatamente "hml" é recusada. */
export function resolverAlvo(env: Ambiente): Alvo {
  const alvo = env.VISUAL_ALVO ?? "";
  if (alvo === "") return { modo: "local" };
  if (alvo !== "hml") {
    throw new Error(`Jornada recusada: VISUAL_ALVO só aceita "hml" (ou vazio, para o modo local).`);
  }
  for (const chave of ["VISUAL_BASE_URL", "PLAYWRIGHT_BASE_URL"] as const) {
    const base = env[chave];
    if (base !== undefined && base !== "" && !ehExatamenteAHomologacao(base)) {
      throw new Error(`Jornada recusada: ${chave} não é exatamente ${URL_DA_HOMOLOGACAO}. Nunca outro host.`);
    }
  }
  return { modo: "hml", baseURL: URL_DA_HOMOLOGACAO };
}

/** Cerca de execução: só se navega para https no host exato da homologação. */
export function navegacaoPermitida(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === "https:" && u.hostname === HOST_DA_HOMOLOGACAO && u.port === "" && u.username === "" && u.password === "";
}

function valorDoArquivo(conteudo: string, chave: string): string | undefined {
  for (const linha of conteudo.split(/\r?\n/)) {
    const limpa = linha.trim();
    if (limpa === "" || limpa.startsWith("#")) continue;
    const i = limpa.indexOf("=");
    if (i <= 0 || limpa.slice(0, i).trim() !== chave) continue;
    let v = limpa.slice(i + 1).trim();
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return undefined;
}

/** E-mail e senha da conta de teste da homologação. A mensagem de erro cita só o NOME da chave. */
export function lerCredenciaisHml(
  env: Ambiente,
  lerArquivo: () => string | undefined,
): { email: string; senha: string } {
  let arquivo: string | undefined;
  const doArquivo = (chave: string) => {
    arquivo ??= lerArquivo() ?? "";
    return valorDoArquivo(arquivo, chave);
  };
  const email = env.HML_ADMIN_EMAIL || doArquivo("HML_ADMIN_EMAIL");
  const senha = env.HML_ADMIN_PASSWORD || doArquivo("HML_ADMIN_PASSWORD");
  if (!email) throw new Error("Falta HML_ADMIN_EMAIL (ambiente ou arquivo local de segredos).");
  if (!senha) throw new Error("Falta HML_ADMIN_PASSWORD (ambiente ou arquivo local de segredos).");
  return { email, senha };
}

/** Troca cada segredo (e suas formas escapadas) por `[segredo]`. Segredo vazio é ignorado. */
export function redigir(texto: string, segredos: string[]): string {
  let saida = texto;
  for (const s of segredos) {
    if (!s) continue;
    const formas = new Set([s, encodeURIComponent(s), JSON.stringify(s).slice(1, -1), s.replace(/'/g, "\\'")]);
    for (const f of [...formas].sort((a, b) => b.length - a.length)) {
      saida = saida.split(f).join("[segredo]");
    }
  }
  return saida;
}

export type StatusDaCaptura = "ok" | "falha" | "pulada";

export interface RegistroDeCaptura {
  etapa: number;
  slug: string;
  viewport: string;
  tema: string;
  status: StatusDaCaptura;
  observacao?: string;
  /** Há arquivo de imagem? Padrão: só quando `status` é "ok". */
  capturada?: boolean;
}

export function nomeDaCaptura(r: Pick<RegistroDeCaptura, "slug" | "viewport" | "tema">): string {
  return `${r.slug}-${r.viewport}-${r.tema}.png`;
}

function celula(texto: string): string {
  return texto.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** O `README.md` da fase: cada captura, a data e o host. Todo texto livre passa por `redigir`. */
export function montarIndice(opcoes: {
  fase: string;
  host: string;
  data: string;
  segredos: string[];
  registros: RegistroDeCaptura[];
}): string {
  const { fase, host, data, segredos, registros } = opcoes;
  const total = (s: StatusDaCaptura) => registros.filter((r) => r.status === s).length;
  const linhas = registros.map((r) => {
    const arquivo =
      (r.capturada ?? r.status === "ok") ? `[${nomeDaCaptura(r)}](etapa-${r.etapa}/${nomeDaCaptura(r)})` : "";
    const obs = celula(redigir(r.observacao ?? "", segredos));
    return `| ${r.etapa} | ${r.slug} | ${r.viewport} | ${r.tema} | ${r.status} | ${arquivo} | ${obs} |`;
  });
  const texto = [
    `# Capturas do visual de mensageiro: ${fase}`,
    "",
    `- Data: ${data}`,
    `- Host: ${host}`,
    `- Resultado: ${total("ok")} ok, ${total("falha")} falha(s), ${total("pulada")} pulada(s)`,
    "",
    "| Etapa | Tela | Janela | Tema | Status | Arquivo | Observação |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...linhas,
    "",
  ].join("\n");
  return redigir(texto, segredos);
}
