/**
 * Glifos dos Material Symbols (Google, Apache-2.0, ver ./LICENSE) em que o
 * desenho do WhatsApp Web é o mesmo (ADR 0007). Copiados do pacote
 * `@material-symbols/svg-400@0.48.3`, estilo "outlined", sem alterar o desenho.
 *
 * Ninguém importa daqui: o acesso é só pelo mapa único `@/lib/ui/icons`
 * (regra vigiada por `tests/unit/mapa-unico-de-icones.test.ts`).
 *
 * A assinatura imita a do Phosphor (`size`, `color`, `className`, `aria-*`) para
 * a troca nos componentes ser só de nome. `weight` é aceito e ignorado: os
 * Material Symbols têm um peso por arquivo.
 */
import type { ReactNode, SVGProps } from "react";

export interface PropsDoGlifoAberto extends Omit<SVGProps<SVGSVGElement>, "children" | "color"> {
  /** Lado em px ou unidade CSS. Padrão `1em`, como o Phosphor. */
  size?: number | string;
  /** Padrão `currentColor`: o glifo herda a cor do texto. */
  color?: string;
  /** Compatibilidade com o Phosphor; sem efeito. */
  weight?: string;
  children?: ReactNode;
}

function criarGlifo(nome: string, d: string) {
  function Glifo({ size = "1em", color = "currentColor", weight: _weight, ...resto }: PropsDoGlifoAberto) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 -960 960 960"
        width={size}
        height={size}
        fill={color}
        {...resto}
      >
        <path d={d} />
      </svg>
    );
  }
  Glifo.displayName = nome;
  return Glifo;
}

/** check: uma marca (mensagem enviada). */
export const TickEnviado = criarGlifo(
  "TickEnviado",
  "M378-246 154-470l43-43 181 181 384-384 43 43-427 427Z",
);
/** done_all: duas marcas (entregue; lida muda só a cor). */
export const TickEntregue = criarGlifo(
  "TickEntregue",
  "M294-242 70-466l43-43 181 181 43 43-43 43Zm170 0L240-466l43-43 181 181 384-384 43 43-427 427Zm0-170-43-43 257-257 43 43-257 257Z",
);
/** attach_file: clipe. */
export const Clipe = criarGlifo(
  "Clipe",
  "M728-326q0 103-72.18 174.5-72.17 71.5-175 71.5Q378-80 305.5-151.5T233-326v-380q0-72.5 51.5-123.25T408-880q72 0 123.5 50.75T583-706v360q0 42-30 72t-72.5 30q-42.5 0-72.5-29.67-30-29.68-30-72.33v-370h60v370q0 17 12.5 29.5t30.64 12.5q18.14 0 30-12.5T523-346v-360q0-48-33.5-81t-81.71-33q-48.21 0-81.5 33.06T293-706v380q0 78 54.97 132T481-140q77.92 0 132.46-54Q668-248 668-326v-390h60v390Z",
);
/** mic: microfone. */
export const Microfone = criarGlifo(
  "Microfone",
  "M408-453.92q-29-30.91-29-75.08v-251q0-41.67 29.44-70.83Q437.88-880 479.94-880t71.56 29.17Q581-821.67 581-780v251q0 44.17-29 75.08Q523-423 480-423t-72-30.92ZM480-651Zm-30 531v-136q-106-11-178-89t-72-184h60q0 91 64.29 153t155.5 62q91.21 0 155.71-62Q700-438 700-529h60q0 106-72 184t-178 89v136h-60Zm59.5-376.5Q521-510 521-529v-251q0-17-11.79-28.5T480-820q-17.42 0-29.21 11.5T439-780v251q0 19 11.5 32.5T480-483q18 0 29.5-13.5Z",
);
/** mood: carinha (emoji). */
export const Emoji = criarGlifo(
  "Emoji",
  "M626-533q23 0 38.5-15.5T680-587q0-23-15.5-38.5T626-641q-23 0-38.5 15.5T572-587q0 23 15.5 38.5T626-533Zm-292 0q23 0 38.5-15.5T388-587q0-23-15.5-38.5T334-641q-23 0-38.5 15.5T280-587q0 23 15.5 38.5T334-533Zm267.5 236.5Q657-332 682-393H278q26 61 81 96.5T480-261q66 0 121.5-35.5ZM324-111.5Q251-143 197-197t-85.5-127Q80-397 80-480t31.5-156Q143-709 197-763t127-85.5Q397-880 480-880t156 31.5Q709-817 763-763t85.5 127Q880-563 880-480t-31.5 156Q817-251 763-197t-127 85.5Q563-80 480-80t-156-31.5ZM480-480Zm241 241q99-99 99-241t-99-241q-99-99-241-99t-241 99q-99 99-99 241t99 241q99 99 241 99t241-99Z",
);
/** more_vert: três pontinhos na vertical. */
export const TresPontos = criarGlifo(
  "TresPontos",
  "M479.86-160Q460-160 446-174.14t-14-34Q432-228 446.14-242t34-14Q500-256 514-241.86t14 34Q528-188 513.86-174t-34 14Zm0-272Q460-432 446-446.14t-14-34Q432-500 446.14-514t34-14Q500-528 514-513.86t14 34Q528-460 513.86-446t-34 14Zm0-272Q460-704 446-718.14t-14-34Q432-772 446.14-786t34-14Q500-800 514-785.86t14 34Q528-732 513.86-718t-34 14Z",
);
/** search: lupa. */
export const Lupa = criarGlifo(
  "Lupa",
  "M796-121 533-384q-30 26-70 40.5T378-329q-108 0-183-75t-75-181q0-106 75-181t182-75q106 0 180.5 75T632-585q0 43-14 83t-42 75l264 262-44 44ZM377-389q81 0 138-57.5T572-585q0-81-57-138.5T377-781q-82 0-139.5 57.5T180-585q0 81 57.5 138.5T377-389Z",
);
/** arrow_back: seta de voltar. */
export const Voltar = criarGlifo(
  "Voltar",
  "m274-450 248 248-42 42-320-320 320-320 42 42-248 248h526v60H274Z",
);
/** chat: balão de nova conversa. */
export const Conversa = criarGlifo(
  "Conversa",
  "M240-399h313v-60H240v60Zm0-130h480v-60H240v60Zm0-130h480v-60H240v60ZM80-80v-740q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H240L80-80Zm134-220h606v-520H140v600l74-80Zm-74 0v-520 520Z",
);
/** donut_large: anel de status. */
export const Status = criarGlifo(
  "Status",
  "M452-83Q294-95 187.5-208.5T81-480q0-158 106.5-271.5T452-877v102q-115 11-192.5 95.5T183-480q1 115 77.5 199.5T452-185v102Zm60 0v-102q106-9 179-84t86-181h102q-11 149-114.5 253T512-83Zm265-427q-12-106-85.5-181T512-776v-102q148 11 252 115t115 253H777Z",
);
