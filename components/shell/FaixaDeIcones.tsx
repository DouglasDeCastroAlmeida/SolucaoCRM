"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SimboloDoProduto } from "@/components/branding/MarcaDoProduto";
import { ContadorDaFila } from "@/components/shell/ContadorDaFila";
import { ContadorDeCasos } from "@/components/shell/ContadorDeCasos";
import { GavetaDeNavegacao } from "@/components/shell/MobileSidebar";
import { VersionFooter } from "@/components/shell/VersionFooter";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { marcaEhADoProduto } from "@/lib/branding";
import { useMarcaDaInstalacao } from "@/lib/branding/contexto";
import { GRUPO_NO_RODAPE, sidebarGroups, type NavDestination } from "@/lib/navigation/registry";
import { Gear } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Os destinos que moram na faixa, NESTA ordem (visual de mensageiro, #87).
 *
 * É escolha de apresentação, não regra de acesso: cada href só aparece se
 * `sidebarGroups()` o entregar para este papel, módulos e capacidades, e tudo o
 * que não cabe aqui continua no "mais" (a gaveta com a navegação completa). A
 * ordem do registro não muda; a faixa só escolhe quem sobe.
 */
export const ITENS_DA_FAIXA = [
  "/app/inbox",
  "/app/contacts",
  "/app/kanban",
  "/app/agenda",
  "/app/tasks",
] as const;

/**
 * A faixa estreita de ícones à esquerda, como no WhatsApp Web.
 *
 * ⚠️ `sticky`, e NUNCA `fixed`, pelo mesmo motivo de sempre (ver
 * `tests/unit/barra-lateral-nao-flutua.test.ts`): a faixa ocupa lugar na linha,
 * e o conteúdo recebe só o que sobra; não há segunda medida para discordar.
 * `h-dvh` e não `h-screen`: `100vh` ignora a barra do navegador móvel/tablet.
 * `w-16` (64px) é fixo: a preferência de recolher/expandir deixou de existir,
 * porque a navegação completa agora está um clique atrás do "mais".
 */
export function FaixaDeIcones() {
  const t = useT();
  const pathname = usePathname();
  const { user, activeOrg } = useAuth();
  const grupos = sidebarGroups(
    user.is_platform_admin && !user.support,
    activeOrg?.role ?? null,
    activeOrg?.interface_settings,
    activeOrg?.modulos_ligados ?? [],
    activeOrg?.capacidades_ligadas ?? [],
  );
  const porHref = new Map<string, NavDestination>();
  for (const { items } of grupos) for (const i of items) porHref.set(i.href, i);
  const principais = ITENS_DA_FAIXA.map((h) => porHref.get(h)).filter(
    (d): d is NavDestination => d !== undefined,
  );
  const config = grupos.find((g) => g.group.id === GRUPO_NO_RODAPE)?.group.hub;

  const estaEm = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="sticky top-0 z-30 flex h-dvh w-16 shrink-0 flex-col items-center border-r border-border bg-surface-elevated py-3">
      <TooltipProvider delayDuration={200}>
        <MarcaDaFaixa />
        <nav
          aria-label={t("Navegação principal")}
          className="mt-4 flex flex-1 flex-col items-center gap-1 overflow-y-auto"
        >
          <ul className="flex flex-col items-center gap-1">
            {principais.map((item) => {
              const Icon = item.icon;
              const aqui = estaEm(item.href);
              return (
                <li key={item.href}>
                  <DicaDaFaixa rotulo={t(item.label)}>
                    <Link
                      href={item.href}
                      aria-label={t(item.label)}
                      aria-current={aqui ? "page" : undefined}
                      className={cn(
                        "relative flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                        aqui
                          ? "bg-surface text-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-surface/70 hover:text-foreground",
                      )}
                    >
                      <Icon size={22} weight={aqui ? "fill" : "regular"} aria-hidden />
                      {item.contador === "casos" && <ContadorDeCasos compacto />}
                      {item.contador === "fila" && <ContadorDaFila compacto />}
                    </Link>
                  </DicaDaFaixa>
                </li>
              );
            })}
            <li>
              <GavetaDeNavegacao comoFaixa />
            </li>
          </ul>
        </nav>
        <div className="flex flex-col items-center gap-1">
          {config && (
            <DicaDaFaixa rotulo={t(config.label)}>
              <Link
                href={config.href}
                aria-label={t(config.label)}
                aria-current={estaEm(config.href) ? "page" : undefined}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                  estaEm(config.href)
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-surface/70 hover:text-foreground",
                )}
              >
                <Gear size={22} weight={estaEm(config.href) ? "fill" : "regular"} aria-hidden />
              </Link>
            </DicaDaFaixa>
          )}
          <VersionFooter collapsed />
        </div>
      </TooltipProvider>
    </aside>
  );
}

/** O nome do destino num balão, ao passar o mouse e ao focar por teclado. */
function DicaDaFaixa({ rotulo, children }: { rotulo: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{rotulo}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A marca no alto da faixa: símbolo do produto, ou a arte/inicial de quem
 * personalizou. Mesma precedência da barra aberta (organização > instalação).
 */
function MarcaDaFaixa() {
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
  const marcaDoProduto = marcaEhADoProduto({ name: nome, logoUrl: logo ?? null });

  if (marcaDoProduto) {
    return <SimboloDoProduto nome={nome} className="h-8 w-8" />;
  }
  if (logo || logoEscuro) {
    return (
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-md",
          // Sem arte própria para o escuro, preserva a proteção de contraste.
          !logoEscuro && "dark:bg-white dark:p-1",
        )}
        title={nome}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={nome}
            className={cn("max-h-8 max-w-full object-contain", logoEscuro && "dark:hidden")}
          />
        ) : null}
        {logoEscuro ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoEscuro}
            alt={nome}
            className="hidden max-h-8 max-w-full object-contain dark:block"
          />
        ) : null}
      </div>
    );
  }
  return (
    <span
      aria-hidden
      title={nome}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground"
    >
      {[...nome][0]?.toUpperCase() ?? brand.initial}
    </span>
  );
}
