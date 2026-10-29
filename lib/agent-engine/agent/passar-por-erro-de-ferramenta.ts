/**
 * O DESFECHO DO TURNO QUE ESTOUROU O LIMITE DE ERROS DE FERRAMENTA (AC-005.3, mudança 006).
 *
 * Extraído de `inbound-turn.ts` para ser testável sem montar um turno inteiro. Recebe tudo
 * por injeção (aviso, passagem, contador), então não toca banco nem canal.
 *
 * Ordem: AVISA o cliente e só então passa (a passagem arma a trava que veta o envio). Aviso
 * que falha não impede a passagem — sem atendente o pior já teria acontecido.
 * Se o próprio modelo já tinha passado a conversa neste turno, só reinicia a contagem.
 *
 * Devolve `true` quando o turno deve ENCERRAR aqui (a conversa foi passada por este caminho).
 */
import type { BriefingDaPassagem } from '@/lib/escalacao/briefing-da-passagem';
import type { MotivoDaPassagem, OrigemDaPassagem } from '@/lib/escalacao/passagem';
import {
  RESUMO_DO_HANDOFF_POR_ERRO_DE_FERRAMENTA,
  TITULO_DO_HANDOFF_POR_ERRO_DE_FERRAMENTA,
} from '@/lib/ai/handoff/falhas-de-ferramenta';

import type { Logger } from '../obs/logger';
import type { DesfechoDoAviso } from './aviso-de-escalacao';

export interface PassagemPorErroDeFerramenta {
  reason: 'erro_de_ferramenta';
  conversationSummary: string;
  inboxTitle: string;
  passagem: { origem: OrigemDaPassagem; motivoCodigo: MotivoDaPassagem; briefing: BriefingDaPassagem };
  avisoAoLead: DesfechoDoAviso;
}

export async function passarPorErroDeFerramenta(deps: {
  contador: { estourou(): boolean; zerar(): Promise<void> };
  passouParaAEquipe: boolean;
  avisarLead: () => Promise<DesfechoDoAviso>;
  /** O briefing do turno (checkpoint + o que o cliente disse), sem o resumo fixo. */
  briefingBase: () => BriefingDaPassagem;
  passar: (passagem: PassagemPorErroDeFerramenta) => Promise<void>;
  log: Logger;
}): Promise<boolean> {
  if (!deps.contador.estourou()) return false;
  if (deps.passouParaAEquipe) {
    await deps.contador.zerar();
    return false;
  }
  let aviso: DesfechoDoAviso;
  try {
    aviso = await deps.avisarLead();
  } catch (err) {
    deps.log.warn('aviso ao lead falhou antes da passagem por erro de ferramenta', {
      error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    aviso = { avisado: false, porque: 'erro_no_envio' };
  }
  const doTurno = deps.briefingBase();
  const briefing: BriefingDaPassagem = {
    ...doTurno,
    body: `${RESUMO_DO_HANDOFF_POR_ERRO_DE_FERRAMENTA}\n\n${doTurno.body}`,
  };
  await deps.passar({
    reason: 'erro_de_ferramenta',
    conversationSummary: briefing.body,
    inboxTitle: TITULO_DO_HANDOFF_POR_ERRO_DE_FERRAMENTA,
    passagem: { origem: 'runtime_nativo', motivoCodigo: 'erro_de_ferramenta', briefing },
    avisoAoLead: aviso,
  });
  deps.log.warn('duas falhas seguidas de ferramenta — conversa devolvida à fila humana', {
    lead_avisado: aviso.avisado,
  });
  await deps.contador.zerar();
  return true;
}
