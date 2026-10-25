"use client";

/** Pacotes verticais: listar, criar e editar (AC-008.4). */
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { chamar, Erro, type PacoteVertical } from "./comum";

const URL_PACOTES = "/api/v1/admin/vertical-packs";

export function PainelDePacotes() {
  const [pacotes, setPacotes] = useState<PacoteVertical[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<PacoteVertical | null>(null);
  const [slug, setSlug] = useState("");
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await chamar(URL_PACOTES, "GET");
    if (!r.ok) return setErro(r.erro ?? null);
    setPacotes(Array.isArray(r.data) ? (r.data as PacoteVertical[]) : []);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function iniciarEdicao(p: PacoteVertical) {
    setEditando(p);
    setSlug(p.slug);
    setNome(p.name);
  }

  function limpar() {
    setEditando(null);
    setSlug("");
    setNome("");
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    const r = editando
      ? await chamar(URL_PACOTES, "PATCH", { pack_id: editando.id, name: nome.trim() })
      : await chamar(URL_PACOTES, "POST", { slug: slug.trim(), name: nome.trim() });
    setEnviando(false);
    if (!r.ok) return setErro(r.erro ?? null);
    limpar();
    void carregar();
  }

  async function alternar(p: PacoteVertical) {
    setErro(null);
    const r = await chamar(URL_PACOTES, "PATCH", {
      pack_id: p.id,
      status: p.status === "active" ? "inactive" : "active",
    });
    if (!r.ok) return setErro(r.erro ?? null);
    void carregar();
  }

  return (
    <div className="space-y-6">
      <Erro texto={erro} />
      <table className="w-full text-sm">
        <caption className="sr-only">Pacotes verticais</caption>
        <thead>
          <tr className="text-left">
            <th scope="col">Nome</th>
            <th scope="col">Identificador</th>
            <th scope="col">Versão</th>
            <th scope="col">Estado</th>
            <th scope="col">Ações</th>
          </tr>
        </thead>
        <tbody>
          {pacotes.map((p) => (
            <tr key={p.id} className="border-t">
              <td>{p.name}</td>
              <td>{p.slug}</td>
              <td>{p.version}</td>
              <td>{p.status === "active" ? "Ativo" : "Inativo"}</td>
              <td className="space-x-2">
                <Button type="button" variant="outline" size="sm" aria-label={`Editar pacote ${p.name}`} onClick={() => iniciarEdicao(p)}>
                  Editar
                </Button>
                <Button type="button" variant="outline" size="sm" aria-label={`${p.status === "active" ? "Desativar" : "Ativar"} pacote ${p.name}`} onClick={() => void alternar(p)}>
                  {p.status === "active" ? "Desativar" : "Ativar"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form onSubmit={salvar} className="space-y-3 rounded-md border p-4">
        <h2 className="text-lg font-semibold">{editando ? `Editar pacote ${editando.name}` : "Novo pacote"}</h2>
        <div className="space-y-1">
          <Label htmlFor="pacote-slug">Identificador do pacote</Label>
          <Input id="pacote-slug" value={slug} disabled={editando !== null} onChange={(e) => setSlug(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pacote-nome">Nome do pacote</Label>
          <Input id="pacote-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="space-x-2">
          <Button type="submit" disabled={enviando || nome.trim() === "" || slug.trim() === ""}>
            {editando ? "Salvar pacote" : "Criar pacote"}
          </Button>
          {editando && (
            <Button type="button" variant="outline" onClick={limpar}>
              Cancelar
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
