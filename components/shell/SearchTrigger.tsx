"use client";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { MagnifyingGlass } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { CommandPalette } from "@/components/shell/CommandPalette";

export function SearchTrigger() {
  const t = useT();
  const [open, setOpen] = useState(false);

  // `enableOnFormTags`: o atalho precisa funcionar com o cursor dentro do
  // composer do inbox, que é onde o operador passa o dia.
  useHotkeys("mod+k", () => setOpen(true), { preventDefault: true, enableOnFormTags: true });

  return (
    <>
      {/* Visual de mensageiro (#87): busca em PÍLULA sobre o cabeçalho cinza-claro,
          como a do WhatsApp Web. Botão nativo (sem `components/ui`): o que muda
          é só a forma; o clique e o ⌘K abrem a mesma paleta de comandos. */}
      <button
        type="button"
        aria-label={t("Buscar...")}
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-full bg-surface px-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden md:px-4"
        onClick={() => setOpen(true)}
      >
        <MagnifyingGlass size={16} aria-hidden />
        <span className="hidden min-w-0 flex-1 truncate text-left md:inline">{t("Buscar...")}</span>
        <kbd className="ml-auto hidden rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] md:inline">
          ⌘K
        </kbd>
      </button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
