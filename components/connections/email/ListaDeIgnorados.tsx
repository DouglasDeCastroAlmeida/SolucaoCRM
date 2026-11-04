"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

/**
 * E-mails que a leitura deixou de transformar em conversa (mudança 005, AC-003.3 e AC-003.4).
 *
 * Por caixa: remetente, assunto, data e o motivo em português simples. Duas saídas por e-mail:
 * "Abrir como conversa" (relê o e-mail e o promove; se o remetente tinha sido marcado como "não
 * é cliente", a marca cai junto) e "Não é cliente" (os próximos e-mails dele são deixados de
 * fora e as conversas de e-mail dele são arquivadas). A lista só guarda o cabeçalho, por 30 dias.
 */

const ROTA = "/api/v1/channels/email";
const QUERY_KEY = ["canal-email-ignorados"] as const;

interface Ignorado {
  id: string;
  caixa_id: string;
  remetente: string;
  assunto: string | null;
  recebido_em: string;
  motivo: string;
}

const ENDERECO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mensagemDeErro(erro: unknown, padrao: string): string {
  return erro instanceof Error && erro.message ? erro.message : padrao;
}

export function ListaDeIgnorados({ caixas }: { caixas: Array<{ id: string; endereco: string }> }) {
  const t = useT();
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<Ignorado | null>(null);

  const { data: ignorados = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await apiClient.get<{ data: { ignorados?: Ignorado[] } }>(`${ROTA}/ignorados`)).data.ignorados ?? [],
  });

  const motivo = (m: string): string => {
    switch (m) {
      case "lista_de_inscricao":
        return t("Parece uma lista de inscrição ou newsletter.");
      case "envio_em_massa":
        return t("Parece um envio em massa, como propaganda.");
      case "resposta_automatica":
        return t("É uma resposta automática (por exemplo, de férias).");
      case "no_reply":
        return t("Vem de um endereço que não recebe resposta (no-reply).");
      case "falha_de_entrega":
        return t("É um aviso de que um e-mail não foi entregue.");
      case "propria_caixa":
        return t("Foi enviado pela própria caixa.");
      case "nao_e_cliente":
        return t("Você marcou como não é cliente.");
      case "malformado":
      case "ilegivel":
        return t("Não foi possível ler este e-mail.");
      default:
        return t("Não virou conversa.");
    }
  };

  async function recarregar() {
    await qc.invalidateQueries({ queryKey: QUERY_KEY });
    // marcar "não é cliente" arquiva conversas e promover cria uma: o inbox lê de outra consulta
    await qc.invalidateQueries({ queryKey: ["conversations"] });
  }

  async function abrirComoConversa(item: Ignorado) {
    setOcupado(item.id);
    try {
      await apiClient.post(`${ROTA}/ignorados/${item.id}/promover`, {});
      toast.success(t("E-mail aberto como conversa."));
      await recarregar();
    } catch (e) {
      toast.error(mensagemDeErro(e, t("Não foi possível abrir este e-mail como conversa agora. Tente de novo.")));
    } finally {
      setOcupado(null);
    }
  }

  async function naoECliente(item: Ignorado) {
    setConfirmando(null);
    setOcupado(item.id);
    try {
      await apiClient.post(`${ROTA}/remetentes`, { endereco: item.remetente });
      toast.success(t("Pronto. Os próximos e-mails dessa pessoa serão deixados de fora."));
      await recarregar();
    } catch (e) {
      toast.error(mensagemDeErro(e, t("Não foi possível salvar agora. Tente de novo.")));
    } finally {
      setOcupado(null);
    }
  }

  const nosCartoes = ignorados.filter((i) => caixas.some((c) => c.id === i.caixa_id));

  return (
    <section className="flex flex-col gap-3" data-testid="ignorados-email">
      <div>
        <h3 className="text-sm font-semibold">{t("E-mails que não viraram conversa")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("Propaganda, respostas automáticas e avisos ficam aqui por 30 dias, só com remetente, assunto e data. Se algum for de um cliente de verdade, abra como conversa.")}
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {mensagemDeErro(error, t("Não foi possível carregar os e-mails deixados de fora."))}
        </div>
      )}

      {!error && !isLoading && nosCartoes.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("Nenhum e-mail foi deixado de fora nos últimos 30 dias.")}</p>
      )}

      {caixas.map((caixa) => {
        const itens = nosCartoes.filter((i) => i.caixa_id === caixa.id);
        if (itens.length === 0) return null;
        return (
          <div key={caixa.id} className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold text-muted-foreground">{caixa.endereco}</h4>
            {itens.map((item) => (
              <Card key={item.id} className="flex flex-col gap-2 p-3" data-testid="ignorado">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.remetente}</p>
                    <p className="truncate text-sm">{item.assunto ? item.assunto : t("(sem assunto)")}</p>
                  </div>
                  <time className="text-xs text-muted-foreground" dateTime={item.recebido_em}>
                    {new Date(item.recebido_em).toLocaleString()}
                  </time>
                </div>
                <p className="text-xs text-muted-foreground">{motivo(item.motivo)}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={ocupado !== null} onClick={() => void abrirComoConversa(item)}>
                    {t("Abrir como conversa")}
                  </Button>
                  {item.motivo !== "nao_e_cliente" && ENDERECO.test(item.remetente) && (
                    <Button size="sm" variant="ghost" disabled={ocupado !== null} onClick={() => setConfirmando(item)}>
                      {t("Não é cliente")}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        );
      })}

      <AlertDialog open={confirmando !== null} onOpenChange={(aberto) => !aberto && setConfirmando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Marcar esta pessoa como não é cliente?")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2">
                <strong>{confirmando?.remetente}</strong>
                <span>{t("Os próximos e-mails dessa pessoa serão deixados de fora e não viram conversa. As conversas de e-mail dela serão arquivadas. Nada é apagado.")}</span>
                <span>{t("Para desfazer, use Abrir como conversa em um e-mail dela nesta lista.")}</span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmando && void naoECliente(confirmando)}>
              {t("Marcar como não é cliente")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
