/**
 * A página simples que `/cobranca/iniciar` mostra ANTES de abrir o Checkout e quando
 * ele não abre. Documento sem script (CSP fechada). O texto do Asaas diz "Pagamento
 * confirmado" e "Pagar R$" mesmo sem cobrar nada no ato (medido em 31/10/2026): é
 * aqui, antes, que dizemos a verdade: "você só será cobrado em DD/MM".
 *
 * A cara é a da MARCA da organização: nome e cor vêm de `marcaDaSaida` (tema claro,
 * um hex e uma frente legível), nunca de literal. Sem script não há máscara no campo
 * do documento: o servidor aceita com ou sem pontuação (`documentoDoPagador`).
 */
import type { MarcaDeSaida } from "@/lib/branding/saida";
import { NEUTROS_DE_SAIDA } from "@/lib/branding/saida";
import { ASAAS_ORIGENS_DO_CHECKOUT } from "@/lib/cobranca/provedores/asaas-origens";

/** `form-action` = a própria página mais o Checkout do provedor: o 303 do POST também passa por ela. */
export const CSP_DA_PAGINA = `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' ${ASAAS_ORIGENS_DO_CHECKOUT.join(" ")}`;

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Hex vindo do resolvedor de marca; qualquer outra coisa cai nas cores do sistema (nunca entra CSS não conferido). */
const cor = (valor: string, reserva: string) => (HEX.test(valor) ? valor : reserva);

export type IdiomaDaPagina = "pt-BR" | "es" | "en";

export interface PaginaDeAviso {
  marca: Pick<MarcaDeSaida, "nome" | "accent" | "accentFg">;
  idioma: IdiomaDaPagina;
  titulo: string;
  /** Um parágrafo por item. */
  paragrafos: string[];
  /** Campo do CPF/CNPJ, quando a organização ainda não tem um documento válido. */
  documento?: { rotulo: string; ajuda: string; erro?: string };
  /** Botão que ENVIA (POST) para o endereço: o efeito nunca sai de um GET. */
  enviar?: { texto: string; acao: string; campos?: Record<string, string> };
  /** Segunda ação, com um aviso antes (ex.: "Tentar de novo" depois do prazo). Também POST. */
  enviarOutro?: { texto: string; acao: string; aviso: string; campos?: Record<string, string> };
  voltar: { texto: string; href: string };
  status?: number;
}

function estilo(marca: PaginaDeAviso["marca"]): string {
  const accent = cor(marca.accent, "AccentColor");
  const frente = cor(marca.accentFg, "AccentColorText");
  return [
    `body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:16px;box-sizing:border-box;font-family:system-ui,sans-serif;line-height:1.5;background:${NEUTROS_DE_SAIDA.fundo};color:${NEUTROS_DE_SAIDA.texto}}`,
    `main{width:100%;max-width:28rem;box-sizing:border-box;padding:24px;border:1px solid ${NEUTROS_DE_SAIDA.linha};border-radius:12px;background:Canvas}`,
    `.marca{margin:0 0 8px;font-weight:600;color:${accent}}`,
    `h1{margin:0 0 12px;font-size:1.4rem}`,
    `p{margin:0 0 12px}`,
    `label{display:block;font-weight:600;margin-bottom:4px}`,
    `.ajuda{font-size:.875rem;color:${NEUTROS_DE_SAIDA.suave}}`,
    `input{width:100%;box-sizing:border-box;padding:10px;font:inherit;border:1px solid ${NEUTROS_DE_SAIDA.linha};border-radius:8px}`,
    `.erro{color:inherit;font-weight:600}`,
    `button{margin-top:4px;padding:10px 16px;font:inherit;font-weight:600;border:0;border-radius:8px;cursor:pointer;background:${accent};color:${frente}}`,
    `a{color:${accent}}`,
  ].join("");
}

function escondidos(campos: Record<string, string> | undefined): string {
  return Object.entries(campos ?? {})
    .map(([nome, valor]) => `<input type="hidden" name="${escapar(nome)}" value="${escapar(valor)}">`)
    .join("");
}

export function paginaDeAviso(p: PaginaDeAviso): Response {
  const campo = p.documento
    ? `<p><label for="documento">${escapar(p.documento.rotulo)}</label><input id="documento" name="documento" type="text" inputmode="text" autocomplete="off" maxlength="18" required placeholder="000.000.000-00 / 00.000.000/0000-00"${p.documento.erro ? ' aria-invalid="true" aria-describedby="erro-documento"' : ""}>${p.documento.erro ? `<span id="erro-documento" class="erro" role="alert">${escapar(p.documento.erro)}</span>` : ""}<span class="ajuda">${escapar(p.documento.ajuda)}</span></p>`
    : "";
  const corpo = [
    `<p class="marca">${escapar(p.marca.nome)}</p>`,
    `<h1>${escapar(p.titulo)}</h1>`,
    ...p.paragrafos.map((t) => `<p>${escapar(t)}</p>`),
    p.enviar ? `<form method="post" action="${escapar(p.enviar.acao)}">${escondidos(p.enviar.campos)}${campo}<button type="submit">${escapar(p.enviar.texto)}</button></form>` : "",
    p.enviarOutro
      ? `<p class="ajuda">${escapar(p.enviarOutro.aviso)}</p><form method="post" action="${escapar(p.enviarOutro.acao)}">${escondidos(p.enviarOutro.campos)}<button type="submit">${escapar(p.enviarOutro.texto)}</button></form>`
      : "",
    `<p><a href="${escapar(p.voltar.href)}">${escapar(p.voltar.texto)}</a></p>`,
  ].join("");
  return new Response(
    `<!doctype html><html lang="${p.idioma}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapar(p.titulo)} - ${escapar(p.marca.nome)}</title><style>${estilo(p.marca)}</style><body><main>${corpo}</main></body></html>`,
    {
      status: p.status ?? 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        // Sem script. Só o estilo da própria página (a cor da marca) vem inline.
        "Content-Security-Policy": CSP_DA_PAGINA,
      },
    },
  );
}
