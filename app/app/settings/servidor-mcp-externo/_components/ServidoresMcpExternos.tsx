"use client";

/**
 * Servidores MCP externos da empresa (mudança 006, REQ-007; AC-007.2).
 *
 * Lista os servidores, cadastra um novo (a rota testa a conexão e lista as ferramentas, todas
 * desligadas), ativa e desativa. Quem pode chegar aqui é decidido pela página, com a mesma regra da
 * rota (`exigirAdminDeServidoresMcp`): a tela não inventa uma segunda.
 *
 * A credencial nunca volta inteira: a API devolve só os 4 últimos caracteres, e o campo da chave é
 * esvaziado assim que o cadastro termina. O que o servidor remoto chama de nome ou descrição de
 * ferramenta é dado de terceiro e não passa por `t()`.
 */
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";

import { FerramentasDoServidor } from "./FerramentasDoServidor";

interface Servidor {
  id: string;
  slug: string;
  nome: string;
  host: string;
  chave_last4: string | null;
  ativo: boolean;
  ferramentas_em: string | null;
}

/** Uma frase por motivo de recusa: o código nunca chega à tela. */
const MENSAGEM_DO_ERRO: Record<string, string> = {
  ai_destino_proibido:
    "Endereço recusado por segurança: informe um servidor público, sem rede interna, sem localhost e sem segredo colado no endereço.",
  ai_http_nao_permitido: "O endereço precisa começar com https. Endereços http não são aceitos.",
  mcp_servidor_duplicado: "Já existe um servidor com este identificador. Escolha outro.",
  mcp_servidor_invalido: "Não foi possível conectar ao servidor. Confira o endereço e a chave.",
  validation_failed: "Informe um identificador (letras minúsculas, números e hífen), um nome, o endereço e a chave.",
  forbidden_role: "Só o dono da instalação cadastra servidores de ferramentas externos.",
  mfa_required: "Esta ação exige a verificação em duas etapas. Entre novamente com o código do aplicativo.",
  unauthenticated: "Sua sessão expirou. Entre de novo para continuar.",
};
const ERRO_GENERICO = "Não foi possível concluir agora. Tente de novo em instantes.";

