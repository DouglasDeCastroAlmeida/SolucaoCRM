/**
 * Tradução das páginas HTML que `/cobranca/iniciar` devolve do servidor (mudança 003).
 *
 * A chave é a frase em português, como no resto do produto. es sai do dicionário
 * (`traduzir`); en sai do catálogo `traducoes/en.json` (ainda em construção, então
 * nenhuma tela o lê: aqui ele já é servido, porque a página é nova). Falta de
 * tradução degrada para português, nunca para a chave crua. `{nome}` marca o que
 * muda de uma cobrança para outra e é preenchido DEPOIS de traduzir.
 */
import { DICIONARIO } from "@/lib/i18n/dicionario";
import type { IdiomaDaPagina } from "@/lib/billing-trial/pagina";
import catalogoEn from "@/lib/i18n/traducoes/en.json";

const EN = catalogoEn as Record<string, string>;

export function textoDaPagina(
  texto: string,
  idioma: IdiomaDaPagina,
  valores: Record<string, string> = {},
): string {
  // Só literais do código chegam aqui (nunca dado digitado por alguém): por isso lê o dicionário direto.
  const base = idioma === "en" ? (EN[texto] ?? texto) : idioma === "es" ? (DICIONARIO[texto]?.es ?? texto) : texto;
  return Object.entries(valores).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(v), base);
}
