/**
 * ERROS DE FERRAMENTA SEGUIDOS LEVAM A CONVERSA A UMA PESSOA (AC-005.3, mudança SDD 006).
 *
 * Um modelo que erra a chamada de uma ferramenta (argumento inválido, ferramenta que não
 * existe) e insiste no erro deixa o cliente esperando uma resposta que não vem. Na SEGUNDA
 * falha seguida, na mesma conversa, o turno para e a conversa vai para a fila humana com o
 * motivo `erro_de_ferramenta`. Um sucesso reinicia a contagem, então um modelo que se
 * corrige nunca é transferido.
 *
 * ═══ O que conta como "erro de ferramenta" (decisão, medida por teste) ═══
 *
 * Conta: o erro que o MODELO cometeu ao chamar.
 *   · argumento que não passa no schema (o SDK devolve `AI_InvalidToolInputError`) e
 *     ferramenta inexistente (`AI_NoSuchToolError`) — AC-006.5;
 *   · `{ ok: false, error: { code } }` com código de chamada errada (`invalid_payload`, ...);
 *   · `{ error: "mensagem" }`, o formato com que a ponte do MCP devolve a recusa de um
 *     handler (lead que não existe, campo faltando), exceto quando a mensagem é de
 *     infraestrutura.
 *
 * NÃO conta, e também não reinicia (a falha não diz nada sobre o modelo):
 *   · falha de infraestrutura: rede, banco, timeout, resultado incerto, exceção lançada
 *     dentro da ferramenta, `internal_error`;
 *   · travas do próprio sistema: disjuntor de ferramenta, teto de envios, recusa de escopo.
 *   Transferir uma conversa porque o banco piscou duas vezes seria o mesmo defeito que
 *   `falha-do-provedor.ts` evita do outro lado: erro DE FERRAMENTA nunca é falha de provedor,
 *   e erro de INFRAESTRUTURA da ferramenta nunca é erro do modelo.
 *
 * ═══ Onde mora o estado ═══
 *
 * `ai_falhas_de_ferramenta` (migration 0724): uma linha por conversa, com a contagem. A
 * contagem atravessa turnos da mesma conversa. Só ids e um número são gravados — nunca
 * argumento, resultado ou texto de erro (podem carregar dado do cliente ou segredo).
 *
 * O contador é um `stopWhen` do `run-model-call`: ele lê o último passo, atualiza a
 * contagem e manda o laço parar quando estoura. Quem transfere é o chamador, depois do
 * laço (`estourou()`). Nunca lança: o banco fora do ar degrada para contagem na memória.
 */
import type pg from 'pg';

import type { Logger } from '@/lib/agent-engine/obs/logger';

/** Dois erros seguidos transferem. */
export const LIMITE_DE_ERROS_SEGUIDOS = 2;

export type VeredictoDaChamada = 'erro' | 'sucesso' | 'ignorar';

/** Nomes que o SDK dá ao erro de chamada do modelo (argumento fora do schema, ferramenta inexistente). */
const ERROS_DE_CHAMADA_DO_SDK: ReadonlySet<string> = new Set(['AI_InvalidToolInputError', 'AI_NoSuchToolError']);

/** Códigos de `{ ok: false, error: { code } }` que dizem "o modelo chamou errado". */
const CODIGOS_DE_CHAMADA_ERRADA: ReadonlySet<string> = new Set([
  'invalid_payload',
  'invalid_arguments',
  'invalid_input',
  'validation_error',
  'invalid_transition',
  'note_not_found',
  'template_desconhecido',
]);

/** Mensagem de `{ error: "..." }` que é de infraestrutura, não do modelo. */
const MENSAGEM_DE_INFRAESTRUTURA =
  /fetch failed|econn|enotfound|etimedout|socket hang up|timeout|timed out|tempo esgotado|network|rate limit|too many requests|temporar|indispon|unavailable|\b50[0-4]\b|connection|connect |database|banco de dados|internal|em curso|in progress/i;

function eObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function veredictoDoResultado(output: unknown): VeredictoDaChamada {
  if (!eObjeto(output)) return 'sucesso';
  if (output.resultado_incerto === true) return 'ignorar';
  if (output.permitido === false) return 'ignorar';
  if (output.ok === false) {
    const codigo = eObjeto(output.error) && typeof output.error.code === 'string' ? output.error.code : '';
    return CODIGOS_DE_CHAMADA_ERRADA.has(codigo) ? 'erro' : 'ignorar';
  }
  if (typeof output.error === 'string' && output.error !== '') {
    return MENSAGEM_DE_INFRAESTRUTURA.test(output.error) ? 'ignorar' : 'erro';
  }
  return 'sucesso';
}

