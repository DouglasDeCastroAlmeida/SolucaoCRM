"use client";

/**
 * As ferramentas de UM servidor MCP externo, ligadas e desligadas por agente
 * (mudança 006, REQ-007; AC-007.2 e AC-007.4).
 *
 * - Ligar edita o RASCUNHO do agente (a versão publicada é imutável): vale ao publicar. A tela diz isso.
 * - "Pode rodar sem aprovação" existe só para ferramenta de ESCRITA, só tem efeito com o agente em
 *   modo automático e fica atrás de um diálogo de aviso; a confirmação segue no corpo da chamada.
 * - "Atualizar ferramentas" é o clique do admin que adota o que o servidor anuncia agora e mostra o
 *   que mudou. Ferramenta nova nasce desligada.
 *
 * Nome e descrição de ferramenta vêm do servidor remoto: dado de terceiro, sem `t()`.
 */
import { useCallback, useEffect, useRef, useState } from "react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";

interface Props {
  servidorId: string;
  nome: string;
  ativo: boolean;
}

interface Agente {
  id: string;
  name: string;
}

interface Ferramenta {
  nome: string;
  descricao?: string;
  somente_leitura: boolean;
  ligada: boolean;
  marca: "leitura" | "escrita" | null;
  liberada_sem_aprovacao: boolean;
}

interface Mudancas {
  novas: string[];
  removidas: string[];
  alteradas: string[];
  /** Ferramentas que perderam o "pode rodar sem aprovação" por terem mudado ou sumido. */
  voltaramAPedirAprovacao: string[];
}

const MENSAGEM_DO_ERRO: Record<string, string> = {
  mcp_sem_rascunho: "Este agente não tem um rascunho. Abra o agente e crie uma nova versão para ligar ferramentas.",
  state_conflict: "Este servidor está desativado. Reative-o antes de ligar ferramentas.",
  not_found: "Não encontramos o servidor, o agente ou a ferramenta. Atualize a lista e tente de novo.",
  validation_failed: "Não foi possível aplicar esta mudança. O agente pode já estar com o máximo de ferramentas.",
  mcp_servidor_invalido: "Não foi possível falar com o servidor. Confira se ele está no ar e tente de novo.",
  forbidden_role: "Você não tem permissão para esta ação.",
  mfa_required: "Esta ação exige a verificação em duas etapas. Entre novamente com o código do aplicativo.",
};
const ERRO_GENERICO = "Não foi possível concluir agora. Tente de novo em instantes.";

