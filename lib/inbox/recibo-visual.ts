/**
 * Como cada recibo do balão enviado se desenha. O balão leva a cor da MARCA, então "lida" não pode
 * ser uma cor fixa (o azul antigo reprovava contraste em marcas azuis): ela se distingue pelo traço
 * mais grosso (unidades do viewBox do glifo) e pela opacidade plena; os demais ficam finos e
 * esmaecidos. A opacidade mínima é vigiada por `recibo-visual.test.ts` (3:1 sobre qualquer marca).
 */
export const VISUAL_DO_RECIBO = {
  lida: { traco: 60, opacidade: 1, classe: "opacity-100" },
  entregue: { traco: 0, opacidade: 0.85, classe: "opacity-85" },
  enviada: { traco: 0, opacidade: 0.85, classe: "opacity-85" },
} as const;
