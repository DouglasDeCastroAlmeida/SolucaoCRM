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

/** Frases do estado "confirmando" (voltou do cartão, assinatura ainda não achada): páginas e hub usam as mesmas. */
export const TITULO_CONFIRMANDO = "Confirmando seu pagamento";
export const FRASE_CONFIRMANDO = "Estamos confirmando o seu pagamento. Se você já informou o cartão, não precisa pagar de novo.";
export const AVISO_TENTAR_DE_NOVO =
  "Use \"Tentar de novo\" só se o cartão não foi aceito. Se você já informou o cartão, aguarde: pagar de novo pode gerar duas cobranças.";
