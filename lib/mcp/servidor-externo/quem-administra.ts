/**
 * Quem cadastra e mantém servidores MCP externos pela API (mudança 006, ADR-004).
 *
 * - `MCP_EXTERNO_ADMIN_DA_ORG` DESLIGADA (padrão de fábrica): só o administrador
 *   da instalação (`regraPlatformAdmin`: platform admin, escopo `full`, nunca
 *   sessão de suporte, `aal2` quando a política pede) e na organização ativa.
 *   É o comportamento de antes da ADR-004.
 * - LIGADA: o administrador da organização ativa (`requireRole("admin")`) cuida
 *   dos servidores da PRÓPRIA organização. O dono da instalação continua podendo.
 *
 * Nos dois casos a organização sai da sessão (`requireRole`), nunca do corpo.
 * Este arquivo decide PAPEL; `requireSupportWrite` (guarda de efeito) continua
 * sendo chamado por cada rota mutante antes do efeito.
 */
import { fail } from "@/lib/api/wrappers";
import { loadAuthUser } from "@/lib/auth/server";
import { requireRole, type RoleCheck } from "@/lib/auth/require-role";
import { env } from "@/lib/env";
import { regraPlatformAdmin } from "@/lib/extensions/http";
import { traduzir } from "@/lib/i18n/dicionario";

export const RECURSO_DOS_SERVIDORES_MCP = "mcp_servidores";

export async function exigirAdminDeServidoresMcp(requestId: string): Promise<RoleCheck> {
  const opcoes = { requestId, resource: RECURSO_DOS_SERVIDORES_MCP, allowPlatformAdmin: true } as const;

  if (env.MCP_EXTERNO_ADMIN_DA_ORG) return requireRole("admin", opcoes);

  const user = await loadAuthUser();
  if (!user) return { ok: false, response: fail("unauthenticated", "Auth required.", 401, { requestId }) };
  const t = (texto: string) => traduzir(texto, user.idioma);

  const regra = await regraPlatformAdmin(user);
  if (!regra.ok) {
    if (regra.codigo === "upstream_unavailable") {
      return {
        ok: false,
        response: fail("upstream_unavailable", t("Não foi possível confirmar a permissão de acesso."), 503, { requestId }),
      };
    }
    if (regra.codigo === "mfa_required") {
      return {
        ok: false,
        response: fail(
          "mfa_required",
          t("Esta sessão precisa da verificação em duas etapas. Entre novamente com o código do aplicativo."),
          403,
          { requestId },
        ),
      };
    }
    return {
      ok: false,
      response: fail(
        "forbidden_role",
        t("Só o administrador da instalação pode cadastrar servidores de ferramentas externos."),
        403,
        { requestId },
      ),
    };
  }
  return requireRole("admin", opcoes);
}
