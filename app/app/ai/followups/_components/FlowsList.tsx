"use client";

import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";

import { useT } from "@/hooks/i18n/useT";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LinhaDeLista } from "@/components/ui/linha-de-lista";
import { FlowArrow, Plus, Sparkle, UploadSimple } from "@/lib/ui/icons";
import { useFollowupFlows, type FollowupFlowPointerRow } from "@/hooks/followup/useFollowupFlows";
import type { FollowupFlowSurface } from "@/lib/followup/api-schemas";
import { DeleteFollowupFlowButton } from "./DeleteFollowupFlowButton";
import { DuplicateFollowupFlowButton } from "./DuplicateFollowupFlowButton";
import { ExportFollowupFlowButton } from "./ExportFollowupFlowButton";
import { FlowStatusBadge } from "./FlowStatusBadge";
import { ImportFlowDialog } from "./ImportFlowDialog";
import { ModelosDialog } from "./ModelosDialog";
import { NewFlowDialog } from "./NewFlowDialog";
import { RenameFollowupFlowButton } from "./RenameFollowupFlowButton";

interface Props {
  initialData: FollowupFlowPointerRow[];
  canWrite: boolean;
  /** Recorte por superfície. Ausente = todos (comportamento atual). */
  surface?: FollowupFlowSurface;
}

