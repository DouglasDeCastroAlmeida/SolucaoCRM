"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

import { AssistenteDeConexao } from "./email/AssistenteDeConexao";

/**
 * Aba "E-mail" de Conexões (mudança 005): as caixas conectadas e o assistente para conectar
 * outra. Pausar, retomar e editar a caixa entram na Fatia 6.
 *
 * A senha nunca chega aqui: a API devolve só os 4 últimos caracteres.
 */

const ROTA = "/api/v1/channels/email";

interface Caixa {
  id: string;
  endereco: string;
  status: string | null;
  usuario: string;
  imap: { host: string; porta: number };
  smtp: { host: string; porta: number };
  senha_ultimos4: string;
  assinatura: string | null;
  teto_diario: number;
  intervalo_segundos: number;
}

export function CanalEmailClient() {
  const t = useT();
  const qc = useQueryClient();
  const [assistenteAberto, setAssistenteAberto] = useState(false);

  const { data: caixas = [], isLoading, error } = useQuery({
    queryKey: ["canal-email"],
    queryFn: async () => (await apiClient.get<{ data: { caixas: Caixa[] } }>(ROTA)).data.caixas,
  });

  // Sem nenhuma caixa, o assistente já abre: é a única coisa que dá para fazer aqui.
  const mostrarAssistente = assistenteAberto || (!isLoading && !error && caixas.length === 0);

  return (
    <div className="flex flex-col gap-4" data-testid="canal-email">
      {error && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error instanceof Error && error.message ? error.message : t("Não foi possível carregar as caixas de e-mail.")}
        </div>
      )}

      {caixas.map((caixa) => (
        <Card key={caixa.id} className="flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{caixa.endereco}</h3>
              <p className="text-xs text-muted-foreground">
                {t("Leitura")}: {caixa.imap.host}:{caixa.imap.porta} · {t("Envio")}: {caixa.smtp.host}:{caixa.smtp.porta}
              </p>
            </div>
            <Badge variant="secondary">{caixa.status === "WORKING" ? t("Conectada") : (caixa.status ?? "—")}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("Senha")}: {caixa.senha_ultimos4 ? `••••${caixa.senha_ultimos4}` : "••••"} ·{" "}
            {t("Limite por dia")}: {caixa.teto_diario}
          </p>
        </Card>
      ))}

      {mostrarAssistente ? (
        <AssistenteDeConexao
          onConectada={() => {
            setAssistenteAberto(false);
            void qc.invalidateQueries({ queryKey: ["canal-email"] });
          }}
        />
      ) : (
        <div>
          <Button variant="outline" onClick={() => setAssistenteAberto(true)}>
            {t("Conectar outra caixa")}
          </Button>
        </div>
      )}
    </div>
  );
}
