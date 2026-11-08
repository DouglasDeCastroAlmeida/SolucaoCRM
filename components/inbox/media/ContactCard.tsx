"use client";



import { useRouter } from "next/navigation";

import { useState } from "react";

import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";

import { UserCircle } from "@/lib/ui/icons";

import { resolveSharedContact } from "@/lib/messaging/contact-card";
import { phoneForDisplay } from "@/lib/channels/phone-variants";

import type { Message } from "@/lib/types/messaging";

import { cn } from "@/lib/utils";



interface Props {

  message: Message;

}



/** Cartão de contato compartilhado — toque abre a conversa no inbox (mesma sessão). */

export function ContactCard({ message }: Props) {

  const t = useT();

  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const contact = resolveSharedContact(message);

  const isOutbound = message.direction === "outbound";



  if (!contact) {

    return (

      <div className={cn("rounded-md px-3 py-2 text-xs opacity-80", isOutbound ? "bg-primary-foreground/15" : "bg-foreground/5")}>

        {t("Contato")}

      </div>

    );

  }



  const canOpen = !!(contact.contact_id || contact.phone_number?.trim());



  async function handleOpen() {

    if (!canOpen || loading) return;

    setLoading(true);

    try {

      const res = await fetch("/api/v1/conversations/open-with-contact", {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({

          channel_session_id: message.channel_session_id,

          contact_id: contact!.contact_id,

          phone_number: contact!.phone_number?.trim() || undefined,

          name: contact!.name,

        }),

      });

      const json = (await res.json()) as {

        data?: { conversation_id: string };

        error?: { message?: string };

      };

      if (!res.ok || !json.data?.conversation_id) {

        throw new Error(json.error?.message ?? t("Não foi possível abrir a conversa."));

      }

      router.push(`/app/inbox?id=${json.data.conversation_id}`);

    } catch (err) {

      toast.error(err instanceof Error ? t(err.message) : t("Não foi possível abrir a conversa."));

    } finally {

      setLoading(false);

    }

  }



  return (

    <button

      type="button"

      disabled={!canOpen || loading}

      onClick={handleOpen}

      title={canOpen ? t("Abrir conversa com este contato") : undefined}

      className={cn(

        // Mesmo molde do DocumentCard/LocationCard: largura w-64, raio rounded-md, fundo por token
        // conforme o lado do balão (sem borda de cor solta).
        "flex w-64 max-w-full items-center gap-3 rounded-md p-2.5 text-left transition-colors",

        isOutbound ? "bg-primary-foreground/15" : "bg-foreground/5",

        canOpen && (isOutbound ? "cursor-pointer hover:bg-primary-foreground/25" : "cursor-pointer hover:bg-foreground/10") + " disabled:cursor-wait disabled:opacity-70",

        !canOpen && "cursor-default opacity-90",

      )}

    >

      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", isOutbound ? "bg-primary-foreground/20" : "bg-primary/10 text-primary")}>

        <UserCircle size={24} weight="duotone" aria-hidden />

      </span>

      <span className="min-w-0 flex-1">

        <span className="block truncate font-medium">{contact.name}</span>

        {contact.phone_number ? (

          <span className="block truncate text-xs opacity-80">{phoneForDisplay(contact.phone_number)}</span>

        ) : null}

      </span>

    </button>

  );

}

