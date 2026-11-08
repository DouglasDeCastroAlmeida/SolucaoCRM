import type { ReactNode } from "react";

import { ConfiguracoesEmDuasColunas } from "@/components/settings/ConfiguracoesEmDuasColunas";

/** Configurações em duas colunas (visual de mensageiro, #93): só apresentação. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <ConfiguracoesEmDuasColunas>{children}</ConfiguracoesEmDuasColunas>;
}
