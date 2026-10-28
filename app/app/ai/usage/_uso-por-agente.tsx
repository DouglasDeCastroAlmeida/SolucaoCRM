"use client";
/**
 * Tokens, custo e teto do mês, por agente e no total (mudança 006, AC-004.4).
 *
 * Só apresenta: os números vêm de `carregarUsoDoPeriodo` (banco). Quando o custo
 * é estimativa (modelo sem preço conhecido), a palavra "estimado" aparece ao lado
 * do valor e uma nota explica que nunca é preço real (AC-004.6). Cores só por
 * token do tema, nunca hex.
 */
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/hooks/i18n/useT";
import type { LinhaDeUsoDoPeriodo, UsoDoPeriodo } from "@/lib/ai/orcamento/uso-por-agente";
import { formatCentsUSD } from "@/lib/money";

/** Custo por agente costuma ser de centavos: com 4 casas não vira US$ 0,00. */
function dolar(cents: number): string {
  return cents !== 0 && Math.abs(cents) < 1
    ? (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 4 })
    : formatCentsUSD(cents);
}

function ParteDoTeto({ custoCents, tetoCents }: { custoCents: number; tetoCents: number | null }) {
  if (tetoCents === null) return <span className="text-muted-foreground">-</span>;
  const pct = Math.round((custoCents / tetoCents) * 100);
  return <span>{pct.toLocaleString("pt-BR")}%</span>;
}

export function UsoPorAgente({ uso, semProtecao = false }: { uso: UsoDoPeriodo; semProtecao?: boolean }) {
  const t = useT();
  const marcaEstimado = (l: LinhaDeUsoDoPeriodo) =>
    l.estimado ? (
      <Badge variant="outline" className="ml-2 align-middle">
        {t("estimado")}
      </Badge>
    ) : null;
  const algumEstimado = uso.total.estimado || uso.porAgente.some((a) => a.estimado);

  return (
    <Card className="flex flex-col gap-4 p-4" data-testid="uso-por-agente">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{t("Uso do mês por agente")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Tokens usados e custo de cada agente neste mês, comparados ao teto do mês.")}
        </p>
        <p className="text-sm" data-testid="uso-teto">
          {uso.tetoCents === null
            ? t("Sem teto definido para o mês.")
            : `${t("Teto do mês:")} ${formatCentsUSD(uso.tetoCents)}`}
        </p>
      </header>

      {semProtecao && (
        <p
          role="status"
          className="rounded-md border bg-muted p-3 text-sm text-foreground"
          data-testid="uso-sem-teto"
        >
          {t(
            "Esta organização está sem teto de gasto: a IA não para sozinha por gasto. Defina um limite e escolha parar ao chegar nele no cartão de orçamento, acima.",
          )}
        </p>
      )}

      {uso.porAgente.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("Nenhum agente criado ainda. Quando houver, o uso de cada um aparece aqui.")}
        </p>
      ) : (
        <Table>
          <TableCaption className="sr-only">
            {t("Tokens e custo do mês, um agente por linha, com o total no fim.")}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("Agente")}</TableHead>
              <TableHead scope="col" className="text-right">
                {t("Tokens")}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t("Custo")}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t("Parte do teto")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {uso.porAgente.map((a) => (
              <TableRow key={a.agentId ?? a.nome} data-testid={`uso-agente-${a.agentId}`}>
                <TableCell>{a.nome}</TableCell>
                <TableCell className="text-right">{a.tokens.toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-right">
                  {dolar(a.custoCents)}
                  {marcaEstimado(a)}
                </TableCell>
                <TableCell className="text-right">
                  <ParteDoTeto custoCents={a.custoCents} tetoCents={uso.tetoCents} />
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold" data-testid="uso-total">
              <TableCell>{t("Total")}</TableCell>
              <TableCell className="text-right">{uso.total.tokens.toLocaleString("pt-BR")}</TableCell>
              <TableCell className="text-right">
                {dolar(uso.total.custoCents)}
                {marcaEstimado(uso.total)}
              </TableCell>
              <TableCell className="text-right">
                <ParteDoTeto custoCents={uso.total.custoCents} tetoCents={uso.tetoCents} />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}

      {algumEstimado && (
        <p className="text-xs text-muted-foreground" data-testid="uso-nota-estimado">
          {uso.possivelmenteEstimado
            ? t("Pode incluir estimativa: não foi possível conferir todos os modelos usados neste mês, então o custo pode ter parte estimada. Estimado nunca é um preço real.")
            : t(
            "Estimado: o provedor ou o modelo não informa o preço, então o custo é uma estimativa acima do provável, nunca um preço real.",
          )}
        </p>
      )}
    </Card>
  );
}
