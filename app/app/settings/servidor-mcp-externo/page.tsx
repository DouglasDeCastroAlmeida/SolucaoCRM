import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { env } from "@/lib/env";
import { traduzir } from "@/lib/i18n/dicionario";
import { ServidoresMcpExternos } from "./_components/ServidoresMcpExternos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Servidor MCP externo" };

/**
 * Os servidores MCP externos da empresa (#2948; mudança 006, REQ-007).
 *
 * ── Quem entra ──────────────────────────────────────────────────────────────
 *
 * A MESMA regra das rotas `/api/v1/mcp-servidores` (`exigirAdminDeServidoresMcp`), e a tela não
 * inventa uma segunda: com `MCP_EXTERNO_ADMIN_DA_ORG` desligada (padrão) só o dono da instalação
 * (platform admin, nunca sessão de suporte); ligada, também o administrador da organização ativa.
 * Quem não passa recebe `/403`. A chave não vai para o navegador: só o resultado da conta.
 *
 * ── O que ela NÃO carrega ──────────────────────────────────────────────────
 *
 * Nada do banco no servidor: a lista vem da API, que devolve da credencial só os 4 últimos.
 */
export default async function ServidorMcpExternoPage() {
  const user = await requireAuth();
  const donoDaInstalacao = user.is_platform_admin && !user.support;
  if (!donoDaInstalacao) {
    if (!env.MCP_EXTERNO_ADMIN_DA_ORG || user.support) redirect("/403");
    const activeOrg = await resolveActiveOrg(user);
    if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) redirect("/403");
  }

  const idioma = user.idioma;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {traduzir("Servidor MCP externo", idioma)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "Os sistemas de fora cujas ferramentas a IA desta empresa pode usar. Cada ferramenta nasce desligada e você a liga, agente por agente.",
            idioma,
          )}
        </p>
      </header>
      <ServidoresMcpExternos />
    </div>
  );
}
