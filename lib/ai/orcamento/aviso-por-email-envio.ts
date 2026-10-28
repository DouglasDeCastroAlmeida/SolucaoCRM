/**
 * O ENVIO do aviso de 80% (mudança 006, AC-004.2): texto em português simples e
 * entrega aos administradores pela marca da organização. Fica fora de
 * `aviso-por-email.ts` de propósito: aquele é importado pelo gate, que roda no
 * worker, e não pode arrastar e-mail, marca e dicionário para dentro dele.
 *
 * Melhor esforço: nada aqui lança. Sem Resend nem SMTP (`not_configured`) o envio
 * apenas para, sem erro — é o estado de um primeiro deploy.
 */
import type { MarcaDeSaida } from "@/lib/branding/saida";
import { buildEmailDaCobranca } from "@/lib/email/templates/cobranca";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

function emDolares(cents: number): string {
  return `US$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function textoDoAvisoDeOrcamento(d: {
  gastoCents: number;
  tetoCents: number;
  idioma: Idioma;
}): { titulo: string; corpo: string; rodape: string; botao: string } {
  const t = (s: string) => traduzir(s, d.idioma);
  const pct = d.tetoCents > 0 ? Math.round((d.gastoCents / d.tetoCents) * 100) : 0;
  return {
    titulo: t("O gasto com IA chegou a 80% do limite"),
    corpo:
      `${t("Neste mês a IA já gastou")} ${emDolares(d.gastoCents)} ${t("de um limite de")} ${emDolares(d.tetoCents)} (${pct}%). ` +
      t(
        "Ao chegar em 100%, a IA para de responder e as conversas passam para uma pessoa da equipe. Os valores são estimativas e podem incluir modelos sem preço conhecido. Se quiser, aumente o limite antes disso.",
      ),
    rodape: t("Você recebe este aviso porque administra esta empresa."),
    botao: t("Ver o uso de IA"),
  };
}

export interface EntradaDoEnvio {
  organizationId: string;
  gastoCents: number;
  tetoCents: number;
  idioma: Idioma;
  marca: MarcaDeSaida;
  /** Endereço completo da tela de uso. */
  link: string;
  destinatarios: readonly string[];
  /** O transporte de e-mail (`sendEmail` do roteador); injetado para o teste. */
  enviar: (m: {
    to: string;
    subject: string;
    html: string;
    text: string;
    fromName: string;
    tags: { name: string; value: string }[];
  }) => Promise<{ ok: boolean; error?: string }>;
}

export interface ResultadoDoEnvio {
  enviados: number;
  falhas: number;
  /** Nenhum transporte configurado: nada a fazer e nada a repetir. */
  semEmail: boolean;
}

export async function enviarAvisoDeOrcamentoPorEmail(e: EntradaDoEnvio): Promise<ResultadoDoEnvio> {
  const r: ResultadoDoEnvio = { enviados: 0, falhas: 0, semEmail: false };
  if (e.destinatarios.length === 0) return r;
  const texto = textoDoAvisoDeOrcamento(e);
  const email = buildEmailDaCobranca({
    titulo: texto.titulo,
    corpo: texto.corpo,
    marca: e.marca,
    botao: { rotulo: texto.botao, href: e.link },
    rodape: texto.rodape,
    idioma: e.idioma,
  });
  for (const to of e.destinatarios) {
    try {
      const res = await e.enviar({
        to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        fromName: e.marca.nome,
        tags: [{ name: "tipo", value: "orcamento_de_ia" }],
      });
      if (res.ok) {
        r.enviados += 1;
      } else if (res.error === "not_configured") {
        // Sem Resend nem SMTP, os demais destinatários dariam a mesma resposta.
        r.semEmail = true;
        return r;
      } else {
        r.falhas += 1;
      }
    } catch {
      r.falhas += 1;
    }
  }
  return r;
}
