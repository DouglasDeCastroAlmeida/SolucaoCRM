"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

import { AssistenteDeConexao } from "./email/AssistenteDeConexao";
import { CartaoDaCaixa, type CaixaDaTela } from "./email/CartaoDaCaixa";

/**
 * Aba "E-mail" de Conexões (mudança 005): as caixas conectadas e o assistente para conectar
 * outra. Cada caixa tem estado, limite e assinatura próprios e pode ser pausada e retomada.
 *
 * A senha nunca chega aqui: a API devolve só os 4 últimos caracteres.
 */

const ROTA = "/api/v1/channels/email";

export function CanalEmailClient() {
  const t = useT();
  const qc = useQueryClient();
  const [assistenteAberto, setAssistenteAberto] = useState(false);

  const { data: caixas = [], isLoading, error } = useQuery({
    queryKey: ["canal-email"],
    queryFn: async () => (await apiClient.get<{ data: { caixas: CaixaDaTela[] } }>(ROTA)).data.caixas,
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
        <CartaoDaCaixa
          key={caixa.id}
          caixa={caixa}
          onMudou={() => void qc.invalidateQueries({ queryKey: ["canal-email"] })}
        />
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
