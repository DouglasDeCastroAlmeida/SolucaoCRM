/**
 * A conversa de exemplo da homologacao na jornada de capturas (issue #113, spec #112).
 *
 * A homologacao tem um contato de exemplo com conversa de verdade (bolhas, hora, nao lida). A jornada
 * a ACHA pela lista, pelo nome do contato, e a abre com um clique: so leitura, nunca cria nem altera
 * nada. Se nao achar, a tela vira "pulada" no indice, com o motivo, e as demais seguem.
 *
 * Este modulo e a parte sem Playwright: a escolha da conversa e a decisao de pular ficam provadas por
 * teste de unidade (`tests/unit/visual-de-mensageiro-conversa-de-exemplo.test.ts`).
 */
import type { RegistroDeCaptura } from "./visual-de-mensageiro-alvo";

export const NOME_DO_CONTATO_DE_EXEMPLO = "Contato de teste do visual";

/** O que a jornada le de cada linha da lista: o id da conversa e o texto visivel da linha. */
export interface ItemDaLista {
  id: string;
  texto: string;
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Acha a conversa cujo NOME de contato e o procurado. O texto da linha comeca pelas iniciais do avatar
 * (ex.: "CV") e so depois traz o nome, por isso o nome pode ser a primeira OU a segunda linha nao vazia.
 * Uma linha que so cita o nome na previa da mensagem (da terceira linha em diante) nao conta.
 */
export function acharConversaPeloNome(itens: ItemDaLista[], nome: string): string | null {
  const alvo = normalizar(nome);
  for (const item of itens) {
    const candidatas = item.texto
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "")
      .slice(0, 2);
    if (candidatas.some((l) => normalizar(l) === alvo)) return item.id;
  }
  return null;
}

export type DecisaoDaTelaDeConversa =
  | { abrir: true; id: string }
  | { abrir: false; registro: Pick<RegistroDeCaptura, "status" | "observacao" | "capturada"> };

export function decidirTelaDaConversa(idAchado: string | null): DecisaoDaTelaDeConversa {
  if (idAchado) return { abrir: true, id: idAchado };
  return {
    abrir: false,
    registro: {
      status: "pulada",
      capturada: false,
      observacao: `a conversa de exemplo (contato "${NOME_DO_CONTATO_DE_EXEMPLO}") nao esta na lista da homologacao`,
    },
  };
}

export type FaseDaJornada = "antes" | "depois" | "rodada-2-antes";

/** A fase vira nome de pasta: so os valores conhecidos passam; o resto cai em "antes". */
export function faseValida(bruta: string | undefined): FaseDaJornada {
  return bruta === "depois" || bruta === "rodada-2-antes" ? bruta : "antes";
}
