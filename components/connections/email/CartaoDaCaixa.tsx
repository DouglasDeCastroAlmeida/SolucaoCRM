"use client";
import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

/**
 * Uma caixa de e-mail em Conexões (mudança 005, REQ-008): estado, limites e assinatura PRÓPRIOS
 * da caixa, e os três gestos que ela aceita — pausar, retomar e configurar.
 *
 * "Remover caixa" confirma antes e arquiva a caixa: a leitura e o envio param, a senha guardada é
 * apagada e as conversas e mensagens ficam. Conectar o mesmo endereço de novo traz a caixa de volta.
 *
 * O estado mostrado vem do servidor (`pausada`, `pausa_motivo`); a tela nunca o adivinha. Caixa
 * parada por senha recusada não tem "Retomar": retomar sem a senha nova só a faria parar de novo.
 */

export interface CaixaDaTela {
  id: string;
  endereco: string;
  status: string | null;
  imap: { host: string; porta: number };
  smtp: { host: string; porta: number };
  senha_ultimos4: string;
  assinatura: string | null;
  teto_diario: number;
  intervalo_segundos: number;
  pausada?: boolean;
  pausa_motivo?: string | null;
}

const ROTA = "/api/v1/channels/email";

function mensagemDeErro(erro: unknown, padrao: string): string {
  return erro instanceof Error && erro.message ? erro.message : padrao;
}

export function CartaoDaCaixa({ caixa, onMudou }: { caixa: CaixaDaTela; onMudou: () => void }) {
  const t = useT();
  const [ocupada, setOcupada] = useState(false);
  const [editando, setEditando] = useState(false);
  const [assinatura, setAssinatura] = useState(caixa.assinatura ?? "");
  const [teto, setTeto] = useState(String(caixa.teto_diario));
  const [intervalo, setIntervalo] = useState(String(caixa.intervalo_segundos));
  const [senha, setSenha] = useState("");
  const [removendo, setRemovendo] = useState(false);

  const pausada = Boolean(caixa.pausada);
  const porSenha = caixa.pausa_motivo === "senha_recusada" || caixa.pausa_motivo === "senha_ausente";

  async function alterar(corpo: Record<string, unknown>, sucesso: string): Promise<boolean> {
    setOcupada(true);
    try {
      await apiClient.patch(`${ROTA}/${caixa.id}`, corpo);
      toast.success(sucesso);
      onMudou();
      return true;
    } catch (erro) {
      toast.error(mensagemDeErro(erro, t("Não foi possível salvar a caixa agora. Tente de novo.")));
      return false;
    } finally {
      setOcupada(false);
    }
  }

  async function salvar() {
    const corpo: Record<string, unknown> = {
      assinatura: assinatura.trim() ? assinatura : null,
      teto_diario: Number(teto),
      intervalo_segundos: Number(intervalo),
    };
    if (senha) corpo.senha = senha;
    if (await alterar(corpo, t("Caixa atualizada."))) {
      setSenha("");
      setEditando(false);
    }
  }

  async function remover() {
    setRemovendo(false);
    setOcupada(true);
    try {
      await apiClient.delete(`${ROTA}/${caixa.id}`);
      toast.success(t("Caixa removida."));
      onMudou();
    } catch (erro) {
      toast.error(mensagemDeErro(erro, t("Não foi possível remover a caixa agora. Tente de novo.")));
    } finally {
      setOcupada(false);
    }
  }

  return (
    <Card className="flex flex-col gap-2 p-4" data-testid="caixa-email">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{caixa.endereco}</h3>
          <p className="text-xs text-muted-foreground">
            {t("Leitura")}: {caixa.imap.host}:{caixa.imap.porta} · {t("Envio")}: {caixa.smtp.host}:{caixa.smtp.porta}
          </p>
        </div>
        <Badge variant={pausada ? "outline" : "secondary"}>
          {porSenha ? t("Senha recusada") : pausada ? t("Pausada") : caixa.status === "WORKING" ? t("Conectada") : (caixa.status ?? "—")}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("Senha")}: {caixa.senha_ultimos4 ? `••••${caixa.senha_ultimos4}` : "••••"} · {t("Limite por dia")}: {caixa.teto_diario} ·{" "}
        {t("Intervalo entre envios")}: {caixa.intervalo_segundos} s
      </p>
      <p className="text-xs text-muted-foreground">
        {t("Assinatura")}: {caixa.assinatura ? caixa.assinatura : t("nenhuma")}
      </p>

      {pausada && (
        <p role="status" className="text-xs">
          {porSenha
            ? t("A leitura e o envio estão parados porque a senha foi recusada. Informe a senha nova em Configurar para voltar.")
            : t("A leitura e o envio estão parados e as conversas ficam como estão. Ao retomar, a caixa continua de onde parou.")}
        </p>
      )}

      {editando && (
        <div className="flex flex-col gap-3 rounded-md border p-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`assinatura-${caixa.id}`}>{t("Assinatura")}</Label>
            <Textarea id={`assinatura-${caixa.id}`} value={assinatura} onChange={(e) => setAssinatura(e.target.value)} maxLength={2000} />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`teto-${caixa.id}`}>{t("Limite por dia")}</Label>
              <Input id={`teto-${caixa.id}`} type="number" min={1} max={2000} value={teto} onChange={(e) => setTeto(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`intervalo-${caixa.id}`}>{t("Intervalo entre envios (segundos)")}</Label>
              <Input id={`intervalo-${caixa.id}`} type="number" min={0} max={3600} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`senha-${caixa.id}`}>{t("Senha nova (deixe vazio para manter)")}</Label>
            <Input
              id={`senha-${caixa.id}`}
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={ocupada} onClick={() => void salvar()}>
              {t("Salvar")}
            </Button>
            <Button size="sm" variant="ghost" disabled={ocupada} onClick={() => setEditando(false)}>
              {t("Cancelar")}
            </Button>
          </div>
        </div>
      )}

      {!editando && (
        <div className="flex gap-2">
          {!pausada && (
            <Button size="sm" variant="outline" disabled={ocupada} onClick={() => void alterar({ pausada: true }, t("Caixa pausada."))}>
              {t("Pausar")}
            </Button>
          )}
          {pausada && !porSenha && (
            <Button size="sm" variant="outline" disabled={ocupada} onClick={() => void alterar({ pausada: false }, t("Caixa retomada."))}>
              {t("Retomar")}
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={ocupada} onClick={() => setEditando(true)}>
            {t("Configurar")}
          </Button>
          <Button size="sm" variant="ghost" disabled={ocupada} onClick={() => setRemovendo(true)}>
            {t("Remover caixa")}
          </Button>
        </div>
      )}

      <AlertDialog open={removendo} onOpenChange={setRemovendo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Remover esta caixa de e-mail?")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2">
                <strong>{caixa.endereco}</strong>
                <span>{t("O sistema para de ler e de enviar e-mails por esta caixa.")}</span>
                <span>{t("As conversas e as mensagens continuam no sistema.")}</span>
                <span>{t("A senha guardada é apagada.")}</span>
                <span>{t("Para voltar, conecte a caixa de novo com a senha.")}</span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remover()}>{t("Remover a caixa")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
