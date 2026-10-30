import * as React from "react";
import Link from "next/link";

import { Check } from "@/lib/ui/icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * Linha de lista no desenho da lista de conversas (009, ADR-003): avatar à
 * esquerda, título e prévia no meio, situação ou horário à direita.
 *
 * Apresentação pura: sem estado, sem busca de dados. Quem usa continua dono dos
 * seus dados e handlers. A caixa de seleção e as ações (`children`) ficam FORA
 * do alvo principal (link ou botão): controle dentro de link é HTML inválido, e
 * marcar ou agir não pode abrir o item.
 *
 * Renderiza um `<li>`: o pai deve ser um `<ul>` (ou `role="list"`).
 */

export interface AvatarDaLinha {
  nome: string;
  imagem?: string | null;
}

export interface LinhaDeListaProps {
  avatar: AvatarDaLinha;
  titulo: React.ReactNode;
  previa?: React.ReactNode;
  direita?: React.ReactNode;
  selecionado?: boolean;
  /** Presente = a linha ganha a caixa de seleção. */
  onSelecionar?: () => void;
  /** Nome acessível da caixa de seleção. */
  rotuloDaSelecao?: string;
  testIdDaSelecao?: string;
  /** Caixa de seleção presente mas travada (sem permissão ou ação em curso). */
  selecaoDesabilitada?: boolean;
  /** `data-testid` do item (`<li>`). */
  testId?: string;
  /** Marca o alvo principal como o item corrente (`aria-current`). */
  ariaCurrent?: boolean;
  /** O alvo principal vira link. */
  href?: string;
  /** Sem `href`, o alvo principal vira botão. */
  onClick?: () => void;
  /** Ações da linha (botões), fora do alvo principal. */
  children?: React.ReactNode;
  className?: string;
}

export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return (partes[0] ?? "").slice(0, 2).toUpperCase();
  return ((partes[0]?.[0] ?? "") + (partes[partes.length - 1]?.[0] ?? "")).toUpperCase();
}

const FOCO = "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

export function LinhaDeLista({
  avatar,
  titulo,
  previa,
  direita,
  selecionado = false,
  onSelecionar,
  rotuloDaSelecao,
  testIdDaSelecao,
  selecaoDesabilitada = false,
  testId,
  ariaCurrent = false,
  href,
  onClick,
  children,
  className,
}: LinhaDeListaProps) {
  const conteudo = (
    <>
      <Avatar className="h-10 w-10">
        {avatar.imagem ? (
          <AvatarImage src={avatar.imagem} alt="" className="object-cover" />
        ) : null}
        <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
          {iniciaisDe(avatar.nome)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">{titulo}</span>
          {direita ? (
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-1 text-xs text-muted-foreground">
              {direita}
            </span>
          ) : null}
        </div>
        {previa ? (
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {previa}
          </div>
        ) : null}
      </div>
    </>
  );

  const classeDoAlvo = cn(
    "flex min-h-[44px] min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/10",
    FOCO,
  );

  return (
    <li
      data-testid={testId}
      className={cn(
        "relative flex w-full items-center border-b border-border bg-card",
        selecionado && "bg-accent-soft",
        className,
      )}
    >
      {onSelecionar ? (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center">
          <button
            type="button"
            role="checkbox"
            aria-checked={selecionado}
            aria-label={rotuloDaSelecao}
            data-testid={testIdDaSelecao}
            disabled={selecaoDesabilitada}
            onClick={onSelecionar}
            className={cn(
              "relative flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-muted-foreground bg-background transition-colors hover:bg-surface-elevated focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent",
              // Alvo de toque de 44 px sem aumentar o desenho da caixa.
              "before:absolute before:-inset-3.5 before:content-['']",
              selecionado && "bg-accent text-accent-foreground",
            )}
          >
            {selecionado ? <Check size={12} weight="bold" aria-hidden /> : null}
          </button>
        </span>
      ) : null}
      {href ? (
        <Link href={href} aria-current={ariaCurrent ? "true" : undefined} className={classeDoAlvo}>
          {conteudo}
        </Link>
      ) : onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-current={ariaCurrent ? "true" : undefined}
          className={classeDoAlvo}
        >
          {conteudo}
        </button>
      ) : (
        <div className={classeDoAlvo}>{conteudo}</div>
      )}
      {children ? (
        <div className="flex shrink-0 items-center justify-end gap-0.5 pr-2">{children}</div>
      ) : null}
    </li>
  );
}