function formatUpdatedAt(iso: string, idioma: string): string {
  return new Date(iso).toLocaleDateString(idioma, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * A política de handoff em palavra de gente, para o cartão da lista (#3104).
 *
 * A coluna mostrava o valor CRU do banco (`pause`, `cancel`, `allow`) ao lado
 * de «Handoff» — com o perfil em espanhol, «Transferencia: pause». O `value`
 * gravado continua o mesmo; o seletor da barra de publicação mantém as frases
 * longas dele («Pausar durante handoff»), porque ali há espaço para explicar.
 */
const HANDOFF_EM_PALAVRA: Record<string, string> = {
  pause: "Pausar",
  cancel: "Cancelar",
  allow: "Permitir",
};

export function FlowsList({ initialData, canWrite, surface }: Props) {
  const tagDoIdioma = useTagDeIdioma();
  const t = useT();
  const { data } = useFollowupFlows({ initialData, ...(surface ? { surface } : {}) });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [modelosOpen, setModelosOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const deAtendimento = surface === "atendimento";

  const flows = data ?? [];
  // Cada superfície tem a SUA rota de editor: abrir um fluxo de atendimento não
  // pode jogar o usuário na lista de Follow-ups.
  const baseHref = deAtendimento ? "/app/ai/atendimento" : "/app/ai/followups";

  // ⚠️ "Começar de um modelo" vem ANTES de "Novo fluxo", e na tela vazia é o
  // botão cheio. Quem chega aqui numa instalação nova não sabe o que é nó, ramo
  // ou prazo de graça — mandá-lo para uma tela em branco é o caminho mais curto
  // para a clínica nunca ter follow-up nenhum. Desenhar do zero continua a um
  // clique, para quem já sabe o que quer.
  const modelosButton = (
    <Button onClick={() => setModelosOpen(true)} className="w-full sm:w-auto">
      <Sparkle size={14} aria-hidden className="mr-2" /> {t("Começar de um modelo")}
    </Button>
  );

  const newFlowButton = (
    <Button
      onClick={() => setDialogOpen(true)}
      variant={deAtendimento ? "default" : "outline"}
      className="w-full sm:w-auto"
    >
      <Plus size={14} aria-hidden className="mr-2" />
      {deAtendimento ? t("Novo fluxo de atendimento") : t("Novo fluxo")}
    </Button>
  );

  // Importar fica ao lado de "Novo fluxo", sempre como botão secundário: é o
  // caminho de quem JÁ tem um fluxo pronto (exportado aqui ou em outra conta).
  const importButton = (
    <Button
      onClick={() => setImportOpen(true)}
      variant="outline"
      className="w-full sm:w-auto"
      data-testid="import-followup-flow"
    >
      <UploadSimple size={14} aria-hidden className="mr-2" /> {t("Importar fluxo")}
    </Button>
  );

  const dialogos = canWrite && (
    <>
      <NewFlowDialog open={dialogOpen} onOpenChange={setDialogOpen} surface={surface} />
      <ImportFlowDialog open={importOpen} onOpenChange={setImportOpen} baseHref={baseHref} />
      {!deAtendimento && (
        <ModelosDialog
          open={modelosOpen}
          onOpenChange={setModelosOpen}
          nomesExistentes={flows.map((f) => f.name)}
        />
      )}
    </>
  );

  if (flows.length === 0) {
    return (
      <>
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <FlowArrow size={36} aria-hidden className="text-text-muted" />
          <h2 className="font-medium">
            {deAtendimento ? t("Nenhum fluxo de atendimento ainda") : t("Nenhum fluxo de follow-up ainda")}
          </h2>
          <p className="max-w-sm text-sm text-text-muted">
            {deAtendimento
              ? t(
                  "Os fluxos de atendimento cadastram as perguntas que a IA faz durante a conversa e o que acontece ao concluir — os dados ficam guardados por cliente.",
                )
              : t(
                  "Follow-ups reengajam contatos após silêncio, mudança de etapa, uma regra em Webhooks ou a resposta do contato — sem depender de alguém lembrar de mandar mensagem.",
                )}
          </p>
          {canWrite && (
            <div className="mt-1 flex flex-col items-center gap-2 sm:flex-row">
              {!deAtendimento && modelosButton}
              {newFlowButton}
              {importButton}
            </div>
          )}
        </Card>
        {dialogos}
      </>
    );
  }

  // Os diálogos ficam no MESMO lugar da árvore nos dois ramos — segundo filho do fragmento.
  // Dentro da <div> deste ramo, a primeira importação (a lista vai de 0 para 1) remontava o diálogo e o
  // resultado sumia: o que resolver antes de publicar e o link « Abrir o fluxo » nunca apareciam.
  return (
    <>
    <div className="flex flex-col gap-4">
      {canWrite && (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {!deAtendimento && modelosButton}
          {newFlowButton}
          {importButton}
        </div>
      )}

      <ul className="overflow-hidden rounded-lg border border-border">
        {flows.map((flow) => (
          <LinhaDeLista
            key={flow.id}
            avatar={{ nome: flow.name }}
            titulo={<span title={flow.name}>{flow.name}</span>}
            direita={<FlowStatusBadge status={flow.status} />}
            previa={
              <>
                <span>
                  <span>{t("Versão")}</span>: <span className="font-mono">{flow.active_version_id ? t("publicada") : "—"}</span>
                </span>
                <span>
                  <span>{t("Handoff")}</span>:{" "}
                  <span className="font-mono">
                    {t(HANDOFF_EM_PALAVRA[flow.handoff_policy] ?? flow.handoff_policy)}
                  </span>
                </span>
                <span>
                  {t("Atualizado em")} {formatUpdatedAt(flow.updated_at, tagDoIdioma)}
                </span>
              </>
            }
            href={`${baseHref}/${flow.id}`}
          >
            {canWrite && (
              <div className="flex flex-wrap gap-2 max-sm:[&_button]:min-h-11 max-sm:[&_button]:min-w-11 sm:justify-end">
                <RenameFollowupFlowButton flowId={flow.id} flowName={flow.name} />
                <DuplicateFollowupFlowButton flowId={flow.id} />
                <ExportFollowupFlowButton flowId={flow.id} />
                <DeleteFollowupFlowButton flowId={flow.id} flowName={flow.name} listHref={baseHref} />
              </div>
            )}
          </LinhaDeLista>
        ))}
      </ul>
    </div>
    {dialogos}
    </>
  );
}
