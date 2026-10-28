/**
 * A FALHA DO PROVEDOR DE IA QUE NÃO PASSA SOZINHA (AC-001.7, mudança SDD 006).
 *
 * Chave revogada, saldo zerado ou serviço fora do ar depois de todas as
 * tentativas: o agente não tem como responder, e deixar o cliente no vácuo
 * quebra o invariante de que nenhuma demanda fica sem próximo passo. A escolta
 * do turno (`comHandoffSeOrcamentoAcabar`, `inbound-turn.ts`) usa este veredito
 * para levar a conversa a uma pessoa.
 *
 * Só classifica erro que VEIO DO PROVEDOR (o SDK marca com `AI_APICallError` /
 * `AI_RetryError`, ou a frase de falta de saldo). Um `401` de uma ferramenta do
 * turno (agenda, MCP externo) não é "a chave de IA foi recusada", e tratá-lo
 * assim transferiria conversas por um defeito que não é do provedor.
 *
 * Nenhum código resolve sozinho o item `ia_provedor_indisponivel` quando o provedor
 * volta: quem corrigiu a chave ou recarregou o saldo resolve o item à mão. Este aviso
 * cobre os turnos com escolta (inbound, follow-up e resposta de caso); o aviso antigo
 * de falta de saldo (`espera-de-saldo.ts`) cobre os demais, como o do Operador.
 *
 * Função pura: não lê banco, não lê relógio, não escreve o texto do provedor em
 * lugar nenhum (a mensagem crua pode ecoar a chave).
 */
import { provedorSemSaldo } from '../queue/espera-de-saldo';
import { identificarConteudoBloqueado } from '../edge/llm/conteudo-bloqueado';

export type CausaDaFalhaDoProvedor = 'chave_recusada' | 'sem_saldo' | 'provedor_fora';

export type VeredictoDaFalha =
  | { tipo: 'permanente'; causa: CausaDaFalhaDoProvedor; httpStatus: number | null }
  | { tipo: 'transitoria' };

const SEM_SALDO = /credit balance is too low|insufficient.{0,20}(credit|quota|funds)|no credits remaining|exceeded your current quota/i;

interface ErroDaApi {
  name?: unknown;
  message?: unknown;
  statusCode?: unknown;
  status?: unknown;
  lastError?: unknown;
  cause?: unknown;
}

/** Desembrulha o erro de nova tentativa do SDK e as causas encadeadas (no máximo 4 níveis). */
function cadeia(err: unknown): ErroDaApi[] {
  const saida: ErroDaApi[] = [];
  let atual: unknown = err;
  for (let i = 0; i < 4 && typeof atual === 'object' && atual !== null; i += 1) {
    const e = atual as ErroDaApi;
    saida.push(e);
    atual = e.lastError ?? e.cause;
  }
  return saida;
}

function statusDe(e: ErroDaApi): number | null {
  const s = e.statusCode ?? e.status;
  return typeof s === 'number' ? s : null;
}

export function classificarFalhaDoProvedor(
  err: unknown,
  opts: { ultimaTentativa?: boolean } = {},
): VeredictoDaFalha {
  if (identificarConteudoBloqueado(err) !== null) return { tipo: 'transitoria' };
  const elos = cadeia(err);
  // Erro de ferramenta (agenda, MCP externo) nunca é falha do provedor, mesmo com
  // status numérico ou com uma chamada HTTP na causa. Só o elo da chamada ao modelo
  // (`AI_APICallError`) vale, e só o status DELE.
  if (elos.some((e) => e.name === 'AI_ToolExecutionError')) return { tipo: 'transitoria' };
  const daApi = elos.find((e) => e.name === 'AI_APICallError');
  const status = daApi !== undefined ? statusDe(daApi) : null;
  const mensagens = elos.map((e) => (typeof e.message === 'string' ? e.message : ''));
  const semSaldoPelaFrase = provedorSemSaldo(err) !== null || mensagens.some((m) => SEM_SALDO.test(m));

  // Falta de saldo: a frase é o sinal confiável (400 e 429 dividem o status com
  // pedido malformado e limite de ritmo). Só vale vinda do provedor.
  if (status === 402 || (daApi !== undefined && semSaldoPelaFrase)) {
    return { tipo: 'permanente', causa: 'sem_saldo', httpStatus: status };
  }
  if (daApi === undefined) return { tipo: 'transitoria' };
  if (status === 401 || status === 403) {
    return { tipo: 'permanente', causa: 'chave_recusada', httpStatus: status };
  }
  // 5xx e falha de rede: passam sozinhos; só viram permanentes quando a fila
  // já gastou todas as tentativas (o último relance do job).
  const foraDoAr = (status !== null && status >= 500) || status === null;
  if (foraDoAr && opts.ultimaTentativa === true) {
    return { tipo: 'permanente', causa: 'provedor_fora', httpStatus: status };
  }
  return { tipo: 'transitoria' };
}

