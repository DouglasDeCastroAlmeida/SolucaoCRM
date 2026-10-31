/**
 * A página simples que `/cobranca/iniciar` mostra ANTES de abrir o Checkout e quando
 * ele não abre. Documento sem script (CSP fechada). O texto do Asaas diz "Pagamento
 * confirmado" e "Pagar R$" mesmo sem cobrar nada no ato (medido em 31/10/2026): é
 * aqui, antes, que dizemos a verdade: "você só será cobrado em DD/MM".
 */
function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export interface PaginaDeAviso {
  nomeDaMarca: string;
  titulo: string;
  /** Um parágrafo por item. */
  paragrafos: string[];
  /** Botão que ENVIA (POST) para o endereço: o efeito nunca sai de um GET. */
  enviar?: { texto: string; acao: string };
  voltar: { texto: string; href: string };
  status?: number;
}

export function paginaDeAviso(p: PaginaDeAviso): Response {
  const corpo = [
    `<h1>${escapar(p.titulo)}</h1>`,
    ...p.paragrafos.map((t) => `<p>${escapar(t)}</p>`),
    p.enviar ? `<form method="post" action="${escapar(p.enviar.acao)}"><button type="submit">${escapar(p.enviar.texto)}</button></form>` : "",
    `<p><a href="${escapar(p.voltar.href)}">${escapar(p.voltar.texto)}</a></p>`,
  ].join("");
  return new Response(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapar(p.titulo)} - ${escapar(p.nomeDaMarca)}</title><body>${corpo}</body></html>`,
    {
      status: p.status ?? 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      },
    },
  );
}
