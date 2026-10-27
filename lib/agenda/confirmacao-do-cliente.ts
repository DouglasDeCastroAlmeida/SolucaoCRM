/**
 * A REGRA DA RESPOSTA DO CLIENTE AO LEMBRETE (mudança 007, REQ-002 e REQ-003).
 *
 * Pura de propósito: sem banco, sem relógio (`agora` entra por parâmetro), sem
 * I/O. Quem lê a mensagem e os compromissos do contato e quem grava o efeito é
 * `lib/agenda/aplicar-confirmacao-do-cliente.ts`; aqui só se decide.
 *
 * Duas perguntas, em ordem:
 *   1. a mensagem INTEIRA é uma resposta curta? ("1", "sim", "confirmo", "ok",
 *      "confirmado" confirmam; "2", "cancelar", "não vou", "remarcar" pedem
 *      remarcação). "sim, mas posso mudar?" NÃO é: a frase vai para o fluxo normal.
 *   2. existe compromisso a que ela responde? O lembrete tem de ter saído há ATÉ
 *      48 h, o compromisso tem de ser futuro e estar aberto (`pending` ou
 *      `confirmed` — o mesmo recorte do índice da migration 0719). Sem isso,
 *      "1" é só um "1" no meio de uma conversa, e o agente ou a equipe respondem.
 *
 * Com mais de um compromisso elegível vale o de início mais próximo.
 */

/** Quanto tempo depois do lembrete uma resposta ainda conta (AC-002.3). */
export const JANELA_DA_RESPOSTA_MS = 48 * 3_600_000;

/** Estados em que o compromisso ainda está aberto — o recorte do índice parcial. */
export const ESTADOS_ABERTOS = ["pending", "confirmed"] as const;

export type RespostaDoCliente = "confirmar" | "remarcar";

export interface CompromissoCandidato {
  id: string;
  comeca: Date;
  /** `calendar_appointments.status`. */
  estado: string;
  clientConfirmedAt: Date | null;
  clientRescheduleRequestedAt: Date | null;
  /** `reminder_sent_at`: o instante do último lembrete enviado deste compromisso. */
  ultimoLembreteEm: Date | null;
}

export type DecisaoDaResposta =
  | { tipo: "confirmar"; compromissoId: string }
  | { tipo: "remarcar"; compromissoId: string }
  /** Resposta repetida: nada muda e nada é respondido (vale para "1" e para "2"). */
  | { tipo: "ja_confirmado"; compromissoId: string }
  | { tipo: "nada" };

const PALAVRAS_DE_CONFIRMACAO = new Set(["1", "sim", "confirmo", "ok", "confirmado"]);
const PALAVRAS_DE_REMARCACAO = new Set(["2", "cancelar", "nao vou", "remarcar"]);

/** Minúsculas, sem acento, sem pontuação nem emoji, espaços colapsados. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A mensagem inteira é uma resposta curta ao lembrete? Barata: roda em toda entrada. */
export function classificarRespostaDoCliente(texto: string | null | undefined): RespostaDoCliente | null {
  if (!texto) return null;
  const limpo = normalizar(texto);
  if (limpo === "") return null;
  if (PALAVRAS_DE_CONFIRMACAO.has(limpo)) return "confirmar";
  if (PALAVRAS_DE_REMARCACAO.has(limpo)) return "remarcar";
  return null;
}

function elegivel(c: CompromissoCandidato, agora: Date): boolean {
  if (!(ESTADOS_ABERTOS as readonly string[]).includes(c.estado)) return false;
  if (c.comeca.getTime() <= agora.getTime()) return false;
  if (!c.ultimoLembreteEm) return false;
  const idade = agora.getTime() - c.ultimoLembreteEm.getTime();
  return idade >= 0 && idade <= JANELA_DA_RESPOSTA_MS;
}

const maisProximo = (a: CompromissoCandidato, b: CompromissoCandidato) =>
  a.comeca.getTime() - b.comeca.getTime();

export function decidirRespostaDoCliente(input: {
  texto: string | null | undefined;
  agora: Date;
  candidatos: readonly CompromissoCandidato[];
}): DecisaoDaResposta {
  const resposta = classificarRespostaDoCliente(input.texto);
  if (!resposta) return { tipo: "nada" };

  const elegiveis = input.candidatos.filter((c) => elegivel(c, input.agora)).sort(maisProximo);
  if (elegiveis.length === 0) return { tipo: "nada" };

  const jaFeito = (c: CompromissoCandidato) =>
    resposta === "confirmar" ? c.clientConfirmedAt !== null : c.clientRescheduleRequestedAt !== null;

  // Vale o mais próximo AINDA NÃO tratado. Decisão deliberada: com dois horários, quem responde "1"
  // ao lembrete do segundo, depois de o primeiro já estar confirmado, precisa ser atendido, e a
  // resposta cita dia e hora para ele conferir qual foi confirmado. "Repetida não muda nada" vale
  // quando TODOS os elegíveis já foram tratados (abaixo).
  const aberto = elegiveis.find((c) => !jaFeito(c));
  if (aberto) return { tipo: resposta, compromissoId: aberto.id };
  return { tipo: "ja_confirmado", compromissoId: elegiveis[0]!.id };
}
