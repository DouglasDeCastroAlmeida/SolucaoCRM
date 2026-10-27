"use client";
import { CalendarClock, CircleCheck } from "lucide-react";

import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

/**
 * O QUE O CLIENTE RESPONDEU AO LEMBRETE, visto pela equipe (mudança 007, REQ-004).
 *
 * Dois sinais independentes, ambos gravados pelo pos-entrada de mensagens:
 * - `confirmadoEm` ("1"/"sim"): selo "Confirmado pelo cliente" com a hora.
 * - `pediuRemarcarEm` ("2"/"remarcar"): PENDÊNCIA da equipe, destacada, porque
 *   nada foi remarcado nem cancelado sozinho — alguém precisa combinar o novo
 *   horário. Some quando a equipe age (`limpar-pedido-de-remarcar.ts`).
 *
 * Texto + ícone, nunca só cor: o ícone é decorativo (`aria-hidden`) e o texto
 * carrega o sentido para leitor de tela. Cores só por tokens do tema.
 */
export function SeloDaConfirmacaoDoCliente({
  confirmadoEm,
  pediuRemarcarEm,
  fuso,
  className,
}: {
  confirmadoEm?: string | null;
  pediuRemarcarEm?: string | null;
  /** O fuso RESOLVIDO da organização — o mesmo da grade ao lado. */
  fuso: string;
  className?: string;
}) {
  const t = useT();
  const tag = useTagDeIdioma();
  if (!confirmadoEm && !pediuRemarcarEm) return null;

  const quando = (iso: string) =>
    new Intl.DateTimeFormat(tag, {
      timeZone: fuso,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {confirmadoEm ? (
        <span
          data-testid="selo-confirmado-pelo-cliente"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-text"
        >
          <CircleCheck aria-hidden="true" className="h-3 w-3 shrink-0" />
          <span>{t("Confirmado pelo cliente")}</span>
          <span className="tabular-nums text-text-muted">{quando(confirmadoEm)}</span>
        </span>
      ) : null}
      {pediuRemarcarEm ? (
        <span
          role="status"
          data-testid="pendencia-pediu-para-remarcar"
          className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface-elevated px-2 py-0.5 text-[11px] font-semibold text-text"
        >
          <CalendarClock aria-hidden="true" className="h-3 w-3 shrink-0" />
          <span>{t("Pediu para remarcar")}</span>
          <span className="tabular-nums text-text-muted">{quando(pediuRemarcarEm)}</span>
        </span>
      ) : null}
    </span>
  );
}
