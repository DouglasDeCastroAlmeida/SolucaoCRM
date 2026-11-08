"use client";
import { useRef, useState } from "react";
import { useT } from "@/hooks/i18n/useT";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { FileText, ImageSquare, Note, Plus, UserCircle } from "@/lib/ui/icons";

interface Props {
  /** Trava o menu inteiro (conversa bloqueada, envio em curso). */
  disabled?: boolean;
  /**
   * Trava só as opções de RESPOSTA (fotos, documento, contato): janela de 24h fechada. A "Nota
   * interna" não sai para o cliente e continua alcançável por aqui.
   */
  respostaBarrada?: boolean;
  onPick: (file: File) => void;
  onPickContact?: () => void;
  /**
   * "Nota interna" como opção do clipe (#118): o atalho que antes era a aba "Nota interna"
   * acima do campo. Ausente = o menu não oferece (já está em nota: a volta é o botão "Responder").
   */
  onNotaInterna?: () => void;
}

/** Menu do "+" no composer (padrão de mensageiro): Fotos e vídeos / Documento / Contato. */
export function AttachMenu({ disabled, respostaBarrada, onPick, onPickContact, onNotaInterna }: Props) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const mediaRef = useRef<HTMLInputElement | null>(null);
  const docRef = useRef<HTMLInputElement | null>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onPick(file);
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
  };

  return (
    <>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-10 shrink-0 rounded-full text-muted-foreground"
            aria-label={t("Anexar")}
            disabled={disabled}
          >
            <Plus size={24} aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-52 p-1">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            disabled={respostaBarrada}
            onClick={() => mediaRef.current?.click()}
          >
            <ImageSquare size={20} weight="duotone" className="text-primary" aria-hidden />
            {t("Fotos e vídeos")}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            disabled={respostaBarrada}
            onClick={() => docRef.current?.click()}
          >
            <FileText size={20} weight="duotone" className="text-primary" aria-hidden />
            {t("Documento")}
          </button>
          {onPickContact && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              disabled={respostaBarrada}
              onClick={onPickContact}
            >
              <UserCircle size={20} weight="duotone" className="text-primary" aria-hidden />
              {t("Contato")}
            </button>
          )}
          {onNotaInterna && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              onClick={() => {
                setAberto(false);
                onNotaInterna();
              }}
            >
              <Note size={20} weight="duotone" className="text-primary" aria-hidden />
              {t("Nota interna")}
            </button>
          )}
        </PopoverContent>
      </Popover>
      {/* Os inputs vivem FORA do PopoverContent: o Radix desmonta o conteúdo do
          popover ao fechar, e um input desmontado no meio do clique perde o
          file picker ("nada acontece"). Aqui os refs seguem válidos após o
          fechamento — o .click() síncrono no onClick preserva o user-gesture. */}
      <input ref={mediaRef} type="file" accept="image/*,video/*" className="hidden" onChange={handle} />
      <input
        ref={docRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
        className="hidden"
        onChange={handle}
      />
    </>
  );
}
