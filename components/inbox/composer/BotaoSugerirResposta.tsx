"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Sparkle } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";

/**
 * "Sugerir resposta" como ÍCONE da linha de escrever (#118). Antes era um botão com texto
 * dentro da faixa "Assistência do agente", que ocupava a tela inteira mesmo sem nada a dizer.
 *
 * É a mesma chamada de sempre (`POST /api/v1/conversations/:id/draft-reply`) e a mesma
 * chave de consulta: a sugestão gerada aparece no painel de revisão (`ReplyReviewPanel`),
 * que agora só existe quando há algo a dizer. Nada é enviado daqui.
 */
export function BotaoSugerirResposta({
  conversationId,
  disabled,
  aoSugerir,
}: {
  conversationId: string;
  disabled?: boolean;
  /** Chamado no início do pedido: o painel de revisão apaga o aviso da sugestão anterior. */
  aoSugerir?: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function gerar() {
    aoSugerir?.();
    setBusy(true);
    try {
      await apiClient.post(`/api/v1/conversations/${conversationId}/draft-reply`, {});
      await qc.invalidateQueries({ queryKey: ["reply-drafts", conversationId] });
    } catch (e) {
      showApiError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-10 shrink-0 rounded-full text-muted-foreground"
      aria-label={t("Sugerir resposta")}
      title={busy ? t("Preparando…") : t("Sugerir resposta")}
      aria-busy={busy}
      disabled={disabled || busy}
      onClick={gerar}
    >
      <Sparkle size={24} weight={busy ? "duotone" : "regular"} aria-hidden />
    </Button>
  );
}