export function ServidoresMcpExternos() {
  const t = useT();
  const [servidores, setServidores] = useState<Servidor[] | null>(null);
  const [erroDaLista, setErroDaLista] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const [slug, setSlug] = useState("");
  const [nome, setNome] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [chave, setChave] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mexendo, setMexendo] = useState<string | null>(null);

  const mensagem = useCallback(
    (err: unknown) => t(err instanceof ApiError ? (MENSAGEM_DO_ERRO[err.code] ?? ERRO_GENERICO) : ERRO_GENERICO),
    [t],
  );

  const carregar = useCallback(async () => {
    try {
      const r = await apiClient.get<{ data: Servidor[] }>("/api/v1/mcp-servidores");
      setServidores(r.data);
      setErroDaLista(null);
    } catch (err) {
      setErroDaLista(mensagem(err));
    }
  }, [mensagem]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setEnviando(true);
    try {
      await apiClient.post("/api/v1/mcp-servidores", {
        slug: slug.trim(),
        nome: nome.trim(),
        endpoint: endpoint.trim(),
        chave: chave.trim(),
      });
      setSlug("");
      setNome("");
      setEndpoint("");
      setAviso(
        t("Servidor cadastrado e conexão testada. Todas as ferramentas nasceram desligadas: escolha, por agente, quais ligar."),
      );
      await carregar();
    } catch (err) {
      setErro(mensagem(err));
    } finally {
      // A chave não fica na tela, deu certo ou não.
      setChave("");
      setEnviando(false);
    }
  }

  async function mudarAtivo(servidor: Servidor, ativo: boolean) {
    setErro(null);
    setAviso(null);
    setMexendo(servidor.id);
    try {
      await apiClient.patch(`/api/v1/mcp-servidores/${servidor.id}`, { ativo });
      await carregar();
    } catch (err) {
      setErro(mensagem(err));
    } finally {
      setMexendo(null);
    }
  }

  const escolhido = servidores?.find((s) => s.id === aberto) ?? null;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("Servidores cadastrados")}</CardTitle>
          <CardDescription>
            {t("Cada servidor oferece ferramentas à IA. Nenhuma ferramenta funciona até você ligá-la em um agente.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {erroDaLista ? (
            <p role="alert" className="text-sm text-destructive">
              {erroDaLista}
            </p>
          ) : servidores === null ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("Carregando…")}
            </p>
          ) : servidores.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nenhum servidor cadastrado ainda.")}</p>
          ) : (
            <Table>
              <TableCaption className="sr-only">{t("Servidores MCP externos cadastrados")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t("Servidor")}</TableHead>
                  <TableHead scope="col">{t("Endereço")}</TableHead>
                  <TableHead scope="col">{t("Situação")}</TableHead>
                  <TableHead scope="col">{t("Credencial")}</TableHead>
                  <TableHead scope="col">{t("Ferramentas atualizadas em")}</TableHead>
                  <TableHead scope="col">
                    <span className="sr-only">{t("Ações")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servidores.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <span className="font-medium">{s.nome}</span>
                      <span className="block text-xs text-muted-foreground">{s.slug}</span>
                    </TableCell>
                    <TableCell>{s.host}</TableCell>
                    <TableCell>
                      <Badge variant={s.ativo ? "success" : "neutral"}>{s.ativo ? t("Ativo") : t("Desativado")}</Badge>
                    </TableCell>
                    <TableCell>
                      <code>{s.chave_last4 ? `••••${s.chave_last4}` : "••••"}</code>
                    </TableCell>
                    <TableCell>
                      {s.ferramentas_em ? new Date(s.ferramentas_em).toLocaleString() : t("Nunca")}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={t("Ferramentas de {nome}").replace("{nome}", s.nome)}
                          aria-pressed={aberto === s.id}
                          onClick={() => setAberto(aberto === s.id ? null : s.id)}
                        >
                          {t("Ferramentas")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={mexendo === s.id}
                          aria-label={(s.ativo ? t("Desativar {nome}") : t("Reativar {nome}")).replace("{nome}", s.nome)}
                          onClick={() => void mudarAtivo(s, !s.ativo)}
                        >
                          {s.ativo ? t("Desativar") : t("Reativar")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {aviso ? (
        <p role="status" className="text-sm text-muted-foreground">
          {aviso}
        </p>
      ) : null}
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}

      {escolhido ? <FerramentasDoServidor servidorId={escolhido.id} nome={escolhido.nome} ativo={escolhido.ativo} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("Cadastrar servidor")}</CardTitle>
          <CardDescription>
            {t(
              "O endereço precisa ser um servidor público em https. Ao cadastrar, o sistema testa a conexão e lista as ferramentas do servidor.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void cadastrar(e)} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mcp-slug">{t("Identificador")}</Label>
                <Input
                  id="mcp-slug"
                  value={slug}
                  maxLength={24}
                  spellCheck={false}
                  placeholder="loja"
                  onChange={(e) => setSlug(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {t("Letras minúsculas, números e hífen. Não muda depois de cadastrado.")}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mcp-nome">{t("Nome")}</Label>
                <Input id="mcp-nome" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} required />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mcp-endereco">{t("Endereço do servidor")}</Label>
              <Input
                id="mcp-endereco"
                value={endpoint}
                spellCheck={false}
                placeholder="https://erp.example.com/mcp"
                onChange={(e) => setEndpoint(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mcp-chave-nova">{t("Chave de acesso")}</Label>
              <Input
                id="mcp-chave-nova"
                type="password"
                autoComplete="off"
                value={chave}
                spellCheck={false}
                onChange={(e) => setChave(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                {t("A chave é gravada cifrada e não é mostrada de novo: depois de salvar, a tela revela só os quatro últimos caracteres.")}
              </p>
            </div>
            <Button type="submit" disabled={enviando} className="w-fit">
              {enviando ? t("Testando a conexão…") : t("Cadastrar e testar")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
