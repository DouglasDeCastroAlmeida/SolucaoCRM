"use client";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { MoreVertical, Search, UserRound } from "lucide-react";
import { Voltar } from "@/lib/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { servidorDeVideo } from "@/lib/video/jitsi";
import type { AbrirReserva } from "@/components/agenda/ReservarServicoNaConversa";
import type { AbrirVideo } from "@/components/inbox/VideoCallButton";
import { useT } from "@/hooks/i18n/useT";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { JanelaSelo } from "@/components/inbox/JanelaSelo";
import { ChannelLogo } from "@/components/inbox/ChannelLogo";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useClaimConversation } from "@/hooks/inbox/useClaimConversation";
import { useReleaseConversation } from "@/hooks/inbox/useReleaseConversation";
import {
  useMarkPersonalContact,
  useUnmarkPersonalContact,
} from "@/hooks/contacts/usePersonalContact";
import { ROLE_RANK } from "@/lib/auth/types";
import {
  useArchiveConversation,
  useCloseConversation,
  useReopenConversation,
} from "@/hooks/inbox/useCloseConversation";
import { useResumeAiAttendance } from "@/hooks/inbox/useResumeAiAttendance";
import { usePauseAiAttendance } from "@/hooks/inbox/usePauseAiAttendance";
import { useAutomaticoAtivo } from "@/hooks/ai/useAutomaticoAtivo";
import { OwnerBadge } from "@/components/kanban/OwnerBadge";
import { FaixaDaCarteira } from "@/components/inbox/FaixaDaCarteira";
import { comandoDaConversa, ROTULO_DO_MOTIVO } from "@/lib/inbox/comando-da-conversa";
import { ReassignDialog } from "@/components/inbox/ReassignDialog";
import { SnoozeButton } from "@/components/inbox/SnoozeButton";
import { DialButton } from "@/components/voice/DialButton";
import { VideoCallButton } from "@/components/inbox/VideoCallButton";
import { ReservarServicoNaConversa } from "@/components/agenda/ReservarServicoNaConversa";
import { motivoDoContato } from "@/lib/inbox/motivo-do-envio-bloqueado";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { rotuloParaAEquipe } from "@/lib/contacts/rotulo-do-contato";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import { rotuloDoCanalDaConversa } from "@/lib/channels/estado";

interface Props {
  conversation: ConversationWithContact;
  /**
   * A busca DENTRO da conversa (#1793): abre um campo que filtra só as
   * mensagens já carregadas. O ref devolve o foco a este botão quando o campo
   * fecha — senão o Esc largava o foco no `body`.
   */
  onBuscar?: () => void;
  buscaAberta?: boolean;
  botaoBuscaRef?: RefObject<HTMLButtonElement | null>;
  /** Seleciona outra conversa no Inbox — a aba Número do Transferir abre a do outro número. */
  onAbrirConversa?: (id: string) => void;
  /**
   * Celular (#118): a seta de voltar à lista mora DENTRO do cabeçalho, à esquerda do avatar, como no
   * WhatsApp. Só aparece abaixo do `md`; no computador a lista fica ao lado e não há para onde voltar.
   */
  aoVoltar?: () => void;
  /** Celular (#118): a porta da ficha do contato, no grupo de ícones da direita (abaixo do `md`). */
  acaoDaFicha?: ReactNode;
}

/**
 * O CHIP NOMEIA CICLO DE VIDA, NÃO COMANDO.
 *
 * Ele afirmava quem manda — "Automático atendendo", "Aguardando atendente" — a
 * 20px de um selo que responde a MESMA pergunta por outra fonte, e as duas se
 * contradiziam na tela: `conversations.status` não acompanha silêncio, trava de
 * contato nem atribuição, e o motor nunca o lê. Medido em 2026-08-30 num print
 * do dono: "Aguardando atendente" e "Automático" no mesmo cabeçalho.
 *
 * Quem responde "quem manda" é o `OwnerBadge`, que vem de `comandoDaConversa`.
 * Aqui fica só o que o status realmente sabe: o episódio está aberto ou acabou.
 *
 * Cobre os SETE valores do CHECK de propósito — o call site é
 * `t(STATUS_LABEL[status] ?? status)`, e um buraco imprime o token cru em inglês
 * no rosto do atendente. Vigiado pelo invariante de espelho.
 */
const STATUS_LABEL: Record<string, string> = {
  open: "Aberta",
  pending: "Aberta",
  claimed: "Aberta",
  ai_handling: "Aberta",
  resolved: "Resolvida",
  closed: "Fechada",
  archived: "Arquivada",
};

