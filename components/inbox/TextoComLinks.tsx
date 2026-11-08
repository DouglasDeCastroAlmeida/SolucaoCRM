import type { ReactNode } from "react";

const URL_NO_TEXTO = /(https?:\/\/[^\s<>"]+)/g;
const PONTUACAO_FINAL = /[.,;:!?)\]]+$/;

/**
 * O TEXTO DA BOLHA COM OS LINKS VIVOS (#117): como no WhatsApp Web, o endereço dentro do texto fica
 * verde e sublinhado. Só `http(s)://` vira link (nunca `javascript:` nem `data:`), abre em aba nova e não
 * entrega `window.opener`. A pontuação que fecha a frase fica FORA do link.
 */
export function TextoComLinks({ texto }: { texto: string }) {
  const partes: ReactNode[] = [];
  texto.split(URL_NO_TEXTO).forEach((pedaco, i) => {
    if (i % 2 === 0) {
      if (pedaco) partes.push(pedaco);
      return;
    }
    const cauda = PONTUACAO_FINAL.exec(pedaco)?.[0] ?? "";
    const url = cauda ? pedaco.slice(0, -cauda.length) : pedaco;
    partes.push(
      <a
        key={i}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent-700 underline underline-offset-2 dark:text-accent-300"
      >
        {url}
      </a>,
    );
    if (cauda) partes.push(cauda);
  });
  return <>{partes}</>;
}
