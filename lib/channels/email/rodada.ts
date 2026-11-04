/**
 * A rodada de leitura das caixas de e-mail (mudança 005, ADR-001): o cron de 1 minuto chama
 * `rodarRodada`, que lê, caixa por caixa, o que chegou depois do último UID.
 *
 * ─── Regras que esta rodada garante ─────────────────────────────────────────
 * - **Só a caixa de entrada, só o que é novo.** Lê de `ultimo_uid + 1`; spam e lixeira nunca
 *   são abertos (`leitura-imap.ts` só conhece `INBOX`). A primeira leitura de uma caixa
 *   começa no fim dela (`iniciarCursor`, na conexão): nada do passado é importado.
 * - **Retoma de onde parou.** O cursor avança DEPOIS de cada mensagem tratada. Rede caída ou
 *   erro no meio deixa o cursor na última boa; a repetição é inofensiva (o `Message-ID` é
 *   único por organização).
 * - **Senha recusada não é repetida.** A caixa é pausada na primeira recusa, a pessoa é
 *   avisada (Central e e-mail) e nenhum login novo acontece até ela atualizar a senha:
 *   insistir bloquearia a conta do cliente no provedor.
 * - **Falha de uma mensagem não derruba o resto.** Ilegível ou grande demais vai para os
 *   ignorados com o motivo e o cursor segue.
 * - **Prazo e teto.** A rodada para no prazo e no teto de mensagens; o que sobrou fica para
 *   a seguinte. Uma caixa lenta não atrasa as outras (rodízio por `ultima_rodada_em`).
 * - **Trava por caixa** (`travado_ate`): duas rodadas sobrepostas não leem a mesma caixa.
 * - **EMAIL_CANAL=desligado** não lê nem abre conexão (`emailCanalLigado`).
 *
 * Nenhum conteúdo de e-mail entra em log.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { canalDesativado } from "@/lib/channels/desativado";
import { logger } from "@/lib/logger";
import { ehOperante } from "@/lib/organizacao/operante";

import { avisarSenhaRecusada } from "./avisos";
import { acharCaixa, type CaixaDeEmail } from "./caixa";
import { emailCanalLigado } from "./chave";
import type { ConfigDaCaixa } from "./conexao";
import {
  avancarCursor,
  lerEstado,
  pausar,
  pegarTrava,
  recuoEmMs,
  registrarFalha,
  registrarRodadaBoa,
  reposicionarCursor,
  soltarTrava,
  type EstadoDaCaixa,
} from "./estado";
import { ingerirEmail, registrarIgnorado } from "./ingest";
import { abrirLeitorImap, FalhaDeLeitura, type AbrirLeitor, type LeitorDeCaixa } from "./leitura-imap";
import { lerEmail } from "./parse";
import { lerSenhaDaCaixa } from "./segredo";

/** Mensagens por caixa por rodada. O resto espera a próxima. */
export const TETO_POR_RODADA = 50;
/** Prazo total da rodada (o agendador dá 60 s à chamada). */
export const PRAZO_DA_RODADA_MS = 45_000;
/** E-mail maior que isto não é baixado. */
export const TAMANHO_MAXIMO_DO_EMAIL_BYTES = 30 * 1024 * 1024;
/** Caixas por rodada (cada uma é uma conexão de rede). */
export const CAIXAS_POR_RODADA = 20;
/** A trava vale um pouco mais que o prazo: uma rodada que morreu solta a caixa sozinha. */
const FOLGA_DA_TRAVA_MS = 30_000;
const FALHAS_PARA_ALERTAR = 5;

const CAUSAS_DE_SENHA = new Set(["senha_recusada", "verificacao_em_duas_etapas"]);

export interface DependenciasDaRodada {
  agora?: () => Date;
  abrirLeitor?: AbrirLeitor;
  lerSenha?: typeof lerSenhaDaCaixa;
  ingerir?: typeof ingerirEmail;
  avisarSenhaRecusada?: typeof avisarSenhaRecusada;
  canalLigado?: () => boolean;
  prazoMs?: number;
  tetoPorRodada?: number;
  tamanhoMaximoBytes?: number;
}

export type DesfechoDaCaixa =
  | "lida"
  | "ocupada"
  | "pausada"
  | "sem_estado"
  | "em_recuo"
  | "senha_recusada"
  | "falha";

export interface ResumoDaCaixa {
  caixaId: string;
  organizationId: string;
  desfecho: DesfechoDaCaixa;
  lidas: number;
  ingeridas: number;
  duplicadas: number;
  ignoradas: number;
  puladas: number;
  prazoEsgotado: boolean;
}

const resumoVazio = (caixaId: string, organizationId: string, desfecho: DesfechoDaCaixa): ResumoDaCaixa => ({
  caixaId,
  organizationId,
  desfecho,
  lidas: 0,
  ingeridas: 0,
  duplicadas: 0,
  ignoradas: 0,
  puladas: 0,
  prazoEsgotado: false,
});