export function FerramentasDoServidor({ servidorId, nome, ativo }: Props) {
  const t = useT();
  const [agentes, setAgentes] = useState<Agente[] | null>(null);
  const [agenteId, setAgenteId] = useState("");
  const [lista, setLista] = useState<Ferramenta[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mexendo, setMexendo] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [mudancas, setMudancas] = useState<Mudancas | null>(null);
  // Número do último pedido de lista: uma resposta que chega depois de o admin trocar de agente
  // (ou de fechar o painel) não é a lista que ele está olhando e é descartada.
  const pedidoAtual = useRef(0);

  useEffect(
    () => () => {
      pedidoAtual.current += 1;
    },
    [],
  );

  const mensagem = useCallback(
    (err: unknown) => t(err instanceof ApiError ? (MENSAGEM_DO_ERRO[err.code] ?? ERRO_GENERICO) : ERRO_GENERICO),
    [t],
  );

  useEffect(() => {
    let vivo = true;
    apiClient
      .get<{ data: Agente[] }>("/api/v1/ai/agents")
      .then((r) => vivo && setAgentes(r.data))
      .catch((err: unknown) => {
        if (vivo) {
          setAgentes([]);
          setErro(mensagem(err));
        }
      });
    return () => {
      vivo = false;
    };
  }, [mensagem]);

  const carregar = useCallback(
    async (id: string) => {
      const meu = ++pedidoAtual.current;
      try {
        const r = await apiClient.get<{ data: { ferramentas: Ferramenta[] } }>(
          `/api/v1/mcp-servidores/${servidorId}/ferramentas?agente_id=${id}`,
        );
        if (meu !== pedidoAtual.current) return;
        setLista(r.data.ferramentas);
        setErro(null);
      } catch (err) {
        if (meu !== pedidoAtual.current) return;
        setLista(null);
        setErro(mensagem(err));
      }
    },
    [servidorId, mensagem],
  );

  function escolherAgente(id: string) {
    pedidoAtual.current += 1;
    setAgenteId(id);
    setLista(null);
    setErro(null);
    if (id) void carregar(id);
  }

  async function alterar(ferramenta: string, corpo: Record<string, unknown>) {
    setErro(null);
    setMexendo(ferramenta);
    try {
      await apiClient.patch(`/api/v1/mcp-servidores/${servidorId}/ferramentas`, {
        ...corpo,
        agente_id: agenteId,
        ferramenta,
      });
      await carregar(agenteId);
    } catch (err) {
      setErro(mensagem(err));
    } finally {
      setMexendo(null);
    }
  }

  function ligarOuDesligar(f: Ferramenta, ligar: boolean) {
    void alterar(
      f.nome,
      ligar ? { acao: "ligar", marca: f.somente_leitura ? "leitura" : "escrita" } : { acao: "desligar" },
    );
  }

  function aoMudarSemAprovacao(f: Ferramenta, liberar: boolean) {
    if (liberar) setConfirmando(f.nome);
    else void alterar(f.nome, { acao: "exigir_aprovacao" });
  }

  async function atualizar() {
    setErro(null);
    setMudancas(null);
    setAtualizando(true);
    try {
      const r = await apiClient.post<{
        data: {
          mudancas: Omit<Mudancas, "voltaramAPedirAprovacao">;
          voltaram_a_pedir_aprovacao?: string[];
        };
      }>(`/api/v1/mcp-servidores/${servidorId}/atualizar-ferramentas`, {});
      setMudancas({ ...r.data.mudancas, voltaramAPedirAprovacao: r.data.voltaram_a_pedir_aprovacao ?? [] });
      if (agenteId) await carregar(agenteId);
    } catch (err) {
      setErro(mensagem(err));
    } finally {
      setAtualizando(false);
    }
  }

  const semMudanca = mudancas && !mudancas.novas.length && !mudancas.removidas.length && !mudancas.alteradas.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Ferramentas de {nome}").replace("{nome}", nome)}</CardTitle>
        <CardDescription>
          {t("Todas nascem desligadas. Escolha um agente e ligue só as ferramentas que ele pode usar.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-48 flex-col gap-1.5">
            <Label htmlFor={`agente-${servidorId}`}>{t("Agente")}</Label>
            <select
              id={`agente-${servidorId}`}
              value={agenteId}
              onChange={(e) => escolherAgente(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{agentes === null ? t("Carregando…") : t("Escolha um agente")}</option>
              {(agentes ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" disabled={atualizando} onClick={() => void atualizar()}>
            {atualizando ? t("Atualizando…") : t("Atualizar ferramentas")}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("Ligar ou desligar muda o rascunho do agente e só vale quando você publicar o agente.")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(
            "Já a opção de rodar sem aprovação vale na hora, mas só com o agente no modo automático, e só para ferramenta que já está ligada.",
          )}
        </p>
        {!ativo ? (
          <p className="text-xs text-muted-foreground">
            {t("Este servidor está desativado: reative-o para ligar ferramentas.")}
          </p>
        ) : null}

        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}

        {mudancas ? (
          <div data-testid="mudancas" role="status" className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            {semMudanca ? (
              <p>{t("A lista de ferramentas do servidor continua a mesma.")}</p>
            ) : (
              <>
                <p className="font-medium">{t("O servidor mudou desde a última atualização:")}</p>
                <ul className="mt-1 list-disc pl-5">
                  {mudancas.novas.length ? (
                    <li>
                      {t("Novas")}: {mudancas.novas.join(", ")}
                    </li>
                  ) : null}
                  {mudancas.removidas.length ? (
                    <li>
                      {t("Removidas")}: {mudancas.removidas.join(", ")}
                    </li>
                  ) : null}
                  {mudancas.alteradas.length ? (
                    <li>
                      {t("Alteradas")}: {mudancas.alteradas.join(", ")}
                    </li>
                  ) : null}
                </ul>
                {mudancas.voltaramAPedirAprovacao.length ? (
                  <p className="mt-2 font-medium">
                    {t("Voltaram a pedir aprovação")}: {mudancas.voltaramAPedirAprovacao.join(", ")}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("As ferramentas novas ficam desligadas em todos os agentes até você ligá-las.")}
                </p>
              </>
            )}
          </div>
        ) : null}

        {agenteId && lista ? (
          lista.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Este servidor não anunciou nenhuma ferramenta.")}</p>
          ) : (
            <Table>
              <TableCaption className="sr-only">{t("Ferramentas do servidor para o agente escolhido")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t("Ferramenta")}</TableHead>
                  <TableHead scope="col">{t("Tipo")}</TableHead>
                  <TableHead scope="col">{t("Ligada neste agente")}</TableHead>
                  <TableHead scope="col">{t("Pode rodar sem aprovação")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((f) => (
                  <TableRow key={f.nome}>
                    <TableCell>
                      <code className="font-medium">{f.nome}</code>
                      {f.descricao ? <span className="block text-xs text-muted-foreground">{f.descricao}</span> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={f.somente_leitura ? "info" : "warning"}>
                        {f.somente_leitura ? t("Leitura") : t("Escrita")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={f.ligada}
                        disabled={mexendo === f.nome || (!ativo && !f.ligada)}
                        aria-label={t("Ligar {nome}").replace("{nome}", f.nome)}
                        onCheckedChange={(v) => ligarOuDesligar(f, v)}
                      />
                    </TableCell>
                    <TableCell>
                      {f.somente_leitura ? (
                        <span className="text-xs text-muted-foreground">{t("Leitura roda sem aprovação")}</span>
                      ) : (
                        <Switch
                          checked={f.liberada_sem_aprovacao}
                          disabled={
                            mexendo === f.nome ||
                            // Só se marca com a ferramenta ligada; marca antiga de ferramenta desligada ainda pode ser tirada.
                            ((!f.ligada || !ativo) && !f.liberada_sem_aprovacao)
                          }
                          aria-label={t("Deixar {nome} rodar sem aprovação").replace("{nome}", f.nome)}
                          onCheckedChange={(v) => aoMudarSemAprovacao(f, v)}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        ) : null}
      </CardContent>

      <AlertDialog open={confirmando !== null} onOpenChange={(aberto) => !aberto && setConfirmando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Deixar esta ferramenta rodar sem aprovação?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "O agente fará esta ação sozinho, sem que uma pessoa confira antes. Isso vale só quando o agente está no modo automático. No modo de aprovar antes de enviar, a ação continua esperando uma pessoa. Use apenas se você confia no que esta ferramenta faz.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const alvo = confirmando;
                setConfirmando(null);
                if (alvo) void alterar(alvo, { acao: "liberar_sem_aprovacao", confirmar_sem_aprovacao: true });
              }}
            >
              {t("Entendi o risco, liberar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