/** O veredito de cada chamada de ferramenta de UM passo do laço do modelo (partes que não são de ferramenta saem). */
export function veredictosDoPasso(passo: unknown): VeredictoDaChamada[] {
  const partes = eObjeto(passo) && Array.isArray(passo.content) ? (passo.content as unknown[]) : [];
  const saida: VeredictoDaChamada[] = [];
  for (const parte of partes) {
    if (!eObjeto(parte)) continue;
    if (parte.type === 'tool-result') {
      saida.push(veredictoDoResultado(parte.output));
    } else if (parte.type === 'tool-error') {
      const nome = eObjeto(parte.error) && typeof parte.error.name === 'string' ? parte.error.name : '';
      saida.push(ERROS_DE_CHAMADA_DO_SDK.has(nome) ? 'erro' : 'ignorar');
    }
  }
  return saida;
}

/** A contagem depois de aplicar os vereditos em ordem: erro soma, sucesso zera, ignorar não mexe. */
export function seguidasDepois(atual: number, vereditos: readonly VeredictoDaChamada[]): number {
  let n = atual;
  for (const v of vereditos) {
    if (v === 'erro') n += 1;
    else if (v === 'sucesso') n = 0;
  }
  return n;
}

export interface ContadorDeErrosDeFerramenta {
  /** Para o `stopWhen` do `run-model-call`: lê o último passo e responde se o laço deve parar. */
  pararQuando(info: { steps: ReadonlyArray<unknown> }): Promise<boolean>;
  /** O limite foi atingido neste turno? */
  estourou(): boolean;
  /** Volta a contagem a zero (depois de a conversa ser passada a uma pessoa). Nunca lança. */
  zerar(): Promise<void>;
}

export function criarContadorDeErrosDeFerramenta(deps: {
  pool: Pick<pg.Pool, 'query'>;
  organizationId: string;
  conversationId: string;
  log: Logger;
  limite?: number;
}): ContadorDeErrosDeFerramenta {
  const limite = deps.limite ?? LIMITE_DE_ERROS_SEGUIDOS;
  let seguidas: number | null = null;
  let passosVistos = 0;
  let estourou = false;

  const ler = async (): Promise<number> => {
    if (seguidas !== null) return seguidas;
    try {
      const { rows } = await deps.pool.query<{ seguidas: number }>(
        'select seguidas from ai_falhas_de_ferramenta where organization_id = $1 and conversation_id = $2',
        [deps.organizationId, deps.conversationId],
      );
      seguidas = rows[0]?.seguidas ?? 0;
    } catch {
      deps.log.warn('contagem de erros de ferramenta não lida — segue na memória');
      seguidas = 0;
    }
    return seguidas;
  };

  const gravar = async (n: number): Promise<void> => {
    seguidas = n;
    try {
      await deps.pool.query(
        `insert into ai_falhas_de_ferramenta (organization_id, conversation_id, seguidas, ultima_em)
         values ($1, $2, $3, now())
         on conflict (conversation_id) do update
           set seguidas = excluded.seguidas, ultima_em = now()
         where ai_falhas_de_ferramenta.organization_id = excluded.organization_id`,
        [deps.organizationId, deps.conversationId, n],
      );
    } catch {
      deps.log.warn('contagem de erros de ferramenta não gravada — segue na memória');
    }
  };

  return {
    async pararQuando({ steps }) {
      // O SDK pergunta uma vez por passo; o guarda impede contar o mesmo passo duas vezes.
      if (steps.length <= passosVistos) return estourou;
      passosVistos = steps.length;
      const vereditos = veredictosDoPasso(steps[steps.length - 1]);
      if (vereditos.length === 0) return estourou;
      const antes = await ler();
      const depois = seguidasDepois(antes, vereditos);
      if (depois !== antes) await gravar(depois);
      if (depois >= limite) estourou = true;
      return estourou;
    },
    estourou: () => estourou,
    async zerar() {
      await gravar(0);
    },
  };
}

/** Primeira linha do resumo que vai a quem assume. Texto fixo: nenhum modelo é chamado para escrevê-lo. */
export const RESUMO_DO_HANDOFF_POR_ERRO_DE_FERRAMENTA =
  'O assistente errou duas vezes seguidas ao usar uma de suas ferramentas e parou de responder — ' +
  'o cliente NÃO pediu uma pessoa. Assuma a conversa; para devolvê-la ao atendimento automático, ' +
  'use "Devolver ao automático" no cabeçalho da conversa.';

/** Título do item da Central que este handoff abre. */
export const TITULO_DO_HANDOFF_POR_ERRO_DE_FERRAMENTA = 'O assistente travou numa ferramenta — assumir a conversa';
