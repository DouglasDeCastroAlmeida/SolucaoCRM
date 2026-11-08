"use client";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { marcaEhADoProduto } from "@/lib/branding";
import { useMarcaDaInstalacao } from "@/lib/branding/contexto";

/**
 * A marca que a casca desenha (gaveta de navegação e faixa de ícones), resolvida UMA vez.
 *
 * Precedência: organização > instalação. O nome por organização é o que torna
 * `settings.branding.app_name` visível; a marca da instalação continua por baixo, de modo que quem
 * não definiu nada vê o de sempre. A marca vem por PROP do servidor (`useMarcaDaInstalacao`), pela
 * mesma rota de `activeOrg`: os dois lados da hidratação leem o mesmo objeto, sem divergência
 * entre servidor e navegador.
 *
 * `||` e não `??` no logo: vazio é AUSÊNCIA de logo, não "logo em branco" (a regra de
 * `resolveBranding`); com `??`, um `""` vindo de cima apagaria o logo do revendedor.
 */
export function useMarcaDaCasca() {
  const brand = useMarcaDaInstalacao();
  const { activeOrg } = useAuth();
  const nome = activeOrg?.marca?.nome ?? brand.name;
  const logo = activeOrg?.marca?.logoUrl || brand.logoUrl;
  const logoEscuro =
    activeOrg?.marca?.logoDarkUrl !== undefined
      ? activeOrg.marca.logoDarkUrl
      : activeOrg?.marca?.logoUrl
        ? null
        : brand.logoDarkUrl;
  // Só quando NINGUÉM — nem a instalação, nem a organização — pôs marca própria.
  const marcaDoProduto = marcaEhADoProduto({ name: nome, logoUrl: logo ?? null });
  // Spread e não `[0]`: nome começando com emoji ou acento composto quebraria no meio do code point.
  const inicial = [...nome][0]?.toUpperCase() ?? brand.initial;
  return { nome, logo, logoEscuro, marcaDoProduto, inicial };
}
