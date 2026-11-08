/**
 * Como cada recibo do balão enviado se desenha. O balão enviado tem cor FIXA (ADR 0008), então
 * "lida" ganha o azul dos tiques de leitura (`--color-tick-read`) e, além da cor, o traço mais
 * grosso e a opacidade plena (unidades do viewBox do glifo); entregue e enviada ficam finos, na
 * cor da hora e esmaecidos. A cor nunca é a única pista. Contraste vigiado por `recibo-visual.test.ts`.
 */
export const VISUAL_DO_RECIBO = {
  lida: { traco: 60, opacidade: 1, classe: "opacity-100 text-tick-read" },
  entregue: { traco: 0, opacidade: 0.85, classe: "opacity-85" },
  enviada: { traco: 0, opacidade: 0.85, classe: "opacity-85" },
} as const;
