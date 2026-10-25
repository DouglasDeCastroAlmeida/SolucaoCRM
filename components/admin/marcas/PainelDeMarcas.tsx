"use client";

/**
 * Painel /admin/marcas: lista de marcas, formulário de criação, e por marca os
 * endereços (domínios) e planos. Fala só com /api/v1/admin/brands/**.
 *
 * Acessibilidade: todo campo tem <label>; a lista é uma <table> com <caption>;
 * erros vão num elemento role="alert"; botões de ação nomeiam a marca/endereço.
 */
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { chamar, Erro } from "./comum";
import { EditorDeMarca, type MarcaEditavel } from "./EditorDeMarca";
import { PainelDeContas } from "./PainelDeContas";
import { PainelDePacotes } from "./PainelDePacotes";

type Dominio = { id: string; host: string; kind: string; status: string };
type Marca = MarcaEditavel & {
  id: string;
  slug: string;
  status: string;
  is_default: boolean;
  brand_domains?: Dominio[];
};
type Plano = {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  cycle: string;
  status: string;
};

const BASE = "/api/v1/admin/brands";

/** "149,90" -> 14990. Devolve null se não for um valor em reais válido. */
function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}

function formatarPreco(cents: number, moeda: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(cents / 100);
}

function Detalhe({ marca, aoMudar }: { marca: Marca; aoMudar: () => void }) {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [host, setHost] = useState("");
  const [tipo, setTipo] = useState<"proprio" | "subdominio">("proprio");
  const [enviandoHost, setEnviandoHost] = useState(false);
  const [erroHost, setErroHost] = useState<string | null>(null);
  const [nomePlano, setNomePlano] = useState("");
  const [preco, setPreco] = useState("");
  const [enviandoPlano, setEnviandoPlano] = useState(false);
  const [erroPlano, setErroPlano] = useState<string | null>(null);

  const carregarPlanos = useCallback(async () => {
    const r = await chamar(`${BASE}/${marca.id}/plans`, "GET");
    if (r.ok && Array.isArray(r.data)) setPlanos(r.data as Plano[]);
  }, [marca.id]);

  useEffect(() => {
    void carregarPlanos();
  }, [carregarPlanos]);

  async function adicionarHost(e: React.FormEvent) {
    e.preventDefault();
    if (enviandoHost) return;
    setEnviandoHost(true);
    setErroHost(null);
    const r = await chamar(`${BASE}/${marca.id}/domains`, "POST", { host: host.trim(), kind: tipo });
    setEnviandoHost(false);
    if (!r.ok) return setErroHost(r.erro ?? null);
    setHost("");
    aoMudar();
  }

  async function removerHost(d: Dominio) {
    const r = await chamar(`${BASE}/${marca.id}/domains?domain_id=${d.id}`, "DELETE");
    if (!r.ok) return setErroHost(r.erro ?? null);
    aoMudar();
  }

  async function salvarPlano(e: React.FormEvent) {
    e.preventDefault();
    if (enviandoPlano) return;
    const centavos = reaisParaCentavos(preco);
    if (centavos === null) return setErroPlano("Informe o preço em reais, por exemplo 149,90.");
    setEnviandoPlano(true);
    setErroPlano(null);
    const r = await chamar(`${BASE}/${marca.id}/plans`, "POST", { name: nomePlano.trim(), price_cents: centavos });
    setEnviandoPlano(false);
    if (!r.ok) return setErroPlano(r.erro ?? null);
    setNomePlano("");
    setPreco("");
    void carregarPlanos();
  }

  return (
    <section aria-label={`Detalhes de ${marca.name}`} className="space-y-6 rounded-md border p-4">
      <h2 className="text-lg font-semibold">{marca.name}</h2>

      <EditorDeMarca key={marca.id + marca.name} marca={marca} aoSalvar={aoMudar} />

      <div className="space-y-3">
        <h3 className="font-medium">Endereços</h3>
        <ul className="space-y-1">
          {(marca.brand_domains ?? []).map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <span>{d.host}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void removerHost(d)} aria-label={`Remover ${d.host}`}>
                Remover
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={adicionarHost} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`novo-host-${marca.id}`}>Novo endereço</Label>
            <Input id={`novo-host-${marca.id}`} value={host} onChange={(e) => setHost(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`tipo-host-${marca.id}`}>Tipo do endereço</Label>
            <select
              id={`tipo-host-${marca.id}`}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "proprio" | "subdominio")}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="proprio">Domínio próprio</option>
              <option value="subdominio">Subdomínio</option>
            </select>
          </div>
          <Button type="submit" disabled={enviandoHost || host.trim() === ""}>
            Adicionar endereço
          </Button>
        </form>
        <Erro texto={erroHost} />
      </div>

      <div className="space-y-3">
        <h3 className="font-medium">Planos</h3>
        <ul className="space-y-1 text-sm">
          {planos.map((p) => (
            <li key={p.id}>
              <span>{p.name}</span> — {formatarPreco(p.price_cents, p.currency)}
            </li>
          ))}
        </ul>
        <form onSubmit={salvarPlano} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`plano-nome-${marca.id}`}>Nome do plano</Label>
            <Input id={`plano-nome-${marca.id}`} value={nomePlano} onChange={(e) => setNomePlano(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`plano-preco-${marca.id}`}>Preço (R$)</Label>
            <Input id={`plano-preco-${marca.id}`} value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" />
          </div>
          <Button type="submit" disabled={enviandoPlano || nomePlano.trim() === ""}>
            Salvar plano
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">Salvar um plano não cria nenhuma cobrança.</p>
        <Erro texto={erroPlano} />
      </div>
    </section>
  );
}

