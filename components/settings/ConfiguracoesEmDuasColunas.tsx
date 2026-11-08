"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { hubSections } from "@/lib/navigation/registry";
import { cn } from "@/lib/utils";
import { Voltar } from "@/lib/ui/icons";

const RAIZ = "/app/settings";

/**
 * Configurações no padrão da tela de Configurações do mensageiro: lista de
 * seções à esquerda, detalhe à direita; no celular, uma tela por vez.
 *
 * Só apresentação. A lista é a do hub de Organização (`hubSections`), a mesma
 * que alimenta o menu e o ⌘K: nenhuma seção some e nenhuma rota muda. No hub
 * (`/app/settings`) o celular mostra só a lista; dentro de uma seção, só o
 * detalhe, com o caminho de volta para a lista.
 */
export function ConfiguracoesEmDuasColunas({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const { user, activeOrg } = useAuth();
  const secoes = hubSections(
    "organizacao",
    user.is_platform_admin && !user.support,
    activeOrg?.role ?? null,
    activeOrg?.interface_settings,
    activeOrg?.modulos_ligados ?? [],
    activeOrg?.capacidades_ligadas ?? [],
  );

  const noHub = pathname === RAIZ;
  // A seção mais específica vence: /tenant/agenda não acende também /tenant.
  const hrefAtual = secoes
    .flatMap((s) => s.items.map((i) => i.href))
    .filter((h) => pathname === h || pathname.startsWith(`${h}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div className="flex h-full min-h-0 bg-background">
      <div
        data-painel="lista"
        className={cn(
          "w-full shrink-0 overflow-y-auto border-border bg-surface md:w-80 md:border-r",
          noHub ? "block" : "hidden md:block",
        )}
      >
        <header className="px-4 pt-4 pb-2">
          <h1 className="text-lg font-semibold tracking-tight">{t("Configurações")}</h1>
        </header>
        <nav aria-label={t("Seções de configurações")} className="pb-4">
          {secoes.map((grupo) => {
            const { section, items } = grupo;
            return (
              <div key={section}>
                {section ? (
                  <h2 className="px-4 pt-3 pb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                    {t(grupo.section)}
                  </h2>
                ) : null}
                <ul>
                  {items.map((item) => {
                    const Icon = item.icon;
                    const aqui = item.href === hrefAtual;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={aqui ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-hidden focus-visible:ring-inset",
                            aqui
                              ? "bg-surface-elevated font-medium text-foreground"
                              : "text-foreground",
                          )}
                        >
                          <Icon
                            size={20}
                            weight="regular"
                            aria-hidden
                            className="shrink-0 text-muted-foreground"
                          />
                          <span className="min-w-0 truncate">{t(item.label)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </div>

      <div
        data-painel="detalhe"
        className={cn("min-w-0 flex-1 overflow-y-auto", noHub ? "hidden md:block" : "block")}
      >
        {noHub ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {t("Escolha uma seção para ver os detalhes.")}
          </p>
        ) : (
          <>
            <Link
              href={RAIZ}
              aria-label={t("Voltar para Configurações")}
              className="flex items-center gap-2 border-b border-border bg-surface px-4 py-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-hidden md:hidden"
            >
              <Voltar size={20} aria-hidden />
              {t("Configurações")}
            </Link>
            {children}
          </>
        )}
      </div>
    </div>
  );
}
