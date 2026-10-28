"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { AgentRow } from "@/hooks/ai/useAgent";
export function AgentOperation({ agent, readOnly }: { agent: AgentRow; readOnly?: boolean }) {
  const t = useT(),
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [confirmando, setConfirmando] = useState(false);
  async function change(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await apiClient.patch(`/api/v1/ai/agents/${agent.id}`, body);
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setBusy(false);
    }
  }
  // O automático só vale depois do clique de confirmação; a rota é quem cobra isso (mudança 006).
  async function confirmarAutomatico() {
    setBusy(true);
    try {
      await apiClient.post(`/api/v1/ai/agents/${agent.id}/automatico`, {
        confirmar_automatico: true,
      });
      setConfirmando(false);
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="flex flex-wrap items-center gap-3 rounded-md border p-3"
      aria-label={t("Operação do agente")}
    >
      <label className="text-sm">
        {t("Operação do agente")}{" "}
        <select
          className="ml-2 rounded-md border bg-background p-2"
          aria-label={t("Modo de operação")}
          value={agent.operation_mode ?? "automatic"}
          disabled={readOnly || busy}
          onChange={(e) =>
            e.target.value === "automatic" && agent.operation_mode !== "automatic"
              ? setConfirmando(true)
              : change({ operation_mode: e.target.value })
          }
        >
          <option value="assisted">{t("Assistido: revisar antes de enviar")}</option>
          <option value="automatic">{t("Automático: responder com as regras do agente")}</option>
        </select>
      </label>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={readOnly || busy || !agent.published_version_id}
        onClick={() => change({ paused_at: agent.paused_at ? null : new Date().toISOString() })}
      >
        {t(agent.paused_at ? "Retomar automático" : "Pausar automático")}
      </Button>
      <p className="w-full text-xs text-muted-foreground">
        {t(
          agent.paused_at
            ? "Automático pausado. A versão publicada foi preservada e a assistência continua disponível."
            : "O modo assistido prepara sugestões na conversa. Só a aprovação humana autoriza o envio.",
        )}
      </p>
      <AlertDialog open={confirmando} onOpenChange={(aberto) => !busy && setConfirmando(aberto)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Ligar o modo automático?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "O agente vai passar a responder sozinho aos seus clientes, sem esperar a aprovação de uma pessoa. O custo de cada resposta vai na chave de IA da sua empresa.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void confirmarAutomatico();
              }}
            >
              {t("Confirmar e ligar o automático")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
