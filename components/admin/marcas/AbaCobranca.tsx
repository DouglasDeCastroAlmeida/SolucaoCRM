"use client";

/**
 * Cobrança da marca (mudança 003, AC-009.1 e AC-001.3): os planos cobráveis
 * (`cobranca_planos` da marca, ADR-002) e a chave que liga o teste com cartão.
 *
 * Fala só com /api/v1/admin/brands/{id}/cobranca e /planos-cobranca. Ligar sem
 * o que é preciso é recusado pelo SERVIDOR; a tela só explica, em palavras
 * simples, o que falta (a lista vem da própria rota).
 */
import { useCallback, useEffect, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { chamar, Erro } from "./comum";

type Plano = {
  id: string;
  nome: string;
  preco_cents: number;
  moeda: string;
  intervalo: "mes" | "ano";
  trial_dias: number;
  padrao_no_cadastro: boolean;
  arquivado_em: string | null;
};
type Situacao = { cobranca_ligada: boolean; faltam: string[] };

/** "149,90" -> 14990. Devolve null se não for um valor em reais válido. */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}

function formatarPreco(cents: number, moeda: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(cents / 100);
}

function centavosParaReais(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function AbaCobranca({ marcaId, marcaNome }: { marcaId: string; marcaNome: string }) {
  const t = useT();
  const base = `/api/v1/admin/brands/${marcaId}`;
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [erroChave, setErroChave] = useState<string | null>(null);
  const [mudandoChave, setMudandoChave] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [intervalo, setIntervalo] = useState<"mes" | "ano">("mes");
  const [testeDias, setTesteDias] = useState("7");
  const [padrao, setPadrao] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroPlano, setErroPlano] = useState<string | null>(null);

  // O texto de cada falta é fixo e passa por t(): a rota devolve só o código.
  const FALTAS: Record<string, string> = {
    modulo: t("A cobrança da instalação está desligada. Ligue-a em Sistema."),
    plano: t("Cadastre ao menos um plano com preço para esta marca."),
    plano_padrao: t("Marque um dos planos como o plano do cadastro."),
    provedor: t("Escolha o provedor de pagamento em Cobrança, no painel da instalação."),
    chave: t("Cole a chave do provedor de pagamento em Cobrança, no painel da instalação."),
    provedor_sem_trial: t("O provedor de pagamento escolhido não faz teste com cartão. Use o Asaas."),
  };

  const carregar = useCallback(async () => {
    const [p, s] = await Promise.all([chamar(`${base}/planos-cobranca`, "GET"), chamar(`${base}/cobranca`, "GET")]);
    if (p.ok && Array.isArray(p.data)) setPlanos(p.data as Plano[]);
    if (s.ok && s.data) setSituacao(s.data as Situacao);
  }, [base]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function limpar() {
    setEditando(null);
    setNome("");
    setPreco("");
    setIntervalo("mes");
    setTesteDias("7");
    setPadrao(false);
  }

  async function trocarChave() {
    if (mudandoChave || !situacao) return;
    setMudandoChave(true);
    setErroChave(null);
    const r = await chamar(`${base}/cobranca`, "PATCH", { cobranca_ligada: !situacao.cobranca_ligada });
    setMudandoChave(false);
    if (!r.ok) setErroChave(r.erro ?? null);
    await carregar();
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const centavos = reaisParaCentavos(preco);
    if (centavos === null) return setErroPlano(t("Informe o preço em reais, por exemplo 149,90."));
    const dias = Number(testeDias);
    if (!Number.isInteger(dias) || dias < 0 || dias > 90) return setErroPlano(t("Os dias de teste vão de 0 a 90."));
    setEnviando(true);
    setErroPlano(null);
    const campos = { nome: nome.trim(), preco_cents: centavos, intervalo, trial_dias: dias, padrao_no_cadastro: padrao };
    const r = editando
      ? await chamar(`${base}/planos-cobranca`, "PATCH", { plan_id: editando, ...campos })
      : await chamar(`${base}/planos-cobranca`, "POST", campos);
    setEnviando(false);
    if (!r.ok) return setErroPlano(r.erro ?? null);
    limpar();
    await carregar();
  }

  async function arquivar(p: Plano) {
    setErroPlano(null);
    const r = await chamar(`${base}/planos-cobranca`, "PATCH", { plan_id: p.id, arquivado: p.arquivado_em === null });
    if (!r.ok) return setErroPlano(r.erro ?? null);
    await carregar();
  }

  function editar(p: Plano) {
    setEditando(p.id);
    setNome(p.nome);
    setPreco(centavosParaReais(p.preco_cents));
    setIntervalo(p.intervalo);
    setTesteDias(String(p.trial_dias));
    setPadrao(p.padrao_no_cadastro);
  }

  const ligada = situacao?.cobranca_ligada ?? false;
  const faltam = situacao?.faltam ?? [];
  const id = (c: string) => `${c}-${marcaId}`;

  return (
    <section aria-label={t("Cobrança")} className="space-y-4">
      <h3 className="font-medium">{t("Cobrança")}</h3>

      <div className="space-y-2 rounded-md border p-3">
        <p className="text-sm">
          {ligada ? t("A cobrança desta marca está ligada.") : t("A cobrança desta marca está desligada.")}
        </p>
        {!ligada && faltam.length > 0 && (
          <div role="status" className="space-y-1 text-sm text-muted-foreground">
            <p>{t("Para ligar, falta:")}</p>
            <ul className="list-disc pl-5">
              {faltam.map((f) => (
                <li key={f}>{FALTAS[f] ?? f}</li>
              ))}
            </ul>
          </div>
        )}
        {ligada && (
          <p className="text-xs text-muted-foreground">
            {t("Desligar não cancela nem apaga as assinaturas que já existem.")}
          </p>
        )}
        <Button
          type="button"
          variant={ligada ? "outline" : "default"}
          className="min-h-11 sm:min-h-9"
          disabled={mudandoChave || situacao === null}
          aria-label={ligada ? `${t("Desligar cobrança")} ${marcaNome}` : `${t("Ligar cobrança")} ${marcaNome}`}
          onClick={() => void trocarChave()}
        >
          {ligada ? t("Desligar cobrança") : t("Ligar cobrança")}
        </Button>
        <Erro texto={erroChave} />
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">{t("Planos")}</h4>
        <ul className="space-y-1 text-sm">
          {planos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2">
              <span>{p.nome}</span>
              <span>
                — {formatarPreco(p.preco_cents, p.moeda)} / {p.intervalo === "ano" ? t("ano") : t("mês")}
              </span>
              {p.padrao_no_cadastro && <span className="text-xs text-muted-foreground">{t("Plano do cadastro")}</span>}
              {p.arquivado_em !== null && <span className="text-xs text-muted-foreground">{t("Arquivado")}</span>}
              <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-8" aria-label={`${t("Editar plano")} ${p.nome}`} onClick={() => editar(p)}>
                {t("Editar")}
              </Button>
              <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-8" aria-label={`${p.arquivado_em === null ? t("Arquivar plano") : t("Reativar plano")} ${p.nome}`} onClick={() => void arquivar(p)}>
                {p.arquivado_em === null ? t("Arquivar") : t("Reativar")}
              </Button>
            </li>
          ))}
        </ul>

        <form onSubmit={salvar} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={id("plano-nome")}>{t("Nome do plano")}</Label>
            <Input id={id("plano-nome")} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={id("plano-preco")}>{t("Preço (R$)")}</Label>
            <Input id={id("plano-preco")} value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={id("plano-intervalo")}>{t("Cobrado a cada")}</Label>
            <select
              id={id("plano-intervalo")}
              value={intervalo}
              onChange={(e) => setIntervalo(e.target.value as "mes" | "ano")}
              className="h-11 rounded-md border bg-background px-2 text-sm sm:h-9"
            >
              <option value="mes">{t("mês")}</option>
              <option value="ano">{t("ano")}</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={id("plano-teste")}>{t("Dias de teste")}</Label>
            <Input id={id("plano-teste")} value={testeDias} onChange={(e) => setTesteDias(e.target.value)} inputMode="numeric" />
          </div>
          <div className="flex items-center gap-2">
            <input id={id("plano-padrao")} type="checkbox" checked={padrao} onChange={(e) => setPadrao(e.target.checked)} />
            <Label htmlFor={id("plano-padrao")}>{t("Plano do cadastro")}</Label>
          </div>
          <Button type="submit" className="min-h-11 sm:min-h-9" disabled={enviando || nome.trim() === ""}>
            {t("Salvar plano")}
          </Button>
          {editando && (
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={limpar}>
              {t("Cancelar edição")}
            </Button>
          )}
        </form>
        <p className="text-xs text-muted-foreground">{t("Salvar um plano não cria nenhuma cobrança.")}</p>
        <Erro texto={erroPlano} />
      </div>
    </section>
  );
}