const FRASE_DA_CAUSA: Record<CausaDaFalhaDoProvedor, string> = {
  chave_recusada: 'a chave de IA foi recusada pelo provedor',
  sem_saldo: 'a conta do provedor de IA está sem saldo',
  provedor_fora: 'o provedor de IA ficou fora do ar depois de várias tentativas',
};

/**
 * Sobe da escolta depois que a conversa foi passada a uma pessoa. `terminal`
 * manda a fila para `cancelJob`: tentar de novo não muda nada e o cliente já tem
 * quem o atenda. A mensagem NÃO carrega o texto do provedor (pode ecoar a chave).
 */
export class LlmProvedorIndisponivelError extends Error {
  override readonly name = 'llm_provedor_indisponivel';
  readonly terminal = true;
  constructor(
    readonly causa: CausaDaFalhaDoProvedor,
    readonly httpStatus: number | null,
  ) {
    super(`provedor de IA indisponível: ${FRASE_DA_CAUSA[causa]}`);
  }
}

export const TITULO_DO_AVISO_DO_PROVEDOR = 'O serviço de IA parou de responder — conversa passada para uma pessoa';

export function corpoDoAvisoDoProvedor(causa: CausaDaFalhaDoProvedor): string {
  return (
    `O assistente não conseguiu responder porque ${FRASE_DA_CAUSA[causa]}. ` +
    'Esta conversa foi passada para a fila de uma pessoa, e outras podem seguir o mesmo caminho até o problema ser resolvido. ' +
    'O que fazer: abra Configurações › IA e confira a chave do provedor (e o saldo da conta dele). ' +
    'Depois de corrigir, devolva as conversas ao atendimento automático pelo cabeçalho de cada uma.'
  );
}

/**
 * Abre UM aviso na Central por organização enquanto o problema durar: não abre
 * outro se já há um aberto ou visto (`ack`); só volta a abrir depois de resolvido.
 * Nunca lança — o aviso é informação, a passagem já aconteceu.
 */
export async function abrirAvisoDoProvedor(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  d: { tenantId: string; conversationId: string; causa: CausaDaFalhaDoProvedor },
  log: { warn: (msg: string, f?: Record<string, unknown>) => void },
): Promise<void> {
  try {
    await db.query(
      `insert into agent_inbox_items (organization_id, kind, severity, title, body, ref_kind, ref_id)
       select $1, 'ia_provedor_indisponivel', 'critical', $2, $3, 'conversation', $4
        where not exists (
          select 1 from agent_inbox_items
           where organization_id = $1
             and kind = 'ia_provedor_indisponivel'
             and status in ('open', 'ack')
        )`,
      [d.tenantId, TITULO_DO_AVISO_DO_PROVEDOR, corpoDoAvisoDoProvedor(d.causa), d.conversationId],
    );
  } catch (err) {
    log.warn('aviso de provedor indisponível não entrou na Central — a passagem já aconteceu', {
      error: err instanceof Error ? err.message.slice(0, 120) : 'erro desconhecido',
    });
  }
}
