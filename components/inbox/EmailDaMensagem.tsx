"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { DownloadSimple, FileText } from "@/lib/ui/icons";
import { formatBytes } from "@/components/inbox/media/media-utils";
import type { EmailDaMensagem as Email } from "@/lib/inbox/email-da-mensagem";

/**
 * O corpo de um e-mail RECEBIDO dentro do balão (mudança 005, AC-008.5): assunto, o texto (que
 * quem chama já desenhou), o HTML limpo SÓ sob demanda e os anexos para baixar.
 *
 * O HTML já passou pela higienização da ingestão (`lib/channels/email/html-seguro.ts`). Mesmo
 * assim ele nunca entra na página: vai para um iframe `sandbox=""` (sem script, sem formulário,
 * sem a origem do CRM) com uma política que não deixa carregar nada de fora — nem imagem. É
 * defesa em camadas: se a higienização um dia falhar, o e-mail de um desconhecido ainda não
 * roda nada aqui.
 */

const POLITICA = "default-src 'none'; style-src 'unsafe-inline'";

function documentoDoEmail(html: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${POLITICA}">` +
    `<base target="_blank">` +
    `<style>body{margin:8px;font:14px/1.4 system-ui,sans-serif;color:#111;word-wrap:break-word}</style>` +
    `</head><body>${html}</body></html>`
  );
}

/** `/api/v1/messages/:id/media?anexo=N` — a rota autenticada, que serve sempre como download. */
const urlDoAnexo = (mensagemId: string, indice: number) => `/api/v1/messages/${mensagemId}/media?anexo=${indice}`;

export function CabecalhoDoEmail({ email }: { email: Email }) {
  if (!email.assunto) return null;
  return (
    <p data-testid="email-assunto" className="mb-1 font-semibold leading-snug wrap-anywhere">
      {email.assunto}
    </p>
  );
}

export function RodapeDoEmail({ email, mensagemId }: { email: Email; mensagemId: string }) {
  const t = useT();
  const [verHtml, setVerHtml] = useState(false);

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      {email.html && (
        <>
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setVerHtml((v) => !v)}
            >
              {verHtml ? t("Ocultar formatação") : t("Ver com formatação")}
            </Button>
          </div>
          {verHtml && (
            <iframe
              data-testid="email-html"
              title={t("E-mail com formatação")}
              sandbox=""
              referrerPolicy="no-referrer"
              srcDoc={documentoDoEmail(email.html)}
              className="h-72 w-full rounded-md border border-border bg-white"
            />
          )}
        </>
      )}

      {email.anexos.map((anexo) =>
        anexo.disponivel ? (
          <a
            key={anexo.indice}
            href={urlDoAnexo(mensagemId, anexo.indice)}
            download
            target="_blank"
            rel="noreferrer"
            aria-label={`${t("Baixar")} ${anexo.nome} (${formatBytes(anexo.tamanho)})`}
            className="flex items-center gap-2 rounded-lg bg-background/60 p-2 text-foreground hover:bg-background"
          >
            <FileText size={18} weight="duotone" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs font-medium" title={anexo.nome}>
              {anexo.nome}
            </span>
            <span className="text-[10px] opacity-70">{formatBytes(anexo.tamanho)}</span>
            <DownloadSimple size={16} className="shrink-0 opacity-70" aria-hidden />
          </a>
        ) : (
          <p key={anexo.indice} className="flex items-center gap-2 rounded-lg bg-background/40 p-2 text-xs opacity-80">
            <FileText size={18} aria-hidden />
            <span className="truncate">
              {anexo.nome} · {t("não foi guardado")}
            </span>
          </p>
        ),
      )}

      {email.omitidos > 0 && (
        <p className="text-[11px] opacity-80">
          {(email.omitidos === 1
            ? t("1 anexo ficou de fora por ser grande demais.")
            : t("{n} anexos ficaram de fora por serem grandes demais.")
          ).replace("{n}", String(email.omitidos))}
        </p>
      )}
    </div>
  );
}