function configDeConexao(caixa: CaixaDeEmail, senha: string): ConfigDaCaixa {
  return { endereco: caixa.endereco, usuario: caixa.config.usuario, senha, imap: caixa.config.imap, smtp: caixa.config.smtp };
}

/** Uma rodada de UMA caixa. Nunca lança por falha de rede ou de e-mail: devolve o desfecho. */
export async function rodarCaixa(
  admin: SupabaseClient,
  organizationId: string,
  caixa: CaixaDeEmail,
  prazoFinal: Date,
  deps: DependenciasDaRodada = {},
): Promise<ResumoDaCaixa> {
  const agora = deps.agora ?? (() => new Date());
  const resumo = resumoVazio(caixa.id, organizationId, "lida");

  const estado: EstadoDaCaixa | null = await lerEstado(admin, organizationId, caixa.id);
  if (!estado) return { ...resumo, desfecho: "sem_estado" };
  if (estado.pausaMotivo) return { ...resumo, desfecho: "pausada" };
  if (estado.falhasSeguidas > 0 && estado.ultimaRodadaEm) {
    const espera = recuoEmMs(estado.falhasSeguidas);
    if (agora().getTime() < new Date(estado.ultimaRodadaEm).getTime() + espera) return { ...resumo, desfecho: "em_recuo" };
  }

  const travadaAte = new Date(Math.max(prazoFinal.getTime(), agora().getTime()) + FOLGA_DA_TRAVA_MS);
  if (!(await pegarTrava(admin, organizationId, caixa.id, agora(), travadaAte))) return { ...resumo, desfecho: "ocupada" };

  let leitor: LeitorDeCaixa | null = null;
  try {
    const senha = await (deps.lerSenha ?? lerSenhaDaCaixa)(admin, { organizationId, channelSessionId: caixa.id });
    if (!senha) {
      // Sem senha legível não há o que tentar; é a mesma situação de uma senha recusada.
      return await pausarPorSenha(admin, organizationId, caixa, "senha_ausente", deps, resumo);
    }

    try {
      leitor = await (deps.abrirLeitor ?? abrirLeitorImap)(configDeConexao(caixa, senha));
    } catch (erro) {
      if (erro instanceof FalhaDeLeitura && CAUSAS_DE_SENHA.has(erro.causa)) {
        return await pausarPorSenha(admin, organizationId, caixa, "senha_recusada", deps, resumo);
      }
      await registrarFalha(admin, organizationId, caixa.id, agora(), estado.falhasSeguidas);
      logger.warn("[email.rodada] não deu para abrir a caixa", {
        organizationId,
        caixaId: caixa.id,
        causa: erro instanceof FalhaDeLeitura ? erro.causa : "desconhecida",
        falhasSeguidas: estado.falhasSeguidas + 1,
      });
      return { ...resumo, desfecho: "falha" };
    }

    // UIDVALIDITY diferente: os UIDs antigos não valem mais. Recomeça do fim, sem importar o passado.
    if (estado.uidValidity !== leitor.uidValidity) {
      await reposicionarCursor(admin, organizationId, caixa.id, leitor.uidValidity, Math.max(leitor.uidNext - 1, 0));
      await registrarRodadaBoa(admin, organizationId, caixa.id, agora());
      return resumo;
    }

    const teto = deps.tetoPorRodada ?? TETO_POR_RODADA;
    const maximo = deps.tamanhoMaximoBytes ?? TAMANHO_MAXIMO_DO_EMAIL_BYTES;
    const ingerir = deps.ingerir ?? ingerirEmail;
    const lista = await leitor.listarDesde(estado.ultimoUid + 1, teto);

    let falhou = false;
    for (const m of lista) {
      if (agora().getTime() >= prazoFinal.getTime()) {
        resumo.prazoEsgotado = true;
        break;
      }
      resumo.lidas++;
      try {
        if (m.tamanho > maximo) {
          await registrarIgnorado(admin, {
            organizationId,
            caixaId: caixa.id,
            uid: m.uid,
            email: { messageId: `<grande-${caixa.id}-${m.uid}@canal-email.local>`, remetente: { endereco: "desconhecido", nome: null }, assunto: "", data: null },
            motivo: "grande_demais",
          });
          resumo.puladas++;
        } else {
          const cru = await leitor.baixar(m.uid);
          if (!cru) {
            resumo.puladas++;
          } else {
            const lido = await lerEmail(cru);
            if (!lido.ok) {
              await registrarIgnorado(admin, {
                organizationId,
                caixaId: caixa.id,
                uid: m.uid,
                email: { messageId: `<ilegivel-${caixa.id}-${m.uid}@canal-email.local>`, remetente: { endereco: "desconhecido", nome: null }, assunto: "", data: null },
                motivo: lido.motivo === "sem_remetente" ? "malformado" : "ilegivel",
              });
              resumo.puladas++;
            } else {
              const r = await ingerir(admin, { organizationId, caixa: { id: caixa.id, endereco: caixa.endereco }, uid: m.uid, email: lido.email });
              if (r.resultado === "ingerido") resumo.ingeridas++;
              else if (r.resultado === "duplicado") resumo.duplicadas++;
              else resumo.ignoradas++;
            }
          }
        }
        await avancarCursor(admin, organizationId, caixa.id, m.uid);
      } catch (erro) {
        // Rede, banco ou servidor: para aqui, com o cursor na última mensagem boa.
        falhou = true;
        resumo.lidas--;
        logger.warn("[email.rodada] mensagem não tratada; a próxima rodada retoma daqui", {
          organizationId,
          caixaId: caixa.id,
          erro: erro instanceof Error ? erro.message.slice(0, 120) : "desconhecido",
        });
        break;
      }
    }

    if (falhou) {
      await registrarFalha(admin, organizationId, caixa.id, agora(), estado.falhasSeguidas);
      if (estado.falhasSeguidas + 1 >= FALHAS_PARA_ALERTAR) {
        logger.error("[email.rodada] falhas seguidas na caixa", { organizationId, caixaId: caixa.id, falhasSeguidas: estado.falhasSeguidas + 1 });
      }
      return { ...resumo, desfecho: "falha" };
    }
    await registrarRodadaBoa(admin, organizationId, caixa.id, agora());
    return resumo;
  } finally {
    await soltarTrava(admin, organizationId, caixa.id).catch(() => undefined);
    if (leitor) await leitor.fechar().catch(() => undefined);
  }
}

