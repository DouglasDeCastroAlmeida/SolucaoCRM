import type { Metadata } from "next";

import { PrototipoDoInbox, type Tema, type Vista } from "./PrototipoDoInbox";

export const metadata: Metadata = {
  title: "Protótipo do Inbox — laboratório de design",
  robots: { index: false, follow: false },
};

type Busca = { tema?: string; vista?: string; menu?: string; painel?: string };

/** `/design/inbox?tema=escuro&vista=lista|conversa|contato&menu=1&painel=0`. Rota pública, noindex. */
export default async function PrototipoDoInboxPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const q = await searchParams;
  const tema: Tema = q.tema === "escuro" ? "escuro" : "claro";
  const vista: Vista = q.vista === "lista" || q.vista === "contato" ? q.vista : "conversa";
  return (
    <PrototipoDoInbox tema={tema} vista={vista} menuAberto={q.menu === "1"} painel={q.painel !== "0"} />
  );
}
