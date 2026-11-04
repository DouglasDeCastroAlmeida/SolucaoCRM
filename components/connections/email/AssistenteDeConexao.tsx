"use client";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

/**
 * Assistente de conexão da caixa de e-mail (mudança 005, REQ-001).
 *
 * Dois caminhos: Gmail (servidores já preenchidos + passos da senha de app) e outro
 * provedor (a pessoa informa servidor, porta, segurança, usuário e senha de leitura e envio).
 * "Conectar" só é liberado depois de um "Testar" que entrou na caixa e enviou o e-mail de
 * teste; mexer em qualquer campo depois disso exige testar de novo.
 *
 * A senha vive só no estado desta tela: vai no corpo do POST e nunca volta. O servidor
 * confere a caixa de novo ao conectar, então este bloqueio é conforto, não segurança.
 */

type Provedor = "gmail" | "outro";
type Seguranca = "ssl" | "starttls";

const SERVIDORES_DO_GMAIL = {
  imap: { host: "imap.gmail.com", porta: 993, seguranca: "ssl" as const },
  smtp: { host: "smtp.gmail.com", porta: 465, seguranca: "ssl" as const },
};

const ROTA = "/api/v1/channels/email";
/** O servidor entra na caixa e envia um e-mail: pode demorar mais que o prazo comum. */
const PRAZO_DO_TESTE_MS = 60_000;

const SELECT =
  "flex h-10 min-h-11 w-full rounded-sm border border-border bg-bg px-3 py-2 text-base text-text md:text-sm lg:min-h-0";

interface Campos {
  endereco: string;
  usuario: string;
  senha: string;
  imapHost: string;
  imapPorta: string;
  imapSeguranca: Seguranca;
  smtpHost: string;
  smtpPorta: string;
  smtpSeguranca: Seguranca;
  assinatura: string;
}

const CAMPOS_VAZIOS: Campos = {
  endereco: "",
  usuario: "",
  senha: "",
  imapHost: "",
  imapPorta: "993",
  imapSeguranca: "ssl",
  smtpHost: "",
  smtpPorta: "465",
  smtpSeguranca: "ssl",
  assinatura: "",
};

function mensagemDoErro(e: unknown, padrao: string): string {
  return e instanceof Error && e.message ? e.message : padrao;
}

