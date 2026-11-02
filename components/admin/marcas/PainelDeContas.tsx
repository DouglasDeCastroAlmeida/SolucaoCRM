"use client";

/**
 * Contas de todas as marcas (AC-008.5; mudança 003, AC-009.2 e AC-009.3):
 * filtro por marca (servidor) e por estado de cobrança (tela), detalhes com
 * plano, datas e link do Asaas, conversão de cortesia em cobrada, troca de
 * marca pela rota /api/v1/admin/organizations/{id}/brand e acesso de suporte
 * pelo fluxo existente (ImpersonateButton -> tenants/[id]/impersonate).
 */
import { useCallback, useEffect, useState } from "react";

import { ImpersonateButton } from "@/components/admin/ImpersonateButton";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { chamar, Erro } from "./comum";

type MarcaResumo = { id: string; name: string };
type EstadoDaConta = "cortesia" | "trial" | "ativa" | "em_atraso" | "suspensa" | "cancelada";
type Cobranca = {
  estado: EstadoDaConta;
  plano: string | null;
  trial_ate: string | null;
  proximo_vencimento: string | null;
  link_asaas: string | null;
};
type Conta = {
  id: string;
  name: string;
  slug?: string;
  brand_id: string | null;
  brands?: { name: string } | Array<{ name: string }> | null;
  cobranca?: Cobranca;
};

const ROTULO_DO_ESTADO: Record<EstadoDaConta, string> = {
  cortesia: "Cortesia",
  trial: "Em teste",
  ativa: "Ativa",
  em_atraso: "Atrasada",
  suspensa: "Suspensa",
  cancelada: "Cancelada",
};
const ESTADOS = Object.keys(ROTULO_DO_ESTADO) as EstadoDaConta[];
const CAMPO = "h-11 rounded-md border bg-background px-2 text-sm md:h-9";
const TOQUE = "min-h-11 md:min-h-8";

function nomeDaMarca(c: Conta): string {
  const b = Array.isArray(c.brands) ? c.brands[0] : c.brands;
  return b?.name ?? "Marca padrão";
}

