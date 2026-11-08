"use client";
import { useT } from "@/hooks/i18n/useT";
import { DownloadSimple, FileText } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { formatBytes, mediaFileLabel, mediaSrc } from "./media-utils";

interface Props {
  messageId: string;
  mime: string | null;
  sizeBytes: number | null;
  storagePath: string | null;
  isOutbound: boolean;
  /** Nome ORIGINAL do documento quando o payload o trouxer (#2613). Ausente/vazio → rótulo de extensão. */
  fileName?: string | null;
  /** Fonte alternativa para mídia de NOTA interna (#1863, F3) — ver ImageMedia. */
  src?: string;
}

/** Card de documento: nome original (ou PDF/MP4/…), tamanho e download. */
/** "PDF", "DOCX"…: da extensão do nome, do caminho ou do mime. */
function tipoDoDocumento(mime: string | null, storagePath: string | null, fileName?: string | null): string {
  const ext = (fileName?.includes(".") ? fileName : storagePath)?.split(".").pop()?.toLowerCase();
  if (ext && ext !== "bin" && /^[a-z0-9]{1,5}$/.test(ext)) return ext.toUpperCase();
  const sub = mime?.split(";")[0]?.split("/")[1]?.toLowerCase();
  return sub && !["octet-stream", "bin"].includes(sub) ? sub.toUpperCase().slice(0, 5) : "Arquivo";
}

export function DocumentCard({
  messageId,
  mime,
  sizeBytes,
  storagePath,
  isOutbound,
  fileName,
  src,
}: Props) {
  const t = useT();
  const label = mediaFileLabel(mime, storagePath, fileName);
  return (
    <a
      href={src ?? mediaSrc(messageId)}
      target="_blank"
      rel="noreferrer"
      aria-label={`${t("Baixar")} ${label} (${formatBytes(sizeBytes)})`}
      className={cn(
        "flex w-64 max-w-full items-center gap-3 rounded-md p-2.5 transition-colors",
        isOutbound
          ? "bg-primary-foreground/15 hover:bg-primary-foreground/25"
          : "bg-foreground/5 hover:bg-foreground/10",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          isOutbound ? "bg-primary-foreground/20" : "bg-primary/10 text-primary",
        )}
      >
        <FileText size={20} weight="duotone" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={label}>
          {label}
        </span>
        <span data-testid="documento-detalhe" className="block text-xs opacity-80">
          {tipoDoDocumento(mime, storagePath, fileName)} · {formatBytes(sizeBytes)}
        </span>
      </span>
      <DownloadSimple size={20} className="shrink-0 opacity-70" aria-hidden />
    </a>
  );
}
