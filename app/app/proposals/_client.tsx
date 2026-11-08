"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEffect, useState } from "react";
import Link from "next/link";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/wrappers";
import { formatCents } from "@/lib/money";
import type { ProposalStatus } from "@/lib/propostas/tipos";

interface PropostaResumo {
  id: string;
  titulo: string;
  status: ProposalStatus;
  total_cents: number;
  moeda: string;
  numero: number | null;
  ano: number | null;
  versao: number;
  created_at: string;
  drafted_by_agent_id: string | null;
}

function aguardaRevisao(p: PropostaResumo): boolean {
  return p.status === "rascunho" && p.drafted_by_agent_id !== null;
}

/** Rascunho da IA primeiro — é o que espera uma decisão; o resto na ordem da rota (mais novo primeiro). */
function ordenarParaRevisao(lista: PropostaResumo[]): PropostaResumo[] {
  return [...lista.filter(aguardaRevisao), ...lista.filter((p) => !aguardaRevisao(p))];
}

export function ProposalsClient({ podeCriar }: { podeCriar: boolean }) {
  const t = useT();
  const statusLabels: Record<ProposalStatus, string> = {
    rascunho: t("Rascunho"),
    enviando: t("Enviando"),
    enviada: t("Enviada"),
    aceita: t("Aceita"),
    recusada: t("Recusada"),
    vencida: t("Vencida"),
    cancelada: t("Cancelada"),
    substituida: t("Substituída"),
  };
  const [propostas, setPropostas] = useState<PropostaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    apiClient
      .get<ApiSuccess<PropostaResumo[]>>("/api/v1/proposals", {
        signal: controller.signal,
      })
      .then((res) => {
        if (!controller.signal.aborted) setPropostas(ordenarParaRevisao(res.data));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setErro(true);
        showApiError(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregando(false);
      });

    return () => controller.abort();
  }, [tentativa]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("Propostas")}</h1>
        {podeCriar ? (
          <Button asChild>
            <Link href="/app/proposals/novo">{t("Nova proposta")}</Link>
          </Button>
        ) : null}
      </header>

      {carregando ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("Carregando…")}
        </p>
      ) : erro ? (
        <div role="alert" className="space-y-3 rounded-lg border p-4">
          <p className="text-sm">{t("Falha ao listar propostas.")}</p>
          <Button
            variant="outline"
            onClick={() => {
              setErro(false);
              setCarregando(true);
              setTentativa((atual) => atual + 1);
            }}
          >
            {t("Tentar novamente")}
          </Button>
        </div>
      ) : propostas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("Nenhuma proposta cadastrada ainda.")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow className="border-b text-left">
                <TableHead scope="col" className="p-3">{t("Número")}</TableHead>
                <TableHead scope="col" className="p-3">{t("Título")}</TableHead>
                <TableHead scope="col" className="p-3">{t("Status")}</TableHead>
                <TableHead scope="col" className="p-3 text-right">{t("Valor")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y">
              {propostas.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap p-3">
                    {p.numero !== null && p.ano !== null
                      ? `${String(p.numero).padStart(4, "0")}/${p.ano} v${p.versao}`
                      : t("Rascunho")}
                  </TableCell>
                  <TableCell className="p-3">
                    <Link href={`/app/proposals/${p.id}`} className="underline underline-offset-4">
                      {p.titulo}
                    </Link>
                  </TableCell>
                  <TableCell className="p-3">
                    {aguardaRevisao(p) ? (
                      <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                        {t("Aguardando revisão")}
                      </span>
                    ) : (
                      statusLabels[p.status]
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap p-3 text-right tabular-nums">
                    {formatCents(p.total_cents, p.moeda)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
