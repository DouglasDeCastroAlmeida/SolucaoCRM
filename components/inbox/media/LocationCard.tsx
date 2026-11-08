"use client";

import { useT } from "@/hooks/i18n/useT";
import { textoDoEnderecoAproximado } from "@/lib/mapas/geocodificacao";
import { linkDoMapa, type Localizacao } from "@/lib/messaging/localizacao";

/**
 * Pino compartilhado pelo cliente. Toque abre o ponto no mapa (no celular, o
 * app de mapas) — é o que quem monta a entrega precisa, e o texto cru com as
 * coordenadas não é clicável.
 *
 * Com a chave de Mapas da organização, o pino chega com rua, cidade e região
 * aproximados: a equipe vê onde é sem abrir o mapa. Nome e endereço que o
 * próprio cliente escolheu no WhatsApp vêm antes — são exatos.
 */
export function LocationCard({ localizacao }: { localizacao: Localizacao }) {
  const t = useT();
  const aproximado = localizacao.aproximado ? textoDoEnderecoAproximado(localizacao.aproximado) : "";
  const detalhe =
    [localizacao.nome, localizacao.endereco].filter(Boolean).join(" — ") ||
    (aproximado ? `${aproximado} (${t("aprox.")})` : "");
  return (
    <a
      href={linkDoMapa(localizacao)}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-64 max-w-full overflow-hidden rounded-md bg-foreground/5 text-left transition-colors hover:bg-foreground/10"
    >
      {/* Bloco de mapa desenhado aqui (ruas e quadras estilizadas): nada de arte de terceiros e
          nenhuma chamada de rede so para mostrar o cartao. */}
      <svg
        data-testid="pino-mapa"
        viewBox="0 0 256 112"
        className="block h-28 w-full bg-surface-elevated"
        role="img"
        aria-label={t("Localização compartilhada")}
      >
        <g stroke="currentColor" strokeOpacity="0.18" strokeWidth="10" fill="none">
          <path d="M-10 30 L270 50" />
          <path d="M-10 86 L270 70" />
          <path d="M60 -10 L80 130" />
          <path d="M180 -10 L170 130" />
        </g>
        <g fill="currentColor" fillOpacity="0.08">
          <rect x="92" y="6" width="68" height="34" rx="4" />
          <rect x="190" y="60" width="56" height="40" rx="4" />
          <rect x="8" y="58" width="44" height="30" rx="4" />
        </g>
        <g transform="translate(128 56)">
          <path d="M0 22 C-14 4 -16 -2 -16 -8 a16 16 0 0 1 32 0 c0 6 -2 12 -16 30z" className="fill-destructive" />
          <circle cx="0" cy="-8" r="6" className="fill-card" />
        </g>
      </svg>
      <span className="block px-2.5 py-2">
        <span className="block truncate font-medium" title={detalhe || undefined} data-testid="pino-detalhe">
          {detalhe || t("Localização compartilhada")}
        </span>
        <span className="block truncate text-xs underline opacity-80">{t("Abrir no mapa")}</span>
      </span>
    </a>
  );
}