/** "Raphael Souza" vira "RS"; sem letras (só número), cai em "#". */
function iniciaisDe(nome: string): string {
  const letras = nome.split(/\s+/).map((p) => Array.from(p).find((ch) => /\p{L}/u.test(ch)) ?? "").filter(Boolean);
  if (!letras.length) return "#";
  return (letras.length === 1 ? letras[0]! : letras[0]! + letras[letras.length - 1]!).toUpperCase();
}

export function ConversationHeader({
  conversation,
  onAbrirConversa,
  onBuscar,
  buscaAberta,
  botaoBuscaRef,
  aoVoltar,
  acaoDaFicha,
}: Props) {
  const t = useT();
  const { user, activeOrg } = useAuth();
  const claim = useClaimConversation();
  const release = useReleaseConversation();
  const close = useCloseConversation();
  const reopen = useReopenConversation();
  const arquivar = useArchiveConversation();
  const retomar = useResumeAiAttendance();
  const pausar = usePauseAiAttendance();
  // "Existe automático nesta org?" — sem isto o selo afirmava que o robô estava
  // atendendo em instalação que nunca configurou agente nenhum.
  const automaticoDaOrg = useAutomaticoAtivo();
  const reservarRef = useRef<AbrirReserva>(null);
  const videoRef = useRef<AbrirVideo>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [confirmFecharOpen, setConfirmFecharOpen] = useState(false);
  const [confirmArquivarOpen, setConfirmArquivarOpen] = useState(false);
  const [confirmPessoalOpen, setConfirmPessoalOpen] = useState(false);

  const c = conversation.contacts ?? null;
  const displayName = rotuloParaAEquipe(c, t);
  /**
   * POR ONDE ESTA CONVERSA ENTROU — o mesmo rótulo da lista e da tela de
   * canais (#2383). `null` quando não há canal, e aí o badge não existe.
   */
  const rotuloCanal = rotuloDoCanalDaConversa(conversation.channel_sessions, t);
  const phone = c?.phone_number ? phoneForDisplay(c.phone_number) : null;
  const status = conversation.status;
  const isMineAssigned = conversation.assigned_to_user_id === user.id;
  const isOpen = status === "open" || conversation.assigned_to_user_id == null;

  // Marcar/desmarcar pessoal (spec 21, etapa 15 — botão no cabeçalho).
  //
  // GERENTE pode (spec decisão 1, D3): pessoal é decisão operacional — esconder
  // uma conversa da operação. Desbloquear exige ADMIN porque reabre um canal
  // que o cliente fechou (direito do titular, LGPD): dois gestos parecidos,
  // dois gates diferentes, cada um com seu motivo.
  //
  // Os hooks ficam AQUI, antes de qualquer early return (a ordem dos hooks não
  // pode mudar entre renderizações); com contato ausente o id vazio nunca
  // dispara porque o botão nem é desenhado.
  const ehPessoal = c?.is_personal === true;
  const podeMarcarPessoal =
    (user.is_platform_admin && !user.support) ||
    (activeOrg != null && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager);
  const marcarPessoal = useMarkPersonalContact(c?.id ?? "");
  const desmarcarPessoal = useUnmarkPersonalContact(c?.id ?? "");

  /**
   * QUEM MANDA, uma pergunta com uma resposta.
   *
   * Este bloco era três leituras parciais. O selo e o botão de volta liam duas
   * travas (`bot_silenced_until || force_human`); a linha da lista lia uma, por
   * COR; o painel não lia nenhuma. Desde a 0173 há uma quarta situação —
   * "alguém assumiu" — e continuar somando condições à mão aqui é como as três
   * leituras divergiram em primeiro lugar. A regra mora em `lib/inbox`,
   * espelhando os gates que o MOTOR lê, e esta tela só a consome.
   */
  const fatosDoComando = {
    status,
    assigned_to_user_id: conversation.assigned_to_user_id,
    assigned_to_user_name: conversation.assigned_to_user_name ?? null,
    assignee_kind: conversation.assignee_kind ?? null,
    bot_silenced_until: conversation.bot_silenced_until ?? null,
    last_handoff_reason: conversation.last_handoff_reason ?? null,
    force_human: c?.force_human ?? null,
    is_blocked: conversation.contacts?.is_blocked ?? null,
    is_group: conversation.is_group ?? false,
    automaticoDaOrg: automaticoDaOrg.data,
  };
  const { comando, automaticoAtivo, travaVigente, motivo } = comandoDaConversa(fatosDoComando);
  /**
   * O QUE "LIBERAR" FAZ DEPENDE DO ESTADO, e a guia do botão (#3003) não pode
   * prometer o automático de volta quando ele não volta.
   *
   * `fn_conversation_assign` com dono `null` deixa a conversa aberta e sem dono,
   * mas só limpa `bot_silenced_until` quando NÃO houve escalação
   * (`last_handoff_at is null`). Depois de uma escalação, com o contato travado
   * (`force_human`), descadastrado, em grupo ou numa org sem automático, a
   * conversa cai na fila esperando gente. A pergunta é a mesma regra de quem
   * manda, aplicada ao estado que a RPC vai gravar.
   */
  const liberarDevolveAoAutomatico =
    comandoDaConversa({
      ...fatosDoComando,
      status: "open",
      assigned_to_user_id: null,
      assigned_to_user_name: null,
      assignee_kind: null,
      bot_silenced_until: conversation.last_handoff_at ? fatosDoComando.bot_silenced_until : null,
    }).comando.quem === "automatico";

  const encerrada = status === "closed" || status === "archived" || status === "resolved";
  /**
   * A VOLTA aparece sempre que há algo a devolver — inclusive em conversa
   * ENCERRADA. Antes ela era condicionada a `status !== "closed"`, e o resultado
   * era um beco sem saída medido: atendente assume, fecha, sai de férias; a
   * conversa fica com o automático parado e, para qualquer colega, sem NENHUMA
   * porta — "Liberar" só existe para o próprio dono e a rota recusa quem não é.
   * `devolverAtendimentoAoAgente` funciona nesse estado (o status fechado está na
   * lista de reativáveis), então esconder o botão escondia uma ação que existe.
   *
   * A condição é `travaVigente`, e NÃO `!automaticoAtivo`: conversa encerrada tem
   * o automático inativo sem ter trava nenhuma, e sair do segundo faria o botão
   * aparecer em toda conversa fechada — clicá-lo REABRIRIA uma conversa que
   * ninguém pediu para reabrir. Oferecer uma ação que não deveria acontecer é
   * pior que não oferecer nenhuma.
   */
  const podeDevolver = travaVigente;
  /**
   * PAUSAR só aparece quando pausar é um gesto DIFERENTE de assumir.
   *
   * Desde a 0173 "Assumir" já cala o automático (a RPC grava o silêncio). Numa
   * conversa sem dono, portanto, "Assumir" e "Pausar o automático" teriam
   * exatamente o mesmo efeito — dois botões para um ato é a confusão que esta
   * entrega existe para acabar, não para dobrar.
   *
   * Sobra o caso em que ele é próprio: a conversa JÁ tem dono e o automático
   * continua de pé. Isso é real e não é raro — o rodízio (`reason='routing'`)
   * distribui sem calar, de propósito, senão uma org em round_robin ficaria sem
   * automático nenhum.
   */
  const podePausar =
    automaticoAtivo && !encerrada && conversation.assigned_to_user_id !== null;

  const podeReservar =
    !conversation.is_group && !!c?.id && activeOrg != null && ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;
  const temVideo = servidorDeVideo() !== null;

  if (user.support?.access_mode === "support_readonly") return <header className="flex h-[60px] items-center justify-between border-b border-border bg-card px-4">
    <strong>{displayName}</strong><span className="text-sm text-muted-foreground">{STATUS_LABEL[status] ?? status} · Somente leitura</span>
  </header>;

  /**
   * O SEGUNDO TEXTO DO SUBTÍTULO: o estado que a pessoa precisa ler SEM abrir nada.
   * O motivo do silêncio ("Automático pausado — alguém assumiu") vence; senão, conversa
   * encerrada diz como terminou; senão, o telefone do contato.
   */
  const estadoDoSubtitulo = motivo !== null ? t(ROTULO_DO_MOTIVO[motivo]) : encerrada ? t(STATUS_LABEL[status] ?? status) : null;

  return (
    <div className="shrink-0">
      {/* FAIXA DA CARTEIRA (#2591): fica numa linha própria ACIMA da barra, para a barra manter os
          60 px. O componente decide se desenha (só quando o dono da carteira é OUTRA pessoa). */}
      {c?.id && (
        <FaixaDaCarteira contactId={c.id} quemAtendeId={conversation.assigned_to_user_id} />
      )}
      {/* CABEÇALHO DE MENSAGEIRO (#117, protótipo aprovado em app/design/inbox): 60 px FIXOS, sem
          quebra de linha — avatar, nome, UMA linha de subtítulo e três ícones. As ações de
          atendimento moram todas no menu "Mais ações", com a mesma lógica de estado de antes. */}
      <div
        data-testid="cabecalho-da-conversa"
        className="flex h-[60px] shrink-0 items-center gap-3 border-b border-border bg-card px-4"
      >
        {aoVoltar && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="-ml-2 size-10 shrink-0 rounded-full text-muted-foreground md:hidden"
            aria-label={t("Voltar para as conversas")}
            data-testid="voltar-para-as-conversas"
            onClick={aoVoltar}
          >
            <Voltar size={24} aria-hidden />
          </Button>
        )}
        <span
          data-avatar
          data-testid="avatar-da-conversa"
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-[15px] font-medium text-muted-foreground"
        >
          {iniciaisDe(displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <ChannelLogo channel={conversation.channel_sessions} size={18} />
            <h2 className="min-w-0 truncate text-[17px] font-normal leading-6" title={displayName}>{displayName}</h2>
            <span className="hidden shrink-0 sm:inline-flex">
              <JanelaSelo
                provider={conversation.channel_sessions?.provider ?? null}
                lastInboundAt={conversation.last_inbound_at}
              />
            </span>
          </div>
          {/* A LINHA DE ESTADO: quem manda (geometria do OwnerBadge, a mesma do funil e do dossiê:
              disco cheio para pessoa, anel vazado para o automático), o estado em texto e o
              canal. É UMA linha: o que não cabe é cortado, nunca desce para uma segunda. */}
          <div
            data-testid="subtitulo-da-conversa"
            className="flex min-w-0 items-center gap-1.5 truncate text-[13px] leading-4 text-muted-foreground"
          >
            <span className="shrink-0" data-testid="comando-da-conversa">
              {comando.quem === "humano" ? (
                <OwnerBadge compacto ownerKind="user" ownerName={comando.nome ?? t("Atendente")} />
              ) : comando.quem === "automatico" ? (
                <OwnerBadge compacto ownerKind="ai" ownerName={t("Automático")} />
              ) : (
                <OwnerBadge compacto ownerKind={null} ownerName={null} />
              )}
            </span>
            {estadoDoSubtitulo ? (
              <span
                className="min-w-0 truncate"
                title={estadoDoSubtitulo}
                data-testid={motivo !== null ? "badge-atendimento-humano" : "estado-da-conversa"}
              >
                · {estadoDoSubtitulo}
              </span>
            ) : (
              phone && <span className="min-w-0 truncate">· {phone}</span>
            )}
            {/* #2383: por onde esta conversa entrou — o mesmo rótulo da lista e da tela de canais. */}
            {rotuloCanal && (
              <span
                className="hidden min-w-0 max-w-[9rem] shrink truncate md:inline"
                title={`${t("Entrou por")} ${rotuloCanal}`}
                data-testid="canal-da-conversa"
              >
                · {rotuloCanal}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center">
          {acaoDaFicha}
          {c?.id && (
            <Button asChild size="icon" variant="ghost" className="size-10 rounded-full text-muted-foreground">
              <Link
                href={`/app/contacts/${c.id}`}
                aria-label={t("Ver contato")}
                title={t("Abre a ficha completa deste contato.")}
              >
                <UserRound className="size-5" aria-hidden />
              </Link>
            </Button>
          )}
          {/* A divisória fina do WhatsApp Web entre o grupo de ações e a lupa. */}
          {c?.id && onBuscar && (
            <span aria-hidden data-testid="divisoria-do-cabecalho" className="mx-1 h-6 w-px bg-border" />
          )}
          {onBuscar && (
            <Button
              ref={botaoBuscaRef}
              size="icon"
              variant="ghost"
              className="size-10 rounded-full text-muted-foreground"
              onClick={onBuscar}
              aria-label={t("Buscar nesta conversa")}
              title={t("Buscar nesta conversa")}
              aria-expanded={buscaAberta}
            >
              <Search className="size-5" aria-hidden />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-10 rounded-full text-muted-foreground"
                aria-label={t("Mais ações")}
                title={t("Mais ações")}
              >
                <MoreVertical className="size-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-60">
              {isOpen && (
                <DropdownMenuItem
                  disabled={claim.isPending}
                  // O rótulo NÃO muda (é contrato). A guia diz a consequência: desde a 0173 assumir
                  // também para o atendimento automático.
                  title={t("Você passa a responder esta conversa e o atendimento automático para aqui.")}
                  onSelect={() =>
                    claim.mutate({
                      conversation_id: conversation.id,
                      expected_assignee: conversation.assigned_to_user_id,
                    })
                  }
                >
                  {t("Assumir")}
                </DropdownMenuItem>
              )}
              {isMineAssigned && (
                <DropdownMenuItem
                  disabled={release.isPending}
                  // GUIA CURTA (#3003): o gesto, e para onde a conversa vai (ver `liberarDevolveAoAutomatico`).
                  title={
                    liberarDevolveAoAutomatico
                      ? t("Solta esta conversa: ela fica sem dono e o atendimento automático volta a responder.")
                      : t("Solta esta conversa: ela fica sem dono e volta para a fila, esperando um atendente.")
                  }
                  onSelect={() => release.mutate({ conversation_id: conversation.id })}
                >
                  {t("Liberar")}
                </DropdownMenuItem>
              )}
              {/* O INTERRUPTOR do automático: um item, dois rótulos, mutuamente exclusivos.
                  O `data-testid` da VOLTA é contrato do e2e `escalacao-ciclo`. */}
              {podeDevolver && (
                <DropdownMenuItem
                  disabled={retomar.isPending}
                  data-testid="devolver-ao-automatico"
                  // O alcance da volta não é sempre o mesmo: com o contato travado ela religa o
                  // automático para TODAS as conversas dele, e a guia diz qual é.
                  title={
                    motivo === "contato_travado"
                      ? t("Religa o atendimento automático para este cliente — vale para todas as conversas dele.")
                      : t("Devolve esta conversa ao atendimento automático.")
                  }
                  onSelect={() => retomar.mutate({ conversation_id: conversation.id })}
                >
                  {retomar.isPending ? t("Devolvendo...") : t("Devolver ao automático")}
                </DropdownMenuItem>
              )}
              {podePausar && (
                <DropdownMenuItem
                  disabled={pausar.isPending}
                  data-testid="pausar-o-automatico"
                  title={t("O atendimento automático para nesta conversa. O dono não muda.")}
                  onSelect={() => pausar.mutate({ conversation_id: conversation.id })}
                >
                  {pausar.isPending ? t("Pausando...") : t("Pausar o automático")}
                </DropdownMenuItem>
              )}
              {!encerrada && (
                <DropdownMenuItem
                  title={t("Passa esta conversa para outro atendente. Se houver outro número conectado, dá para continuar o atendimento por ele.")}
                  onSelect={() => setReassignOpen(true)}
                >
                  {t("Transferir")}
                </DropdownMenuItem>
              )}
              {!encerrada && (
                <SnoozeButton
                  comoItemDeMenu
                  conversationId={conversation.id}
                  snoozeUntil={conversation.snooze_until ?? null}
                />
              )}
              {podeReservar && (
                <DropdownMenuItem onSelect={() => reservarRef.current?.abrir()}>
                  {t("Reservar serviço")}
                </DropdownMenuItem>
              )}
              {!conversation.is_group && c?.id && (
                <DialButton comoItemDeMenu contactId={c.id} hasPhone={!!c.phone_number} />
              )}
              {temVideo && (
                <DropdownMenuItem data-testid="btn-videochamada" onSelect={() => videoRef.current?.abrir()}>
                  {t("Vídeo")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {!encerrada && (
                <DropdownMenuItem
                  disabled={close.isPending}
                  title={t("Encerra o atendimento. Depois você pode reabrir a conversa.")}
                  onSelect={() => setConfirmFecharOpen(true)}
                >
                  {t("Fechar")}
                </DropdownMenuItem>
              )}
              {encerrada && (
                <DropdownMenuItem
                  disabled={reopen.isPending}
                  title={t("Reabre o atendimento desta conversa, que estava encerrada.")}
                  onSelect={() =>
                    reopen.mutate({ conversation_id: conversation.id, expected_revision: conversation.service_revision })
                  }
                >
                  {t("Reabrir")}
                </DropdownMenuItem>
              )}
              {/* ARQUIVAR (#923): a conversa já arquivada não mostra o item; fechada e resolvida mostram.
                  Mesma permissão de fechar. */}
              {status !== "archived" && (
                <DropdownMenuItem
                  disabled={arquivar.isPending}
                  title={t("Guarda a conversa na aba Arquivadas. Se ainda estiver aberta, o atendimento é encerrado.")}
                  onSelect={() => setConfirmArquivarOpen(true)}
                >
                  {arquivar.isPending ? t("Arquivando...") : t("Arquivar")}
                </DropdownMenuItem>
              )}
              {/* PESSOAL (spec 21, etapa 15). Os `data-testid` são contrato do e2e da spec. */}
              {podeMarcarPessoal && c?.id && !ehPessoal && (
                <DropdownMenuItem
                  disabled={marcarPessoal.isPending}
                  data-testid="marcar-pessoal"
                  title={t("Tira este contato da operação: a conversa sai do inbox.")}
                  onSelect={() => setConfirmPessoalOpen(true)}
                >
                  {t("Marcar como pessoal")}
                </DropdownMenuItem>
              )}
              {podeMarcarPessoal && c?.id && ehPessoal && (
                <DropdownMenuItem
                  disabled={desmarcarPessoal.isPending}
                  data-testid="desmarcar-pessoal"
                  title={t("Devolve este contato à operação: a conversa volta ao inbox.")}
                  onSelect={() => desmarcarPessoal.mutate()}
                >
                  {desmarcarPessoal.isPending ? t("Desmarcando...") : t("Desmarcar pessoal")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* A reserva e a videochamada têm folha/diálogo próprios; ficam FORA do menu (que desmonta ao
          fechar) e abrem pelos itens acima. */}
      {podeReservar && c?.id && activeOrg && (
        <ReservarServicoNaConversa
          ref={reservarRef}
          semGatilho
          key={`${activeOrg.orgId}:${conversation.id}`}
          contactId={c.id}
          conversationId={conversation.id}
          contactName={displayName}
        />
      )}
      <VideoCallButton
        ref={videoRef}
        semGatilho
        conversationId={conversation.id}
        provider={conversation.channel_sessions?.provider ?? null}
        lastInboundAt={conversation.last_inbound_at}
        bloqueio={motivoDoContato(c, t)}
        encerrada={status === "closed"}
      />
      <ReassignDialog
        conversationId={conversation.id}
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        numero={
          onAbrirConversa && c?.id
            ? {
                contactId: c.id,
                contactPhone: c.phone_number ?? null,
                channelSessionId: conversation.channel_session_id,
                onAbrirConversa,
              }
            : undefined
        }
      />
      <AlertDialog open={confirmFecharOpen} onOpenChange={setConfirmFecharOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Fechar esta conversa?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("O atendimento é encerrado. Se o cliente escrever de novo, você pode reabrir.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                close.mutate({
                  conversation_id: conversation.id,
                  expected_revision: conversation.service_revision,
                })
              }
            >
              {t("Fechar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* A confirmação precisa dizer o que ACONTECE, e o que acontece depende
          do estado. `fn_conversation_set_status` trata `archived` como
          terminal: encerra o atendimento (grava `service_closed_at`,
          incrementa a revisão) e, com isso, desfaz a pausa do automático. Um
          atendente que leia "arquivar = tirar da vista, volto depois"
          encerraria o atendimento sem saber — e o robô voltaria a responder
          no próximo "oi" do cliente. Por isso a descrição só aparece quando
          `!encerrada`: quando já está encerrada, arquivar não muda o
          atendimento, só o lugar onde a conversa mora. */}
      <AlertDialog open={confirmArquivarOpen} onOpenChange={setConfirmArquivarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Arquivar esta conversa?")}</AlertDialogTitle>
            {!encerrada && (
              <AlertDialogDescription>
                {t(
                  "Arquivar encerra este atendimento e guarda a conversa no histórico. Se o cliente escrever de novo, ela volta.",
                )}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                arquivar.mutate({
                  conversation_id: conversation.id,
                  expected_revision: conversation.service_revision,
                })
              }
            >
              {t("Arquivar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* A confirmação diz o que ACONTECE ao marcar: a conversa fecha e sai do
          atendente, e o contato fica inutilizado para envio — sem apagar nada.
          Desmarcar é direto no botão porque só relista o que já está lá. */}
      <AlertDialog open={confirmPessoalOpen} onOpenChange={setConfirmPessoalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Marcar este contato como pessoal?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "A conversa sai do inbox e o contato fica fora da operação: sem IA, sem follow-up, sem campanha e sem envio. O histórico continua no banco e volta à vista ao desmarcar; follow-ups e campanhas cancelados não voltam.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => marcarPessoal.mutate()}>
              {t("Marcar como pessoal")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
