/**
 * Como a lista de conversas escreve o horário e a prévia da última mensagem.
 *
 * Funções puras: o relógio (`agora`), o fuso e o idioma entram por parâmetro,
 * para a regra ser testável sem montar tela e para a lista dizer o MESMO dia
 * que o resto do produto (o fuso é o da organização, não o do navegador).
 *
 * A prévia que o banco guarda (`conversations.last_message_preview`) já é o
 * rótulo do tipo quando a mensagem não tem texto (ver
 * `lib/messaging/previa-da-mensagem.ts`) — aqui só se reconhece esse rótulo
 * para a tela poder pôr o ícone ao lado, e se protege a lista de um endereço
 * de arquivo que algum canal tenha gravado como texto.
 */
import { partesNoFuso } from "@/lib/agenda/fuso";
import { fusoUtilizavel } from "@/lib/tempo/fusos";
import { ROTULO_DO_TIPO } from "@/lib/messaging/previa-da-mensagem";

type Traduz = (texto: string) => string;

const DIA_EM_MS = 86_400_000;

export function numeroDoDia(instante: Date, fuso: string): number {
  const p = partesNoFuso(instante, fuso);
  return Date.UTC(p.ano, p.mes - 1, p.dia) / DIA_EM_MS;
}

const dois = (n: number) => String(n).padStart(2, "0");

/**
 * Hora se for de hoje; "Ontem"; dia da semana se for da última semana; data
 * nos demais casos. "Hoje", "ontem" e "semana" são contados em DIAS DO
 * CALENDÁRIO no fuso da organização, não em blocos de 24 horas.
 */
export function horarioCurtoDaLista(
  iso: string | null | undefined,
  agora: Date,
  fuso: string | null | undefined,
  tagDeIdioma: string,
  t: Traduz,
): string {
  if (!iso) return "";
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return "";
  const tz = fusoUtilizavel(fuso);
  const diferenca = numeroDoDia(agora, tz) - numeroDoDia(instante, tz);
  const p = partesNoFuso(instante, tz);
  if (diferenca <= 0) return `${dois(p.hora)}:${dois(p.minuto)}`;
  if (diferenca === 1) return t("Ontem");
  if (diferenca < 7) {
    return new Intl.DateTimeFormat(tagDeIdioma, { weekday: "short", timeZone: tz }).format(instante);
  }
  const anoDeHoje = partesNoFuso(agora, tz).ano;
  const data = `${dois(p.dia)}/${dois(p.mes)}`;
  return p.ano === anoDeHoje ? data : `${data}/${String(p.ano).slice(-2)}`;
}

/** A última mensagem foi enviada por nós? (a saída não é anterior à última atividade) */
export function ultimaFoiNossa(c: {
  last_outbound_at: string | null;
  last_message_at: string | null;
}): boolean {
  if (!c.last_outbound_at || !c.last_message_at) return false;
  return Date.parse(c.last_outbound_at) >= Date.parse(c.last_message_at);
}

export type MidiaDaPrevia = "image" | "audio" | "video" | "document" | "sticker" | "location";

export interface PreviaDaLista {
  /** "Você:" quando a última mensagem é nossa; vazio caso contrário. */
  prefixo: string;
  /** Preenchido quando a prévia é uma mídia: a tela põe o ícone correspondente. */
  midia: MidiaDaPrevia | null;
  texto: string;
}

const MIDIAS: MidiaDaPrevia[] = ["image", "audio", "video", "document", "sticker", "location"];

const MIDIA_PELO_ROTULO = new Map<string, MidiaDaPrevia>(
  MIDIAS.map((m): [string, MidiaDaPrevia] => [ROTULO_DO_TIPO[m] ?? m, m]),
);

const MIDIA_PELA_EXTENSAO: [RegExp, MidiaDaPrevia][] = [
  [/\.(jpe?g|png|gif|webp|heic)$/i, "image"],
  [/\.(mp3|ogg|oga|opus|m4a|wav|aac)$/i, "audio"],
  [/\.(mp4|mov|webm|3gp|mkv)$/i, "video"],
  [/\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip)$/i, "document"],
];

function rotuloDaMidia(midia: MidiaDaPrevia, t: Traduz): string {
  switch (midia) {
    case "image":
      return t("Imagem");
    case "audio":
      return t("Áudio");
    case "video":
      return t("Vídeo");
    case "document":
      return t("Documento");
    case "sticker":
      return t("Figurinha");
    case "location":
      return t("Localização compartilhada");
  }
}

export function previaDaLista(
  preview: string | null | undefined,
  enviadaPorNos: boolean,
  t: Traduz,
): PreviaDaLista {
  const prefixo = enviadaPorNos ? t("Você:") : "";
  const bruto = preview?.trim() ?? "";
  if (!bruto) return { prefixo, midia: null, texto: t("Sem mensagens") };

  let midia = MIDIA_PELO_ROTULO.get(bruto) ?? null;
  if (!midia && /^(https?:\/\/|\/)\S+$/i.test(bruto)) {
    const semConsulta = (bruto.split(/[?#]/)[0] ?? "").trim();
    midia = MIDIA_PELA_EXTENSAO.find(([re]) => re.test(semConsulta))?.[1] ?? null;
  }
  if (midia) return { prefixo, midia, texto: rotuloDaMidia(midia, t) };
  return { prefixo, midia: null, texto: bruto };
}
