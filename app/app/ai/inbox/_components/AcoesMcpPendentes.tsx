"use client";

/**
 * As ações de servidor MCP externo que esperam uma pessoa, dentro do aviso da Central
 * (mudança 006, AC-007.3). O aviso só guarda a conversa; a lista vem de
 * `GET /api/v1/mcp-acoes?conversa_id=` e a decisão vai para `POST /api/v1/mcp-acoes/:id`.
 *
 * Os dados do pedido (argumentos) não saem do servidor: a tela mostra só servidor, ferramenta e
 * há quanto tempo foi pedida, e diz isso. Quem decide é gerente ou admin; a página só monta este
 * cartão para esses papéis (a rota recusa os outros de qualquer jeito).
 */
import { formatDistanceToNowStrict } from "date-fns";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";

interface Acao {
  id: string;
  servidor: { nome: string; slug: string } | null;
  ferramenta: string;
  criado_em: string;
}

const MENSAGEM_DO_ERRO: Record<string, string> = {
  state_conflict: "Essa ação já foi decidida por outra pessoa.",
  not_found: "Essa ação não foi encontrada. Ela pode já ter sido decidida.",
  forbidden_role: "Só gerente ou administrador pode aprovar ou recusar.",
  mfa_required: "Esta ação exige a verificação em duas etapas. Entre novamente com o código do aplicativo.",
};
const ERRO_GENERICO = "Não foi possível registrar a decisão agora. Tente de novo em instantes.";

interface Props {
  conversaId: string;
  /** Chamado depois de cada decisão: a Central relê a própria lista (o aviso pode ter mudado). */
  aoDecidir?: () => void;
}

export function AcoesMcpPendentes({ conversaId, aoDecidir }: Props) {
  const t = useT();
  const localeDaData = useLocaleDeData();
  const [acoes, setAcoes] = useState<Acao[] | null>(null);
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [listaFalhou, setListaFalhou] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await apiClient.get<{ data: Acao[] }>(`/api/v1/mcp-acoes?conversa_id=${conversaId}`);
      setAcoes(r.data);
      setListaFalhou(false);
    } catch {
      setAcoes([]);
      setListaFalhou(true);
    }
  }, [conversaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function decidir(acao: Acao, decisao: "aprovar" | "recusar") {
    setErro(null);
    setResultado(null);
    setDecidindo(acao.id);
    try {
      const r = await apiClient.post<{ data: { estado: string } }>(`/api/v1/mcp-acoes/${acao.id}`, { decisao });
      if (r.data.estado === "falhou") {
        setErro(t("A aprovação foi registrada, mas o servidor externo não conseguiu executar a ação."));
      } else {
        setResultado(
          decisao === "aprovar" ? t("Pronto: a ação foi aprovada e executada.") : t("A ação foi recusada e não será executada."),
        );
      }
    } catch (err) {
      setErro(t(err instanceof ApiError ? (MENSAGEM_DO_ERRO[err.code] ?? ERRO_GENERICO) : ERRO_GENERICO));
    } finally {
      setDecidindo(null);
      await carregar();
      aoDecidir?.();
    }
  }

  const pendentes = acoes ?? [];
  if (pendentes.length === 0 && !resultado && !erro && !listaFalhou) return null;

  return (
    <div className="mt-2 space-y-2 rounded-md border border-border bg-muted/30 p-3" data-testid="acoes-mcp-pendentes">
      {pendentes.map((a) => {
        const nome = `${a.servidor?.nome ?? t("Servidor externo")} — ${a.ferramenta}`;
        return (
          <div key={a.id} className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{nome}</p>
              <p className="text-xs text-muted-foreground">
                {t("Pedida há {tempo}").replace(
                  "{tempo}",
                  formatDistanceToNowStrict(new Date(a.criado_em), { locale: localeDaData }),
                )}
              </p>
            </div>
            <Button
              size="sm"
              disabled={decidindo !== null}
              aria-label={t("Aprovar {nome}").replace("{nome}", a.ferramenta)}
              onClick={() => void decidir(a, "aprovar")}
            >
              {decidindo === a.id ? t("Enviando…") : t("Aprovar")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={decidindo !== null}
              aria-label={t("Recusar {nome}").replace("{nome}", a.ferramenta)}
              onClick={() => void decidir(a, "recusar")}
            >
              {t("Recusar")}
            </Button>
          </div>
        );
      })}
      {pendentes.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("Os dados do pedido não aparecem aqui, por privacidade. A ação roda exatamente com o que o assistente pediu.")}
        </p>
      ) : null}
      {resultado ? (
        <p role="status" className="text-sm">
          {resultado}
        </p>
      ) : null}
      {listaFalhou ? (
        <p role="alert" className="text-sm text-destructive">
          {t("Não foi possível carregar as ações. Recarregue a página.")}
        </p>
      ) : null}
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