function data(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function Detalhes({ conta, cobranca }: { conta: Conta; cobranca: Cobranca }) {
  const t = useT();
  return (
    <div role="group" aria-label={`${t("Detalhes de")} ${conta.name}`} className="mt-2 space-y-1 rounded-md border p-3 text-sm">
      <p>
        <span className="text-muted-foreground">{t("Plano")}: </span>
        <span>{cobranca.plano ?? "—"}</span>
      </p>
      <p>
        <span className="text-muted-foreground">{t("Estado")}: </span>
        <span>{t(ROTULO_DO_ESTADO[cobranca.estado])}</span>
      </p>
      <p>
        <span className="text-muted-foreground">{t("Teste até")}: </span>
        <span>{data(cobranca.trial_ate)}</span>
      </p>
      <p>
        <span className="text-muted-foreground">{t("Próximo vencimento")}: </span>
        <span>{data(cobranca.proximo_vencimento)}</span>
      </p>
      {cobranca.link_asaas ? (
        <p>
          <a
            href={cobranca.link_asaas}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center underline md:min-h-8"
          >
            {t("Abrir cobrança no Asaas")}
          </a>
        </p>
      ) : null}
    </div>
  );
}

function LinhaDeConta({
  conta,
  marcas,
  aoTrocar,
  aoConverter,
}: {
  conta: Conta;
  marcas: MarcaResumo[];
  aoTrocar: (id: string, brandId: string) => Promise<void>;
  aoConverter: (id: string) => Promise<void>;
}) {
  const t = useT();
  const [destino, setDestino] = useState(conta.brand_id ?? "");
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const cobranca = conta.cobranca;
  return (
    <tr className="block border-t py-2 md:table-row">
      <td className="block py-1 md:table-cell">
        <span className="font-medium">{conta.name}</span>
        {cobranca ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`ml-2 ${TOQUE}`}
              aria-expanded={aberto}
              aria-label={`${t("Detalhes de")} ${conta.name}`}
              onClick={() => setAberto((v) => !v)}
            >
              {t("Detalhes")}
            </Button>
            {aberto ? <Detalhes conta={conta} cobranca={cobranca} /> : null}
          </>
        ) : null}
      </td>
      <td className="block py-1 md:table-cell">{nomeDaMarca(conta)}</td>
      <td className="block py-1 md:table-cell">{cobranca ? t(ROTULO_DO_ESTADO[cobranca.estado]) : "—"}</td>
      <td className="block space-x-2 py-1 md:table-cell">
        <Label htmlFor={`troca-${conta.id}`} className="sr-only">
          {`${t("Nova marca de")} ${conta.name}`}
        </Label>
        <select id={`troca-${conta.id}`} value={destino} onChange={(e) => setDestino(e.target.value)} className={CAMPO}>
          <option value="">{t("Escolha a marca")}</option>
          {marcas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={TOQUE}
          aria-label={`${t("Trocar marca de")} ${conta.name}`}
          disabled={destino === "" || destino === conta.brand_id}
          onClick={() => void aoTrocar(conta.id, destino)}
        >
          {t("Trocar marca")}
        </Button>
      </td>
      <td className="block space-x-2 py-1 md:table-cell">
        <ImpersonateButton organizationId={conta.id} displayName={conta.name} />
        {cobranca?.estado === "cortesia" ? (
          confirmando ? (
            <>
              <span className="text-sm">{t("Converter esta conta em cobrada? Ela fica suspensa até o cartão.")}</span>
              <Button
                type="button"
                size="sm"
                className={TOQUE}
                aria-label={`${t("Confirmar conversão")} ${conta.name}`}
                onClick={() => {
                  setConfirmando(false);
                  void aoConverter(conta.id);
                }}
              >
                {t("Confirmar conversão")}
              </Button>
              <Button type="button" variant="outline" size="sm" className={TOQUE} onClick={() => setConfirmando(false)}>
                {t("Cancelar")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={TOQUE}
              aria-label={`${t("Converter em cobrada")} ${conta.name}`}
              onClick={() => setConfirmando(true)}
            >
              {t("Converter em cobrada")}
            </Button>
          )
        ) : null}
      </td>
    </tr>
  );
}

export function PainelDeContas() {
  const t = useT();
  const [contas, setContas] = useState<Conta[]>([]);
  const [marcas, setMarcas] = useState<MarcaResumo[]>([]);
  const [filtro, setFiltro] = useState("");
  const [estado, setEstado] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (brandId: string) => {
    const url = "/api/v1/admin/organizations?" + (brandId ? `brand_id=${encodeURIComponent(brandId)}&` : "") + "limit=200";
    const r = await chamar(url, "GET");
    if (!r.ok) return setErro(r.erro ?? null);
    setContas(Array.isArray(r.data) ? (r.data as Conta[]) : []);
  }, []);

  useEffect(() => {
    void chamar("/api/v1/admin/brands", "GET").then((r) => {
      if (r.ok && Array.isArray(r.data)) setMarcas(r.data as MarcaResumo[]);
    });
  }, []);

  useEffect(() => {
    void carregar(filtro);
  }, [carregar, filtro]);

  async function trocar(orgId: string, brandId: string) {
    setErro(null);
    const r = await chamar(`/api/v1/admin/organizations/${orgId}/brand`, "PATCH", { brand_id: brandId });
    if (!r.ok) return setErro(r.erro ?? null);
    void carregar(filtro);
  }

  async function converter(orgId: string) {
    setErro(null);
    const r = await chamar(`/api/v1/admin/cobranca/organizacoes/${orgId}/converter`, "POST");
    if (!r.ok) {
      if (r.status === 404) return setErro(t("A conta não foi encontrada."));
      if (r.status === 409) return setErro(t("Esta conta já tem cobrança, ou a marca dela não cobra."));
      if (r.status === 422) return setErro(t("A marca desta conta não tem plano padrão para cobrar."));
      return setErro(r.erro ?? t("Não foi possível converter a conta."));
    }
    void carregar(filtro);
  }

  const visiveis = estado ? contas.filter((c) => c.cobranca?.estado === estado) : contas;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <Label htmlFor="filtro-marca">{t("Filtrar por marca")}</Label>
          <select id="filtro-marca" value={filtro} onChange={(e) => setFiltro(e.target.value)} className={`block ${CAMPO}`}>
            <option value="">{t("Todas as marcas")}</option>
            {marcas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="filtro-estado">{t("Filtrar por estado")}</Label>
          <select id="filtro-estado" value={estado} onChange={(e) => setEstado(e.target.value)} className={`block ${CAMPO}`}>
            <option value="">{t("Todos os estados")}</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {t(ROTULO_DO_ESTADO[e])}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Erro texto={erro} />
      <table className="w-full text-sm">
        <caption className="sr-only">{t("Contas de todas as marcas")}</caption>
        <thead className="sr-only md:table-header-group">
          <tr className="text-left">
            <th scope="col">{t("Conta")}</th>
            <th scope="col">{t("Marca")}</th>
            <th scope="col">{t("Estado")}</th>
            <th scope="col">{t("Trocar marca")}</th>
            <th scope="col">{t("Suporte")}</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((c) => (
            <LinhaDeConta key={`${c.id}-${c.brand_id ?? ""}`} conta={c} marcas={marcas} aoTrocar={trocar} aoConverter={converter} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