async function pausarPorSenha(
  admin: SupabaseClient,
  organizationId: string,
  caixa: CaixaDeEmail,
  motivo: "senha_recusada" | "senha_ausente",
  deps: DependenciasDaRodada,
  resumo: ResumoDaCaixa,
): Promise<ResumoDaCaixa> {
  await pausar(admin, organizationId, caixa.id, motivo);
  await (deps.avisarSenhaRecusada ?? avisarSenhaRecusada)(admin, {
    organizationId,
    caixaId: caixa.id,
    endereco: caixa.endereco,
  }).catch(() => undefined);
  return { ...resumo, desfecho: "senha_recusada" };
}

export interface ResumoDaRodada {
  desligado: boolean;
  caixas: ResumoDaCaixa[];
}

/**
 * A rodada inteira: escolhe as caixas por rodízio (a que foi lida há mais tempo primeiro) e
 * lê uma a uma até o prazo. Caixa de empresa parada, arquivada ou desativada fica de fora.
 */
export async function rodarRodada(admin: SupabaseClient, deps: DependenciasDaRodada = {}): Promise<ResumoDaRodada> {
  if (!(deps.canalLigado ?? emailCanalLigado)()) return { desligado: true, caixas: [] };

  const agora = deps.agora ?? (() => new Date());
  const prazoFinal = new Date(agora().getTime() + (deps.prazoMs ?? PRAZO_DA_RODADA_MS));

  const { data, error } = await admin
    .from("email_sync_estado")
    .select("channel_session_id, organization_id")
    .is("pausa_motivo", null)
    .order("ultima_rodada_em", { ascending: true, nullsFirst: true })
    .limit(CAIXAS_POR_RODADA);
  if (error) throw new Error(`email_rodada_lookup_failed: ${error.message}`);

  const caixas: ResumoDaCaixa[] = [];
  const statusDaOrg = new Map<string, boolean>();
  for (const linha of (data ?? []) as Array<{ channel_session_id: string; organization_id: string }>) {
    if (agora().getTime() >= prazoFinal.getTime()) break;
    const orgId = linha.organization_id;
    if (!statusDaOrg.has(orgId)) {
      const { data: org } = await admin.from("organizations").select("status").eq("id", orgId).maybeSingle();
      statusDaOrg.set(orgId, ehOperante((org as { status?: string | null } | null)?.status));
    }
    if (!statusDaOrg.get(orgId)) continue;

    const caixa = await acharCaixa(admin, orgId, linha.channel_session_id);
    if (!caixa) continue;
    const { data: sessao } = await admin
      .from("channel_sessions")
      .select("metadata")
      .eq("organization_id", orgId)
      .eq("id", caixa.id)
      .maybeSingle();
    if (canalDesativado((sessao as { metadata?: unknown } | null)?.metadata)) continue;

    caixas.push(await rodarCaixa(admin, orgId, caixa, prazoFinal, deps));
  }
  return { desligado: false, caixas };
}