function PainelDeMarcasLista() {
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [nome, setNome] = useState("");
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await chamar(BASE, "GET");
    setCarregando(false);
    if (!r.ok) return setErro(r.erro ?? null);
    setMarcas(Array.isArray(r.data) ? (r.data as Marca[]) : []);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (criando) return;
    setCriando(true);
    setErro(null);
    const r = await chamar(BASE, "POST", { slug: slug.trim(), name: nome.trim(), cadastro_aberto: cadastroAberto });
    setCriando(false);
    if (!r.ok) return setErro(r.erro ?? null);
    setSlug("");
    setNome("");
    setCadastroAberto(false);
    void carregar();
  }

  async function desativar(m: Marca) {
    setErro(null);
    const r = await chamar(`${BASE}/${m.id}`, "DELETE");
    if (!r.ok) return setErro(r.erro ?? null);
    void carregar();
  }

  const marcaAberta = marcas.find((m) => m.id === aberta) ?? null;

  return (
    <div className="space-y-8">
      <Erro texto={erro} />
      {carregando ? (
        <p role="status">Carregando marcas...</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Marcas da instalação</caption>
          <thead>
            <tr className="text-left">
              <th scope="col">Nome</th>
              <th scope="col">Endereços</th>
              <th scope="col">Estado</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {marcas.map((m) => (
              <tr key={m.id} className="border-t">
                <td>{m.name}</td>
                <td>
                  {(m.brand_domains ?? []).map((d) => (
                    <div key={d.id}>{d.host}</div>
                  ))}
                </td>
                <td>{m.status === "active" ? "Ativa" : "Desativada"}</td>
                <td className="space-x-2">
                  <Button type="button" variant="outline" size="sm" aria-label={`Gerenciar ${m.name}`} onClick={() => setAberta(m.id)}>
                    Gerenciar
                  </Button>
                  {!m.is_default && m.status === "active" && (
                    <Button type="button" variant="outline" size="sm" aria-label={`Desativar ${m.name}`} onClick={() => void desativar(m)}>
                      Desativar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {marcaAberta && <Detalhe marca={marcaAberta} aoMudar={() => void carregar()} />}

      <form onSubmit={criar} className="space-y-3 rounded-md border p-4">
        <h2 className="text-lg font-semibold">Nova marca</h2>
        <div className="space-y-1">
          <Label htmlFor="marca-slug">Identificador</Label>
          <Input id="marca-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="clinica-sol" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="marca-nome">Nome da marca</Label>
          <Input id="marca-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <input id="marca-cadastro" type="checkbox" checked={cadastroAberto} onChange={(e) => setCadastroAberto(e.target.checked)} />
          <Label htmlFor="marca-cadastro">Cadastro aberto</Label>
        </div>
        <Button type="submit" disabled={criando || slug.trim() === "" || nome.trim() === ""}>
          Criar marca
        </Button>
      </form>
    </div>
  );
}

type Aba = "marcas" | "pacotes" | "contas";
const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: "marcas", rotulo: "Marcas" },
  { id: "pacotes", rotulo: "Pacotes verticais" },
  { id: "contas", rotulo: "Contas" },
];

export function PainelDeMarcas() {
  const [aba, setAba] = useState<Aba>("marcas");
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Seções do painel de marcas" className="flex gap-2">
        {ABAS.map((a) => (
          <Button
            key={a.id}
            type="button"
            role="tab"
            id={`aba-${a.id}`}
            aria-selected={aba === a.id}
            aria-controls={`painel-${a.id}`}
            variant={aba === a.id ? "default" : "outline"}
            onClick={() => setAba(a.id)}
          >
            {a.rotulo}
          </Button>
        ))}
      </div>
      <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`}>
        {aba === "marcas" && <PainelDeMarcasLista />}
        {aba === "pacotes" && <PainelDePacotes />}
        {aba === "contas" && <PainelDeContas />}
      </div>
    </div>
  );
}
