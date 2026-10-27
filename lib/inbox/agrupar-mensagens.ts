/**
 * Como o fio da conversa agrupa balões e separa os dias.
 *
 * Funções puras: relógio e fuso entram por parâmetro. O dia é o do calendário no
 * FUSO DA ORGANIZAÇÃO (o mesmo helper da lista), não o do navegador.
 */
import { partesNoFuso } from "@/lib/agenda/fuso";
import { fusoUtilizavel } from "@/lib/tempo/fusos";
import { numeroDoDia } from "@/lib/inbox/formato-da-lista";

type Traduz = (texto: string) => string;

/** Mensagens do mesmo lado com menos que isto entre si formam um grupo. */
export const JANELA_DO_GRUPO_MS = 2 * 60_000;

const dois = (n: number) => String(n).padStart(2, "0");

export interface ItemDoFio {
  /** De que lado está o balão; `null` para o que não é mensagem (nota, passagem). */
  lado: string | null;
  ts: string;
}

export interface PosicaoNoGrupo {
  /** Só a última do grupo leva a cauda do balão. */
  comCauda: boolean;
  /** Vem logo depois de outra do mesmo grupo: espaçamento menor. */
  colada: boolean;
}

function mesmoGrupo(a: ItemDoFio, b: ItemDoFio): boolean {
  if (a.lado === null || b.lado === null || a.lado !== b.lado) return false;
  const diferenca = Date.parse(b.ts) - Date.parse(a.ts);
  return Number.isFinite(diferenca) && diferenca >= 0 && diferenca < JANELA_DO_GRUPO_MS;
}

export function marcarGrupos(itens: ItemDoFio[]): PosicaoNoGrupo[] {
  return itens.map((item, i) => {
    const anterior = itens[i - 1];
    const proximo = itens[i + 1];
    return {
      comCauda: !(proximo && mesmoGrupo(item, proximo)),
      colada: Boolean(anterior && mesmoGrupo(anterior, item)),
    };
  });
}

/** AAAA-MM-DD do instante no fuso; é a chave de quebra de dia do fio. */
export function chaveDoDia(iso: string, fuso: string | null | undefined): string {
  const p = partesNoFuso(new Date(iso), fusoUtilizavel(fuso));
  return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}`;
}

/** "Hoje", "Ontem" ou DD/MM/AAAA, contados em dias do calendário no fuso. */
export function rotuloDoDia(
  iso: string,
  agora: Date,
  fuso: string | null | undefined,
  t: Traduz,
): string {
  const tz = fusoUtilizavel(fuso);
  const instante = new Date(iso);
  const diferenca = numeroDoDia(agora, tz) - numeroDoDia(instante, tz);
  if (diferenca <= 0) return t("Hoje");
  if (diferenca === 1) return t("Ontem");
  const p = partesNoFuso(instante, tz);
  return `${dois(p.dia)}/${dois(p.mes)}/${p.ano}`;
}

/** HH:mm do instante no fuso da organização. */
export function horaNoFuso(iso: string, fuso: string | null | undefined): string {
  const p = partesNoFuso(new Date(iso), fusoUtilizavel(fuso));
  return `${dois(p.hora)}:${dois(p.minuto)}`;
}
