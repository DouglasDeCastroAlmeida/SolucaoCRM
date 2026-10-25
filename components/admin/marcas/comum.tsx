"use client";

/** Ajudantes compartilhados das seções do painel /admin/marcas. */

export async function chamar(
  url: string,
  method: string,
  body?: unknown,
): Promise<{ ok: boolean; data?: unknown; erro?: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: unknown; error?: { message?: string } };
    if (!res.ok) return { ok: false, erro: json.error?.message ?? "Não foi possível concluir." };
    return { ok: true, data: json.data };
  } catch {
    return { ok: false, erro: "Sem conexão. Tente de novo." };
  }
}

export function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {texto}
    </p>
  );
}

export type PacoteVertical = { id: string; slug: string; name: string; version: number; status: string };