export function AssistenteDeConexao({ onConectada }: { onConectada: () => void }) {
  const t = useT();
  const [provedor, setProvedor] = useState<Provedor | null>(null);
  const [campos, setCampos] = useState<Campos>(CAMPOS_VAZIOS);
  const [testado, setTestado] = useState(false);
  const [ocupado, setOcupado] = useState<"testando" | "conectando" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const escolher = (p: Provedor) => {
    setProvedor(p);
    setCampos(CAMPOS_VAZIOS);
    setTestado(false);
    setErro(null);
  };

  const mudar = (campo: keyof Campos, valor: string) => {
    setCampos((atual) => ({ ...atual, [campo]: valor }));
    // O que foi testado já não é o que está na tela.
    setTestado(false);
    setErro(null);
  };

  const montar = () => {
    const endereco = campos.endereco.trim();
    const servidores =
      provedor === "gmail"
        ? SERVIDORES_DO_GMAIL
        : {
            imap: { host: campos.imapHost.trim(), porta: Number(campos.imapPorta), seguranca: campos.imapSeguranca },
            smtp: { host: campos.smtpHost.trim(), porta: Number(campos.smtpPorta), seguranca: campos.smtpSeguranca },
          };
    return {
      endereco,
      usuario: provedor === "outro" && campos.usuario.trim() ? campos.usuario.trim() : endereco,
      senha: campos.senha,
      ...servidores,
    };
  };

  const completo =
    campos.endereco.trim() !== "" &&
    campos.senha !== "" &&
    (provedor === "gmail" || (campos.imapHost.trim() !== "" && campos.smtpHost.trim() !== ""));

  const testar = async () => {
    setOcupado("testando");
    setErro(null);
    try {
      await apiClient.post(`${ROTA}/testar`, montar(), { timeoutMs: PRAZO_DO_TESTE_MS });
      setTestado(true);
    } catch (e) {
      setTestado(false);
      setErro(mensagemDoErro(e, t("Não foi possível testar a caixa agora. Tente de novo.")));
    } finally {
      setOcupado(null);
    }
  };

  const conectar = async () => {
    setOcupado("conectando");
    setErro(null);
    try {
      const assinatura = campos.assinatura.trim();
      await apiClient.post(ROTA, { ...montar(), ...(assinatura ? { assinatura } : {}) }, { timeoutMs: PRAZO_DO_TESTE_MS });
      // A senha sai da memória da tela assim que a caixa é gravada: ela não volta numa resposta.
      setCampos(CAMPOS_VAZIOS);
      setProvedor(null);
      setTestado(false);
      toast.success(t("Caixa de e-mail conectada."));
      onConectada();
    } catch (e) {
      // O "Deu certo" do teste não pode ficar sob o erro: o que valeu foi a tentativa de conectar, e ela falhou.
      setTestado(false);
      setErro(mensagemDoErro(e, t("Não foi possível conectar a caixa agora. Tente de novo.")));
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-4" data-testid="assistente-email">
      <div>
        <h3 className="text-sm font-semibold">{t("Conectar uma caixa de e-mail")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("Escolha o seu provedor. Você vai testar a caixa antes de conectar, e nada do passado é importado.")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={provedor === "gmail" ? "default" : "outline"} onClick={() => escolher("gmail")}>
          {t("Gmail")}
        </Button>
        <Button type="button" variant={provedor === "outro" ? "default" : "outline"} onClick={() => escolher("outro")}>
          {t("Outro provedor")}
        </Button>
      </div>

      {provedor === "gmail" && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <ol aria-label={t("Como criar a senha de app")} className="list-decimal space-y-1 pl-5">
            <li>{t("Ligue a verificação em duas etapas na sua conta Google (Conta Google, Segurança).")}</li>
            <li>{t("Ainda em Segurança, abra Senhas de app e crie uma senha de app para o CRM.")}</li>
            <li>{t("Copie a senha de 16 letras e cole no campo abaixo, no lugar da sua senha normal.")}</li>
          </ol>
          <div className="text-xs text-muted-foreground">
            <p>{t("Leitura: imap.gmail.com, porta 993")}</p>
            <p>{t("Envio: smtp.gmail.com, porta 465")}</p>
          </div>
        </div>
      )}

      {provedor && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email-endereco">{t("Endereço de e-mail")}</Label>
              <Input
                id="email-endereco"
                type="email"
                value={campos.endereco}
                onChange={(e) => mudar("endereco", e.target.value)}
                autoComplete="off"
              />
            </div>

            {provedor === "outro" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email-usuario">{t("Usuário")}</Label>
                <Input
                  id="email-usuario"
                  value={campos.usuario}
                  onChange={(e) => mudar("usuario", e.target.value)}
                  placeholder={t("Se vazio, usa o endereço de e-mail")}
                  autoComplete="off"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email-senha">{provedor === "gmail" ? t("Senha de app") : t("Senha")}</Label>
              <Input
                id="email-senha"
                type="password"
                value={campos.senha}
                onChange={(e) => mudar("senha", e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {t("Guardada cifrada. Depois de gravar ela não é mostrada de novo.")}
              </p>
            </div>
          </div>

          {provedor === "outro" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <fieldset className="grid gap-3">
                <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("Leitura (IMAP)")}
                </legend>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email-imap-host">{t("Servidor de leitura")}</Label>
                  <Input
                    id="email-imap-host"
                    value={campos.imapHost}
                    onChange={(e) => mudar("imapHost", e.target.value)}
                    placeholder={t("Endereço informado pelo seu provedor")}
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email-imap-porta">{t("Porta de leitura")}</Label>
                  <Input
                    id="email-imap-porta"
                    inputMode="numeric"
                    value={campos.imapPorta}
                    onChange={(e) => mudar("imapPorta", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email-imap-seguranca">{t("Segurança da leitura")}</Label>
                  <select
                    id="email-imap-seguranca"
                    className={SELECT}
                    value={campos.imapSeguranca}
                    onChange={(e) => mudar("imapSeguranca", e.target.value)}
                  >
                    <option value="ssl">{t("SSL/TLS (porta 993)")}</option>
                    <option value="starttls">{t("STARTTLS (porta 143)")}</option>
                  </select>
                </div>
              </fieldset>

              <fieldset className="grid gap-3">
                <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("Envio (SMTP)")}
                </legend>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email-smtp-host">{t("Servidor de envio")}</Label>
                  <Input
                    id="email-smtp-host"
                    value={campos.smtpHost}
                    onChange={(e) => mudar("smtpHost", e.target.value)}
                    placeholder={t("Endereço informado pelo seu provedor")}
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email-smtp-porta">{t("Porta de envio")}</Label>
                  <Input
                    id="email-smtp-porta"
                    inputMode="numeric"
                    value={campos.smtpPorta}
                    onChange={(e) => mudar("smtpPorta", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email-smtp-seguranca">{t("Segurança do envio")}</Label>
                  <select
                    id="email-smtp-seguranca"
                    className={SELECT}
                    value={campos.smtpSeguranca}
                    onChange={(e) => mudar("smtpSeguranca", e.target.value)}
                  >
                    <option value="ssl">{t("SSL/TLS (porta 465)")}</option>
                    <option value="starttls">{t("STARTTLS (porta 587)")}</option>
                  </select>
                </div>
              </fieldset>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email-assinatura">{t("Assinatura (opcional)")}</Label>
            <Textarea
              id="email-assinatura"
              value={campos.assinatura}
              onChange={(e) => mudar("assinatura", e.target.value)}
              rows={3}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground">{t("Entra no fim de toda resposta enviada por esta caixa.")}</p>
          </div>

          {erro && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              {erro}
            </div>
          )}
          {testado && (
            <div role="status" className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              {t("Deu certo. Entramos na caixa e enviamos um e-mail de teste para ela. Clique em Conectar para terminar.")}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={testar} disabled={!completo || ocupado !== null}>
              {ocupado === "testando" ? t("Testando…") : t("Testar")}
            </Button>
            <Button type="button" onClick={conectar} disabled={!testado || ocupado !== null}>
              {ocupado === "conectando" ? t("Conectando…") : t("Conectar")}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
