"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";

import { copyToClipboard } from "@/lib/clipboard";
import { traduzir } from "@/lib/i18n/dicionario";
import { IDIOMA_PADRAO, idiomaDelNavegador, type Idioma } from "@/lib/i18n/idiomas";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [eventId, setEventId] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  // Parte do padrão (igual ao do servidor) e ajusta depois de montar, para não
  // quebrar a hidratação do único componente que não pode falhar.
  const [idioma, setIdioma] = useState<Idioma>(IDIOMA_PADRAO);

  useEffect(() => {
    setIdioma(idiomaDelNavegador(navigator.languages ?? [navigator.language]));
  }, []);

  useEffect(() => {
    const id = Sentry.captureException(error);
    setEventId(id);
  }, [error]);

  const displayId = eventId ?? error.digest ?? "—";

  return (
    <html lang={idioma}>
      <head>
        {/* Substitui o layout raiz: o globals.css não está carregado, então os tokens
            não existem aqui. Estas variáveis repetem a régua de neutros do produto
            (claro e escuro) para a única tela que não pode falhar. */}
        <style>{`
          :root{--ge-bg:#f7f8f9;--ge-surface:#ffffff;--ge-elevated:#f0f2f4;--ge-text:#17222b;--ge-muted:#4f6069;--ge-border:#e3e7ea;--ge-border-strong:#cfd5d9;color-scheme:light dark}
          @media (prefers-color-scheme: dark){:root{--ge-bg:#0e171d;--ge-surface:#1a252c;--ge-elevated:#232f37;--ge-text:#e7ecef;--ge-muted:#a2b2bb;--ge-border:#2a373f;--ge-border-strong:#394850}}
        `}</style>
      </head>
      <body
        style={{
          margin: 0,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          background: "var(--ge-bg)",
          color: "var(--ge-text)",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            background: "var(--ge-surface)",
            border: "1px solid var(--ge-border)",
            borderRadius: 12,
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.25rem",
              marginBottom: "0.75rem",
            }}
          >
            <button
              type="button"
              onClick={() => setIdioma("es")}
              style={{
                padding: "0.2rem 0.5rem",
                fontSize: "0.75rem",
                borderRadius: 4,
                border: "1px solid",
                borderColor: idioma === "es" ? "var(--ge-text)" : "var(--ge-border)",
                background: idioma === "es" ? "var(--ge-text)" : "var(--ge-surface)",
                color: idioma === "es" ? "var(--ge-surface)" : "var(--ge-muted)",
                cursor: "pointer",
                fontWeight: idioma === "es" ? 600 : 400,
              }}
            >
              ES
            </button>
            <button
              type="button"
              onClick={() => setIdioma("pt-BR")}
              style={{
                padding: "0.2rem 0.5rem",
                fontSize: "0.75rem",
                borderRadius: 4,
                border: "1px solid",
                borderColor: idioma === "pt-BR" ? "var(--ge-text)" : "var(--ge-border)",
                background: idioma === "pt-BR" ? "var(--ge-text)" : "var(--ge-surface)",
                color: idioma === "pt-BR" ? "var(--ge-surface)" : "var(--ge-muted)",
                cursor: "pointer",
                fontWeight: idioma === "pt-BR" ? 600 : 400,
              }}
            >
              PT
            </button>
          </div>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem", fontWeight: 600 }}>
            {traduzir("Algo deu errado", idioma)}
          </h1>
          <p style={{ color: "var(--ge-muted)", margin: "0 0 1.5rem" }}>
            {traduzir(
              "Tente novamente em instantes. Se persistir, contate o suporte com o ID abaixo.",
              idioma,
            )}
          </p>
          <div
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.75rem",
              background: "var(--ge-elevated)",
              padding: "0.5rem",
              borderRadius: 6,
              marginBottom: "1rem",
              wordBreak: "break-all",
            }}
          >
            ID: {displayId}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => {
                void copyToClipboard(displayId).then((ok) => {
                  if (ok) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                });
              }}
              style={{
                padding: "0.5rem 1rem",
                border: "1px solid var(--ge-border-strong)",
                background: "var(--ge-surface)",
                color: "var(--ge-text)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {copied ? traduzir("Copiado!", idioma) : traduzir("Copiar ID", idioma)}
            </button>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: "0.5rem 1rem",
                border: "1px solid var(--ge-text)",
                background: "var(--ge-text)",
                color: "var(--ge-surface)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {traduzir("Tentar de novo", idioma)}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
