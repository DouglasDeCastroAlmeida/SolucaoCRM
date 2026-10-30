"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinhaDeLista } from "@/components/ui/linha-de-lista";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAgentInbox,
  useResolveAllInboxItems,
  useUpdateInboxItem,
  type AgentInboxItem,
} from "@/hooks/ai/useAgentInbox";
import { kindLabel, SEVERITY_LABEL, type AgentInboxSeverity } from "@/lib/ai/agent-inbox-copy";
import { linkDePagamentoSeguro } from "@/lib/cobranca/link";
import { Bell, Check } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { ApiError } from "@/lib/api/types";
import { AcoesMcpPendentes } from "./AcoesMcpPendentes";

const SEVERITY_VARIANT: Record<AgentInboxSeverity, "info" | "warning" | "error"> = {
  info: "info",
  warn: "warning",
  critical: "error",
};

export function AgentInboxList({ canResolve, canDecideMcp = false }: { canResolve: boolean; canDecideMcp?: boolean }) {
  const t = useT();
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const { data: cachedData, error, isLoading, isError, refetch, isFetching } = useAgentInbox(tab);
  const acessoNegado = error instanceof ApiError && (error.status === 401 || error.status === 403);
  const data = acessoNegado ? undefined : cachedData;
  const update = useUpdateInboxItem();
  const resolveAll = useResolveAllInboxItems();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "open" | "resolved")}>
          <TabsList>
            <TabsTrigger value="open">
              {t("Abertos")}{data ? ` (${data.open_count})` : ""}
            </TabsTrigger>
            <TabsTrigger value="resolved">{t("Resolvidos")}</TabsTrigger>
          </TabsList>
        </Tabs>
        {canResolve && tab === "open" && data && data.items.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            disabled={resolveAll.isPending}
            onClick={() => resolveAll.mutate()}
          >
            <Check size={14} aria-hidden />
            {t("Marcar todos resolvidos")}
          </Button>
        ) : null}
      </div>

      {isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4 text-sm">
          <p className="min-w-0 flex-1">{t(acessoNegado ? "Seu acesso aos avisos não está disponível. Confira sua sessão e tente novamente." : data ? "Não foi possível atualizar os avisos. A lista abaixo pode estar desatualizada." : "Não foi possível carregar os avisos. Tente novamente.")}</p>
          <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>{t("Tentar novamente")}</Button>
        </div>
      ) : null}
      {update.isError ? <p role="alert" className="text-sm text-destructive">{t("Não foi possível atualizar este aviso. Tente novamente.")}</p> : null}
      {/* O lote pode falhar depois de resolver PARTE dos avisos: a mensagem manda
          conferir a lista em vez de afirmar que nada mudou. Sem isto o clique em
          "Marcar todos resolvidos" não deixaria rastro nenhum quando errasse. */}
      {resolveAll.isError ? <p role="alert" className="text-sm text-destructive">{t("Não foi possível resolver todos os avisos. Confira a lista e tente novamente.")}</p> : null}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError && !data ? null : !data || data.items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
          <Bell size={28} className="text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">
            {tab === "open" ? t("Nenhum aviso em aberto") : t("Nenhum aviso resolvido")}
          </p>
          <p className="text-xs text-muted-foreground">
            {tab === "open"
              ? t("Quando o assistente precisar de você, o aviso aparece aqui.")
              : t("Avisos que você marcar como resolvidos ficam aqui.")}
          </p>
        </div>
      ) : (
        <>
        {tab === "open" ? (
          <p className="-mb-2 text-xs text-muted-foreground">
            {t("Os mais graves primeiro; entre iguais, os mais recentes.")}
          </p>
        ) : null}
        <ul className="overflow-hidden rounded-lg border border-border">
          {data.items.map((item) => (
            <InboxRow
              key={item.id}
              item={item}
              canResolve={canResolve}
              canDecideMcp={canDecideMcp}
              pending={update.isPending}
              onToggle={(status) => update.mutate({ id: item.id, status })}
              onDecidirAcaoMcp={() => void refetch()}
            />
          ))}
        </ul>
        </>
      )}
    </div>
  );
}

function InboxRow({
  item,
  canResolve,
  canDecideMcp,
  pending,
  onToggle,
  onDecidirAcaoMcp,
}: {
  item: AgentInboxItem;
  canResolve: boolean;
  canDecideMcp: boolean;
  pending: boolean;
  onToggle: (status: "open" | "resolved") => void;
  onDecidirAcaoMcp: () => void;
}) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const when = formatDistanceToNowStrict(new Date(item.created_at), {
    addSuffix: true,
    locale: localeDaData,
  });
  return (
    <LinhaDeLista
      testId="inbox-item"
      avatar={{ nome: kindLabel(item.kind, t) }}
      /* TÍTULO E CORPO SAEM COMO VIERAM — nunca por t().
         São LINHAS de `agent_inbox_items`, escritas pelo runtime no momento do
         evento e recheadas com dado de gente: nome do cliente, número, motivo do
         handoff, o que o operador cadastrou. É a mesma regra que já vale para nome
         de funil, rótulo de etapa e conteúdo de mensagem — e a mesma que o PR #600
         aplicou à Agenda. Passar isso pelo dicionário não traduz nada (a chave é a
         frase inteira, que nunca casa) e, quando casa, troca a palavra que a pessoa
         cadastrou por outra que ela não sabe procurar.
         O que continua traduzido é o que é NOSSO: severidade, rótulo do kind,
         orientação e rótulo do destino. */
      titulo={<span className="whitespace-normal break-words">{item.title}</span>}
      direita={
        <>
          <Badge variant={SEVERITY_VARIANT[item.severity]} className="shrink-0">
            {t(SEVERITY_LABEL[item.severity])}
          </Badge>
          <span>{when}</span>
        </>
      }
      previa={
        <>
          <span className="w-full">{kindLabel(item.kind, t)}</span>
          {item.body ? <span className="w-full break-words">{item.body}</span> : null}
          {item.destination.orientacao ? (
            <span className="w-full break-words">{t(item.destination.orientacao)}</span>
          ) : null}
          {canDecideMcp && item.kind === "acao_mcp_pendente" && item.status !== "resolved" && item.ref_kind === "conversation" && item.ref_id ? (
            <div className="w-full">
              <AcoesMcpPendentes conversaId={item.ref_id} aoDecidir={onDecidirAcaoMcp} />
            </div>
          ) : null}
          {item.destination.estado === "disponivel" ? (
            <Button asChild size="sm" variant="link" className="h-auto whitespace-normal px-0 text-left max-sm:min-h-11">
              <Link href={item.destination.href}>{t(item.destination.rotulo)}</Link>
            </Button>
          ) : null}
          {linkDePagamentoSeguro(item.link_de_pagamento) ? (
            <Button asChild size="sm" className="max-sm:min-h-11">
              <a href={linkDePagamentoSeguro(item.link_de_pagamento) ?? undefined} target="_blank" rel="noopener noreferrer">
                {t("Pagar agora")}
              </a>
            </Button>
          ) : null}
        </>
      }
    >
      {canResolve ? (
        item.status === "resolved" ? (
          <Button size="sm" variant="ghost" className="max-sm:min-h-11" disabled={pending} onClick={() => onToggle("open")}>
            {t("Reabrir")}
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="max-sm:min-h-11" disabled={pending} onClick={() => onToggle("resolved")}>
            <Check size={14} aria-hidden />
            {t("Marcar resolvido")}
          </Button>
        )
      ) : null}
    </LinhaDeLista>
  );
}
