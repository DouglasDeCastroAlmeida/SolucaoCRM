"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinhaDeLista } from "@/components/ui/linha-de-lista";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCases, type CaseListItem } from "@/hooks/ai/useCases";
import { STATUS_BADGE_VARIANT, STATUS_LABEL, tipoDeCasoLabel } from "@/lib/ai/case-copy";
import { CaretLeft, Robot } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";
import { CaseDetail } from "./CaseDetail";

export function CaseList() {
  const t = useT();
  const [tab, setTab] = useState<"open" | "resolved">("open");
  // Deep link: o aviso "um atendimento espera decisão" na Central manda para cá
  // com o id do caso. Sem isto ele abriria a LISTA, e quem clicou teria que
  // caçar de qual caso o aviso falava — um aviso que não leva ao seu assunto é
  // meio aviso. Só o valor INICIAL: clicar na lista continua mandando, e a URL
  // não vira estado a sincronizar.
  // `?.` porque o hook devolve null fora de um contexto de navegação (o que
  // acontece em teste e em render estático). Sem a guarda, a tela inteira
  // quebra com "Cannot read properties of null".
  const idDaUrl = useSearchParams()?.get("caso") ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(idDaUrl);
  const { data, isLoading } = useCases(tab);

  return (
    <div className="flex min-h-0 flex-1 gap-6">
      {/* No celular, lista OU painel (nunca os dois lado a lado); de md para cima, os dois. */}
      <div
        className={cn(
          "w-full max-w-xs shrink-0 flex-col gap-4 max-md:max-w-none",
          selectedId === null ? "flex" : "hidden md:flex",
        )}
      >
        <Tabs value={tab} onValueChange={(v) => setTab(v as "open" | "resolved")}>
          <TabsList>
            <TabsTrigger value="open">{t("Abertos")}{data ? ` (${data.open_count})` : ""}</TabsTrigger>
            <TabsTrigger value="resolved">{t("Concluídos")}</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !data || data.cases.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
            <Robot size={28} className="text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">
              {tab === "open" ? t("Nenhum caso aberto") : t("Nenhum caso concluído")}
            </p>
            <p className="text-xs text-muted-foreground">
              {tab === "open"
                ? t("Quando a IA precisar de você, aparece aqui.")
                : t("Casos concluídos, cancelados ou repassados ficam aqui.")}
            </p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-border">
            {data.cases.map((c) => (
              <CaseRow
                key={c.id}
                item={c}
                selected={c.id === selectedId}
                onSelect={() => setSelectedId(c.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className={cn("min-w-0 flex-1", selectedId === null ? "hidden md:block" : "block")}>
        {selectedId !== null ? (
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 min-h-11 md:hidden"
            onClick={() => setSelectedId(null)}
          >
            <CaretLeft size={14} aria-hidden />
            {t("Voltar aos casos")}
          </Button>
        ) : null}
        <CaseDetail caseId={selectedId} />
      </div>
    </div>
  );
}

function CaseRow({
  item,
  selected,
  onSelect,
}: {
  item: CaseListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const when = formatDistanceToNowStrict(new Date(item.opened_at), { addSuffix: true, locale: localeDaData });
  return (
    <LinhaDeLista
      testId="case-item"
      avatar={{ nome: item.contact_name ?? item.title }}
      titulo={item.title}
      direita={
        <>
          <Badge variant={STATUS_BADGE_VARIANT[item.status]} className="shrink-0">
            {t(STATUS_LABEL[item.status])}
          </Badge>
          <span>{when}</span>
        </>
      }
      previa={
        // O assunto vem ANTES do nome: quem tria a fila decide por ele, e o
        // nome só importa depois de escolher o caso.
        <span className="truncate">
          {t(tipoDeCasoLabel(item.kind))} · {item.contact_name ?? t("Contato sem nome")}
        </span>
      }
      selecionado={selected}
      ariaCurrent={selected}
      onClick={onSelect}
    />
  );
}
