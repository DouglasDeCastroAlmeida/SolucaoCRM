"use client";

/** Edição dos campos da marca (AC-008.1) via PATCH /api/v1/admin/brands/{id}. */
import { useEffect, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { chamar, Erro, type PacoteVertical } from "./comum";

export type MarcaEditavel = {
  id: string;
  name: string;
  accent_hex?: string | null;
  logo_path?: string | null;
  cadastro_aberto: boolean;
  permite_personalizacao?: boolean;
  default_pack_id?: string | null;
};

export function EditorDeMarca({ marca, aoSalvar }: { marca: MarcaEditavel; aoSalvar: () => void }) {
  const t = useT();
  const [nome, setNome] = useState(marca.name);
  const [cor, setCor] = useState(marca.accent_hex ?? "");
  const [logo, setLogo] = useState(marca.logo_path ?? "");
  const [aberto, setAberto] = useState(marca.cadastro_aberto);
  const [personaliza, setPersonaliza] = useState(marca.permite_personalizacao ?? true);
  const [pacote, setPacote] = useState(marca.default_pack_id ?? "");
  const [pacotes, setPacotes] = useState<PacoteVertical[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    void chamar("/api/v1/admin/vertical-packs", "GET").then((r) => {
      if (r.ok && Array.isArray(r.data)) setPacotes(r.data as PacoteVertical[]);
    });
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    setSalvo(false);
    const r = await chamar(`/api/v1/admin/brands/${marca.id}`, "PATCH", {
      name: nome.trim(),
      accent_hex: cor.trim() === "" ? null : cor.trim(),
      logo_path: logo.trim() === "" ? null : logo.trim(),
      cadastro_aberto: aberto,
      permite_personalizacao: personaliza,
      default_pack_id: pacote === "" ? null : pacote,
    });
    setEnviando(false);
    if (!r.ok) return setErro(r.erro ?? null);
    setSalvo(true);
    aoSalvar();
  }

  const id = (c: string) => `${c}-${marca.id}`;
  return (
    <form onSubmit={salvar} aria-label={`Editar ${marca.name}`} className="space-y-3">
      <h3 className="font-medium">Dados da marca</h3>
      <div className="space-y-1">
        <Label htmlFor={id("ed-nome")}>Nome da marca</Label>
        <Input id={id("ed-nome")} value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={id("ed-cor")}>Cor principal (#rrggbb)</Label>
        <Input id={id("ed-cor")} value={cor} onChange={(e) => setCor(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={id("ed-logo")}>{t("Caminho do logo")}</Label>
        <Input id={id("ed-logo")} value={logo} onChange={(e) => setLogo(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={id("ed-pacote")}>{t("Pacote padrão")}</Label>
        <select
          id={id("ed-pacote")}
          value={pacote}
          onChange={(e) => setPacote(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">{t("Nenhum")}</option>
          {pacotes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input id={id("ed-aberto")} type="checkbox" checked={aberto} onChange={(e) => setAberto(e.target.checked)} />
        <Label htmlFor={id("ed-aberto")}>Cadastro aberto</Label>
      </div>
      <div className="flex items-center gap-2">
        <input id={id("ed-pers")} type="checkbox" checked={personaliza} onChange={(e) => setPersonaliza(e.target.checked)} />
        <Label htmlFor={id("ed-pers")}>{t("Permite personalização pela organização")}</Label>
      </div>
      <Button type="submit" disabled={enviando || nome.trim() === ""}>
        Salvar marca
      </Button>
      {salvo && <p role="status">Marca salva.</p>}
      <Erro texto={erro} />
    </form>
  );
}
