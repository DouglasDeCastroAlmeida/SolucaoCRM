import { cssDaMarca } from "@/lib/branding/css";
import {
  motivoDoFallback,
  registrarEstadoDaMarca,
  type LinhaDaMarca,
} from "@/lib/branding/instalacao";
import type { MarcaResolvida } from "@/lib/branding/resolve";

/**
 * Grava o ESTADO da marca da instalação (`fallback_at`/`fallback_reason`), que `/admin/marca`
 * lê em `_estado.tsx`.
 *
 * Desde o ADR 0008 (#114) a cor da marca não colore mais a interface, então nenhum CSS de cor é
 * injetado. Mas a RESOLUÇÃO da cor continua acontecendo (o operador ainda a configura, e a tela
 * mede o contraste), e o diagnóstico "a cor configurada foi recusada" tem de continuar chegando
 * ao banco: sem isto o operador veria o campo de cor funcionando e nunca saberia que o sistema o
 * recusou. Por isso `cssDaMarca` ainda roda aqui, só pelos motivos; o CSS devolvido é descartado.
 *
 * Fire-and-forget: gravar diagnóstico não pode atrasar nem derrubar a página que ele descreve.
 * `registrarEstadoDaMarca` já não lança.
 */
export function registrarEstadoDaMarcaResolvida(
  linha: LinhaDaMarca | null,
  marca: MarcaResolvida,
): void {
  const { motivos } = cssDaMarca(marca.cor);
  void registrarEstadoDaMarca(
    linha,
    // O estado gravado é o da INSTALAÇÃO: motivo da camada de marca não é dela.
    motivoDoFallback([...marca.motivos.filter((m) => m.origem !== "marca"), ...motivos]),
  );
}
