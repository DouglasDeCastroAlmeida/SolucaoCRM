"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { cookieSecure } from "@/lib/supabase/cookie-secure";

/**
 * A preferência do painel do contato recolhido: cookie httpOnly gravado por
 * server action e lido no servidor na montagem da tela. (O menu da esquerda tinha
 * o mesmo caminho até o visual de mensageiro, que o trocou por uma faixa de ícones
 * de largura fixa e removeu o botão de recolher.)
 *
 * O cookie e não o `localStorage` de propósito: sem a leitura no servidor, o
 * primeiro render do Inbox traz o painel aberto e o `useState` inicial só o
 * recolhe depois da hidratação — a conversa nasce estreita e "pula" para larga,
 * que é o flash que a leitura no servidor evita (`app/inbox/page.tsx` lê o cookie
 * no SSR).
 *
 * Recebe o estado ATUAL: quem chama já leu se está recolhido, então não há uma
 * segunda fonte de verdade para discordar.
 */
export async function togglePainelDoContato(currentlyCollapsed: boolean): Promise<void> {
  const store = await cookies();
  store.set("inbox_painel_recolhido", currentlyCollapsed ? "0" : "1", {
    httpOnly: true,
    sameSite: "strict",
    secure: cookieSecure(),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/app/inbox");
}
