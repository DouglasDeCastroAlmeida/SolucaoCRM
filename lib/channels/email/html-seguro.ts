/**
 * Higieniza o HTML de um e-mail recebido (mudança 005, ADR-006): na ENTRADA, antes de
 * gravar. O que está no banco já é seguro, mesmo que o renderizador mude um dia.
 *
 * Lista curta de tags de texto. Fora dela, nada: nem script, formulário, iframe, estilo
 * ou `<img>` (imagem remota é rastreio e vazamento do IP de quem abre). Sem atributo de
 * estilo, classe ou evento. Link só com http, https ou mailto, sempre `noopener`.
 */
import sanitizeHtml from "sanitize-html";

const OPCOES: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "div", "span", "b", "strong", "i", "em", "u", "s", "ul", "ol", "li", "blockquote",
    "pre", "code", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "td", "th", "a",
  ],
  allowedAttributes: { a: ["href", "rel", "target"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    a: (tag, atributos): sanitizeHtml.Tag => {
      const attribs: Record<string, string> = atributos.href
        ? { href: atributos.href, rel: "noopener noreferrer nofollow", target: "_blank" }
        : {};
      return { tagName: tag, attribs };
    },
  },
};

export function higienizarHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, OPCOES);
}
