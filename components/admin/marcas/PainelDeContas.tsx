"use client";

/**
 * Contas de todas as marcas (AC-008.5): filtro por marca, troca de marca pela
 * rota /api/v1/admin/organizations/{id}/brand e acesso de suporte pelo fluxo
 * existente (ImpersonateButton -> tenants/[id]/impersonate).
 */
import { useCallback, useEffect, useState } from "react";

import { ImpersonateButton } from "@/components/admin/ImpersonateButton";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { chamar, Erro } from "./comum";

type MarcaResumo = { id: string; name: string };
type Conta = {
  id: string;
  name: string;
  slug?: string;
  brand_id: string | null;
  brands?: { name: string } | Array<{ name: string }> | null;
};

function nomeDaMarca(c: Conta): string {
  const b = Array.isArray(c.brands) ? c.brands[0] : c.brands;
  return b?.name ?? "Marca padrão";
}

function LinhaDeConta({ conta, marcas, aoTrocar }: { conta: Conta; marcas: MarcaResumo[]; aoTrocar: (id: string, brandId: string) => Promise<void> }) {
  const t = useT();
  const [destino, setDestino] = useState(conta.brand_id ?? "");
  return (
    <tr className="border-t">
      <td>{conta.name}</td>
      <td>{nomeDaMarca(conta)}</td>
      <td className="space-x-2">
        <Label htmlFor={`troca-${conta.id}`} className="sr-only">
          {`Nova marca de ${conta.name}`}
        </Label>
        <select
          id={`troca-${conta.id}`}
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
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
          aria-label={`Trocar marca de ${conta.name}`}
          disabled={destino === "" || destino === conta.brand_id}
          onClick={() => void aoTrocar(conta.id, destino)}
        >
          Trocar marca
        </Button>
      </td>
      <td>
        <ImpersonateButton organizationId={conta.id} displayName={conta.name} />
      </td>
    </tr>
  );
}

export function PainelDeContas() {
  const t = useT();
  const [contas, setContas] = useState<Conta[]>([]);
  const [marcas, setMarcas] = useState<MarcaResumo[]>([]);
  const [filtro, setFiltro] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (brandId: string) => {
    const url = "/api/v1/admin/organizations" + (brandId ? `?brand_id=${encodeURIComponent(brandId)}` : "");
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

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="filtro-marca">Filtrar por marca</Label>
        <select
          id="filtro-marca"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">{t("Todas as marcas")}</option>
          {marcas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <Erro texto={erro} />
      <table className="w-full text-sm">
        <caption className="sr-only">{t("Contas de todas as marcas")}</caption>
        <thead>
          <tr className="text-left">
            <th scope="col">Conta</th>
            <th scope="col">Marca</th>
            <th scope="col">Trocar marca</th>
            <th scope="col">Suporte</th>
          </tr>
        </thead>
        <tbody>
          {contas.map((c) => (
            <LinhaDeConta key={`${c.id}-${c.brand_id ?? ""}`} conta={c} marcas={marcas} aoTrocar={trocar} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
