import {
  Archive,
  Check,
  CheckCheck,
  FileText,
  ListFilter,
  MessageSquarePlus,
  MessagesSquare,
  Mic,
  MoreVertical,
  Paperclip,
  Play,
  Search,
  Settings,
  Smile,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Prototipo ESTATICO do Inbox no estilo de mensageiro (#115, spec #112, ADRs 0007 e 0008).
 * Dados de exemplo, nenhuma ligacao com o Inbox real. Usa os tokens do app (verde de mensageiro e
 * neutros fixos) e as medidas do dossie de referencia. Serve para o dono aprovar a forma antes de a
 * tarefa 4 mexer nos componentes reais.
 */

export type Tema = "claro" | "escuro";
export type Vista = "lista" | "conversa" | "contato";

type Props = {
  tema?: Tema;
  /** No celular so um painel aparece por vez; no computador a vista nao esconde nada. */
  vista?: Vista;
  menuAberto?: boolean;
  /** Painel "Dados do contato" aberto ao lado da conversa (computador). */
  painel?: boolean;
};

const CORES_AVATAR = [
  ["#c9e4de", "#1d5c50"],
  ["#f3dcc8", "#7a4a1d"],
  ["#d8dcf3", "#3a4590"],
  ["#f1d3dd", "#8a2f52"],
  ["#e3e8c4", "#566212"],
  ["#d3e6f3", "#235b82"],
] as const;

type Linha = {
  id: string;
  nome: string;
  previa: string;
  hora: string;
  naoLidas?: number;
  estado?: "selecionada" | "nao-lida";
  tique?: "lido" | "entregue";
};

const LINHAS: Linha[] = [
  { id: "1", nome: "Marina Souza", previa: "Perfeito, te espero amanhã às 10h", hora: "09:41", estado: "selecionada", tique: "lido" },
  { id: "2", nome: "Carlos Eduardo Lima", previa: "Pode me mandar o orçamento atualizado?", hora: "09:12", naoLidas: 3, estado: "nao-lida" },
  { id: "3", nome: "Residencial Aurora", previa: "Foto: planta do 3º andar", hora: "08:55", tique: "entregue" },
  { id: "4", nome: "Patrícia Gomes", previa: "Obrigada! Vou falar com meu marido.", hora: "Ontem" },
  { id: "5", nome: "João Pedro Alves", previa: "Áudio (0:42)", hora: "Ontem", tique: "lido" },
  { id: "6", nome: "Fernanda Ribeiro", previa: "Qual o valor da entrada?", hora: "Ontem" },
  { id: "7", nome: "Roberto Camargo", previa: "Combinado, fechamos na sexta.", hora: "Terça", tique: "lido" },
  { id: "8", nome: "Luciana Prado", previa: "Bom dia! Ainda tem o apartamento?", hora: "Segunda" },
];

const CHIPS = [
  { rotulo: "Todas", ativo: true },
  { rotulo: "Não lidas" },
  { rotulo: "Minhas" },
  { rotulo: "Fila" },
  { rotulo: "Automático" },
  { rotulo: "Grupos" },
  { rotulo: "Fechadas" },
  { rotulo: "Arquivadas" },
];

const ITENS_DO_MENU = [
  "Assumir conversa",
  "Transferir",
  "Pausar o automático",
  "Marcar como pessoal",
  "Fechar conversa",
  "Arquivar",
];

function Avatar({ nome, tamanho, indice }: { nome: string; tamanho: string; indice: number }) {
  const [fundo, texto] = CORES_AVATAR[indice % CORES_AVATAR.length] ?? CORES_AVATAR[0];
  const iniciais = nome
    .split(" ")
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-full font-medium", tamanho)}
      style={{ backgroundColor: fundo, color: texto }}
    >
      {iniciais}
    </span>
  );
}

function Icone({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function FaixaDeIcones() {
  return (
    <nav
      aria-label="Seções"
      className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-border bg-muted py-3 md:flex"
    >
      <Icone rotulo="Conversas" className="bg-card text-foreground shadow-sm">
        <MessagesSquare className="size-6" />
      </Icone>
      <Icone rotulo="Contatos">
        <Users className="size-6" />
      </Icone>
      <span className="flex-1" />
      <Icone rotulo="Configurações">
        <Settings className="size-6" />
      </Icone>
    </nav>
  );
}

function ListaDeConversas({ escondida }: { escondida: boolean }) {
  return (
    <section
      aria-label="Lista de conversas"
      className={cn(
        "w-full shrink-0 flex-col border-r border-border bg-card md:flex md:w-[400px]",
        escondida ? "hidden" : "flex",
      )}
    >
      <header className="flex h-[60px] shrink-0 items-center justify-between px-4">
        <h1 className="text-[22px] font-semibold text-foreground">Conversas</h1>
        <div className="flex items-center">
          <Icone rotulo="Nova conversa">
            <MessageSquarePlus className="size-6" />
          </Icone>
          <Icone rotulo="Menu">
            <MoreVertical className="size-6" />
          </Icone>
        </div>
      </header>

      <div className="px-3 pb-2">
        <label className="flex h-9 items-center gap-6 rounded-full bg-muted px-3 text-muted-foreground">
          <Search className="size-[18px] shrink-0" aria-hidden />
          <input
            type="search"
            readOnly
            aria-label="Buscar conversas"
            placeholder="Pesquisar ou começar uma nova conversa"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-hidden placeholder:text-muted-foreground"
          />
        </label>
      </div>

      <div className="flex items-center gap-1 pb-2 pl-3 pr-1">
        <div
          data-testid="proto-chips"
          className="flex min-w-0 flex-1 flex-nowrap gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {CHIPS.map((c) => (
            <span
              key={c.rotulo}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[14px] leading-5",
                c.ativo
                  ? "bg-accent-soft font-medium text-accent"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {c.rotulo}
            </span>
          ))}
        </div>
        <Icone rotulo="Filtrar por tag e atendente" className="size-9">
          <ListFilter className="size-5" />
        </Icone>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {LINHAS.map((l, i) => (
          <li
            key={l.id}
            data-testid={
              l.estado === "selecionada"
                ? "proto-linha-selecionada"
                : l.estado === "nao-lida"
                  ? "proto-linha-nao-lida"
                  : undefined
            }
            className={cn("flex h-[72px] items-center gap-3 px-3", l.estado === "selecionada" && "bg-selected")}
          >
            <Avatar nome={l.nome} indice={i} tamanho="size-[49px] text-[17px]" />
            <div className="flex h-full min-w-0 flex-1 flex-col justify-center gap-0.5 border-b border-border/70">
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn("truncate text-[17px] text-foreground", l.naoLidas && "font-medium")}>
                  {l.nome}
                </span>
                <span
                  data-testid={l.naoLidas ? "proto-hora" : undefined}
                  className={cn(
                    "shrink-0 text-[12px]",
                    l.naoLidas ? "text-accent" : "text-muted-foreground",
                  )}
                >
                  {l.hora}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1 text-[14px] text-muted-foreground">
                  {l.tique === "lido" && <CheckCheck className="size-4 shrink-0 text-tick-read" aria-hidden />}
                  {l.tique === "entregue" && <CheckCheck className="size-4 shrink-0" aria-hidden />}
                  <span className="truncate">{l.previa}</span>
                </span>
                {l.naoLidas ? (
                  <span
                    data-testid="proto-contador"
                    className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[12px] font-medium text-accent-foreground"
                  >
                    {l.naoLidas}
                  </span>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Pontinha({ saida }: { saida: boolean }) {
  return (
    <span
      aria-hidden
      data-testid="balao-pontinha"
      className={cn(
        "absolute top-0 h-3 w-2",
        saida
          ? "-right-2 bg-bubble-out [clip-path:polygon(0_0,0_100%,100%_0)]"
          : "-left-2 bg-bubble-in [clip-path:polygon(100%_0,100%_100%,0_0)]",
      )}
    />
  );
}

function Bolha({
  saida,
  hora,
  lido,
  testid,
  children,
  pontinha = false,
}: {
  saida: boolean;
  hora: string;
  lido?: boolean;
  testid?: string;
  children: ReactNode;
  pontinha?: boolean;
}) {
  return (
    <div className={cn("flex px-[5%] md:px-[7%]", saida ? "justify-end" : "justify-start")}>
      <div
        data-testid={testid}
        className={cn(
          "relative max-w-[85%] rounded-[8px] px-2 pb-1 pt-1.5 text-[15px] leading-5 shadow-sm md:max-w-[65%]",
          saida ? "bg-bubble-out text-bubble-out-fg" : "bg-bubble-in text-foreground",
          pontinha && (saida ? "rounded-tr-none" : "rounded-tl-none"),
        )}
      >
        {pontinha && <Pontinha saida={saida} />}
        {children}
        <span
          data-testid="proto-hora-bolha"
          className={cn(
            "float-right -mb-0.5 ml-3 mt-2 inline-flex items-center gap-1 text-xs leading-4",
            saida ? "text-bubble-out-meta" : "text-muted-foreground",
          )}
        >
          {hora}
          {saida &&
            (lido ? (
              <CheckCheck data-testid="proto-tique-lido" className="size-4 text-tick-read" aria-hidden />
            ) : (
              <Check className="size-4" aria-hidden />
            ))}
        </span>
      </div>
    </div>
  );
}

function MenuMaisAcoes() {
  return (
    <div
      role="menu"
      aria-label="Mais ações"
      className="absolute right-3 top-[52px] z-10 w-60 rounded-lg border border-border bg-card py-2 text-[15px] text-foreground shadow-lg"
    >
      {ITENS_DO_MENU.map((item) => (
        <div key={item} role="menuitem" className="px-6 py-2.5">
          {item}
        </div>
      ))}
    </div>
  );
}

function Conversa({ escondida, menuAberto }: { escondida: boolean; menuAberto: boolean }) {
  return (
    <section
      aria-label="Conversa aberta"
      className={cn("relative min-w-0 flex-1 flex-col md:flex", escondida ? "hidden" : "flex")}
    >
      <header
        data-testid="proto-cabecalho"
        className="flex h-[60px] shrink-0 items-center gap-3 bg-muted px-4"
      >
        <Avatar nome="Marina Souza" indice={0} tamanho="size-10 text-[15px]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] leading-6 text-foreground">Marina Souza</div>
          <div data-testid="proto-subtitulo" className="truncate text-[13px] leading-4 text-muted-foreground">
            Atendida por Rafael · +55 11 91234-5678
          </div>
        </div>
        <div className="flex items-center">
          <Icone rotulo="Buscar na conversa">
            <Search className="size-5" />
          </Icone>
          <Icone rotulo="Ver contato">
            <UserRound className="size-5" />
          </Icone>
          <Icone rotulo="Mais ações">
            <MoreVertical className="size-5" />
          </Icone>
        </div>
      </header>
      {menuAberto && <MenuMaisAcoes />}

      <div className="fundo-da-conversa flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-hidden py-4">
        <div className="flex justify-center pb-1">
          <span className="rounded-lg bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm">
            Ontem
          </span>
        </div>
        <Bolha saida={false} hora="17:02" pontinha>
          Boa tarde! Vocês trabalham com financiamento pela Caixa?
        </Bolha>
        <Bolha saida hora="17:10" lido pontinha>
          Boa tarde, Marina! Trabalhamos sim, com entrada a partir de 10%.
        </Bolha>
        <Bolha saida={false} hora="17:12">
          Ótimo, volto a falar com vocês amanhã de manhã.
        </Bolha>
        <div className="flex justify-center pb-1 pt-2">
          <span
            data-testid="proto-separador-de-data"
            className="rounded-lg bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm"
          >
            Hoje
          </span>
        </div>
        <Bolha saida={false} hora="09:30" pontinha>
          Bom dia! Vi o anúncio do apartamento de 2 quartos. Ainda está disponível?
        </Bolha>
        <Bolha saida hora="09:32" lido pontinha testid="proto-bolha-enviada">
          Bom dia, Marina! Está sim. Posso te mostrar a planta e agendar uma visita.
        </Bolha>
        <Bolha saida={false} hora="09:35" testid="proto-bolha-recebida">
          <div
            data-testid="proto-midia"
            className="relative -mx-0.5 -mt-0.5 mb-1 flex h-44 w-72 max-w-full items-center justify-center overflow-hidden rounded-[6px]"
            style={{ background: "linear-gradient(135deg, #b9cfc9 0%, #8fb0a8 55%, #6f948b 100%)" }}
          >
            <FileText className="size-10 text-white/80" aria-hidden />
            <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/40 px-1.5 py-0.5 text-xs text-white">
              <Play className="size-3" aria-hidden /> planta-2-quartos.pdf
            </span>
          </div>
          Gostei da varanda desta planta.
        </Bolha>
        <Bolha saida hora="09:38" lido>
          Combinado! Que tal amanhã às 10h?
        </Bolha>
        <Bolha saida={false} hora="09:41">
          Perfeito, te espero amanhã às 10h
        </Bolha>
      </div>

      <div
        data-testid="proto-escrever"
        className="flex h-[62px] shrink-0 items-center gap-1 bg-muted px-3"
      >
        <Icone rotulo="Emoji">
          <Smile className="size-6" />
        </Icone>
        <Icone rotulo="Anexar">
          <Paperclip className="size-6" />
        </Icone>
        <input
          type="text"
          readOnly
          aria-label="Mensagem"
          placeholder="Digite uma mensagem"
          className="mx-1 h-10 min-w-0 flex-1 rounded-full bg-card px-4 text-[15px] text-foreground outline-hidden placeholder:text-muted-foreground"
        />
        <button
          type="button"
          aria-label="Gravar áudio"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
        >
          <Mic className="size-5" />
        </button>
      </div>
    </section>
  );
}

function Linha2({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="border-b border-border/70 px-6 py-3">
      <div className="text-[13px] text-muted-foreground">{rotulo}</div>
      <div className="text-[16px] text-foreground">{valor}</div>
    </div>
  );
}

function PainelDoContato({ escondido, aberto }: { escondido: boolean; aberto: boolean }) {
  return (
    <aside
      data-testid="proto-painel-contato"
      aria-label="Dados do contato"
      className={cn(
        "w-full shrink-0 flex-col border-l border-border bg-card md:w-[340px]",
        escondido ? "hidden" : "flex",
        aberto ? "md:flex" : "md:hidden",
      )}
    >
      <header className="flex h-[60px] shrink-0 items-center gap-4 bg-muted px-4">
        <Icone rotulo="Fechar painel" className="-ml-2">
          <X className="size-5" />
        </Icone>
        <h2 className="text-[17px] text-foreground">Dados do contato</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center gap-2 border-b border-border/70 px-6 py-6">
          <Avatar nome="Marina Souza" indice={0} tamanho="size-[120px] text-[44px]" />
          <div className="text-[20px] text-foreground">Marina Souza</div>
          <div className="text-[15px] text-muted-foreground">+55 11 91234-5678</div>
        </div>
        <Linha2 rotulo="Atendente" valor="Rafael Medeiros" />
        <Linha2 rotulo="Etapa do funil" valor="Visita agendada" />
        <Linha2
          rotulo="Tags"
          valor={
            <span className="mt-1 flex flex-wrap gap-2">
              {["Apartamento", "2 quartos", "Financiamento"].map((t) => (
                <span key={t} className="rounded-full bg-muted px-3 py-0.5 text-[13px] text-foreground">
                  {t}
                </span>
              ))}
            </span>
          }
        />
        <Linha2 rotulo="Origem" valor="Anúncio no portal" />
        <Linha2 rotulo="Canal" valor="WhatsApp" />
        <Linha2 rotulo="Cliente desde" valor="12 de outubro de 2026" />
        <div className="flex items-center gap-4 px-6 py-4 text-[16px] text-muted-foreground">
          <Archive className="size-5" aria-hidden /> Arquivar conversa
        </div>
      </div>
    </aside>
  );
}

export function PrototipoDoInbox({
  tema = "claro",
  vista = "conversa",
  menuAberto = false,
  painel = true,
}: Props) {
  return (
    <div
      data-theme={tema === "escuro" ? "dark" : "light"}
      className="fixed inset-0 z-50 flex overflow-hidden bg-background font-sans text-foreground"
    >
      <FaixaDeIcones />
      <ListaDeConversas escondida={vista !== "lista"} />
      <Conversa escondida={vista !== "conversa"} menuAberto={menuAberto} />
      <PainelDoContato escondido={vista !== "contato"} aberto={painel} />
    </div>
  );
}
