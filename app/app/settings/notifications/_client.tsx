"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/hooks/i18n/useT";

import { useSyncExternalStore } from "react";

import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useNotificationPermission } from "@/hooks/notifications/useNotificationPermission";
import { encerrarPushDesteAparelho, syncPushSubscription } from "@/lib/notifications/push_client";
import {
  NOTIFY_UI_CATEGORIES,
  assinarPrefs,
  getPrefsSnapshot,
  getPrefsSnapshotDoServidor,
  gravarCanal,
  pushEfetivo,
  type NotifyCategory,
  type NotifyChannelPref,
} from "@/lib/notifications/prefs";

const LABELS: Record<NotifyCategory, string> = {
  message: "Nova mensagem",
  lead_assigned: "Lead atribuído a você",
  lead_won: "Lead ganho",
  lead_lost: "Lead perdido",
  mention: "Você foi mencionado",
  call_inbound: "Ligação recebida",
};

export function NotificationPrefsClient() {
  const t = useT();
  const { permission, request } = useNotificationPermission();
  const prefs = useSyncExternalStore(assinarPrefs, getPrefsSnapshot, getPrefsSnapshotDoServidor);
  const denied = permission === "denied";
  const unsupported = permission === "unsupported";

  async function onToggle(category: NotifyCategory, channel: NotifyChannelPref, on: boolean) {
    if (channel === "push" && on) {
      if (permission !== "granted") {
        const next = await request();
        if (next !== "granted") return;
      }
    }
    gravarCanal(category, channel, on);
    // O push de mensagem é o interruptor do aparelho (`pushEfetivo`).
    if (category === "message" && channel === "push") {
      void (on ? syncPushSubscription() : encerrarPushDesteAparelho());
    }
  }

  return (
    <Card className="p-0">
      <Table className="w-full text-sm">
        <TableHeader className="border-b">
          <TableRow>
            <TableHead className="px-4 py-3 text-left font-medium">{t("Categoria")}</TableHead>
            <TableHead className="px-4 py-3 text-center font-medium">Email</TableHead>
            <TableHead className="px-4 py-3 text-center font-medium">In-app</TableHead>
            <TableHead className="px-4 py-3 text-center font-medium">Push</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {NOTIFY_UI_CATEGORIES.map((cat) => (
            <TableRow key={cat} className="border-b last:border-0">
              <TableCell className="px-4 py-3">
                {t(LABELS[cat])}
                {cat === "message" && denied ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(
                      "O navegador bloqueou as notificações. Libere-as nas configurações do site e recarregue.",
                    )}
                  </p>
                ) : null}
                {cat === "message" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("Desligar o push de mensagem desliga todos os avisos deste aparelho fora do app.")}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="px-4 py-3 text-center">
                <Switch checked={false} disabled aria-label={`${t(LABELS[cat])} via email`} />
              </TableCell>
              <TableCell className="px-4 py-3 text-center">
                <Switch
                  checked={prefs[cat].in_app}
                  onCheckedChange={(on) => void onToggle(cat, "in_app", on)}
                  aria-label={`${t(LABELS[cat])} via in_app`}
                />
              </TableCell>
              <TableCell className="px-4 py-3 text-center">
                <Switch
                  checked={pushEfetivo(prefs, cat, "push")}
                  disabled={denied || unsupported || (cat !== "message" && !prefs.message.push)}
                  onCheckedChange={(on) => void onToggle(cat, "push", on)}
                  aria-label={`${t(LABELS[cat])} via push`}
                  data-testid={cat === "message" ? (prefs.message.push ? "alerts-toggle" : "alerts-enable") : undefined}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
