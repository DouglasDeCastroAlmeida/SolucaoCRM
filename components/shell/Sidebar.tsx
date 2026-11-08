"use client";
import Link from "next/link";
import { useT } from "@/hooks/i18n/useT";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, CaretDown, Gear } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { ConnectionHealthDot } from "@/components/connections/ConnectionHealthDot";
import { ContadorDeCasos } from "@/components/shell/ContadorDeCasos";
import { ContadorDaFila } from "@/components/shell/ContadorDaFila";
import { VersionFooter } from "@/components/shell/VersionFooter";
import { LogotipoDoProduto } from "@/components/branding/MarcaDoProduto";
import { useMarcaDaCasca } from "@/components/shell/useMarcaDaCasca";
import { GRUPO_NO_RODAPE, sidebarGroups } from "@/lib/navigation/registry";

const CHAVE_GRUPOS_FECHADOS = "sidebar-grupos-fechados";

interface SidebarContentProps {
  onNavigate?: () => void;
}

/**
 * Navegação principal, agrupada por objetivo.
 *
 * Não decide nada: `sidebarGroups()` (lib/navigation/registry.ts) resolve quais
 * grupos e destinos este papel vê, e este componente desenha. Antes, a lista de
 * itens e sete `usePermission()` viviam aqui — e divergiam do hub de
 * Configurações e das abas de IA, que mantinham suas próprias listas.
 */
export function SidebarContent({ onNavigate }: SidebarContentProps) {
  // A barra lateral aparece em TODA tela — traduzi-la aqui é o que faz a
  // escolha de idioma virar algo visível no primeiro clique.
  const t = useT();
  const pathname = usePathname();
  const { user, activeOrg } = useAuth();
  const todos = sidebarGroups(
    user.is_platform_admin && !user.support,
    activeOrg?.role ?? null,
    activeOrg?.interface_settings,
    activeOrg?.modulos_ligados ?? [],
    activeOrg?.capacidades_ligadas ?? [],
  );
  // Configurações sai da área que rola e vai para o rodapé fixo: medido em
  // 1280x768, ele caía fora da dobra mesmo em telas de 1080px.
  const grupos = todos.filter((g) => g.group.id !== GRUPO_NO_RODAPE);
  const rodape = todos.find((g) => g.group.id === GRUPO_NO_RODAPE)?.group.hub;

  /**
   * Grupo fechado é preferência POR NAVEGADOR, não por conta: começa vazio (tudo
   * aberto) em toda renderização — servidor, primeira pintura do cliente e nos
   * testes, que nunca clicam em nada — e só muda depois do mount, se o
   * `localStorage` tiver algo salvo. Guardar o CONJUNTO DOS FECHADOS, e não dos
   * abertos, é o que faz "sem preferência salva" já significar "tudo aberto".
   */
  const [gruposFechados, setGruposFechados] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem(CHAVE_GRUPOS_FECHADOS);
      if (salvo) setGruposFechados(new Set(JSON.parse(salvo) as string[]));
    } catch {
      // Storage bloqueado (aba privada) — fica tudo aberto, que é o padrão.
    }
  }, []);
  function toggleGrupo(id: string) {
    setGruposFechados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(CHAVE_GRUPOS_FECHADOS, JSON.stringify([...next]));
      } catch {
        // Clique continua funcionando nesta sessão; só não sobrevive a um F5.
      }
      return next;
    });
  }

  // Nome, logo e a decisão "é a marca do produto?" vêm do mesmo lugar da faixa de ícones.
  const { nome, logo, logoEscuro, marcaDoProduto } = useMarcaDaCasca();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-14 items-center justify-start border-b px-4">
        {logo || logoEscuro ? (
          // Sem arte própria para o escuro, preserva a proteção de contraste.
          <div
            className={cn(
              // `min-w-0`: item de flex não encolhe abaixo do `min-width: auto`,
              // que é o valor padrão — sem isso, uma arte própria larga empurra o
              // o conteúdo para fora da barra em vez de encolher.
              "min-w-0 rounded-md",
              !logoEscuro && "dark:bg-white dark:px-2 dark:py-1 dark:shadow-sm",
            )}
          >
            {/* <img> em vez de next/image de propósito: a URL vem de quem hospeda
              (banco ou .env), e next/image exige allowlist de domínios fechada em
              build — a imagem pré-buildada rejeitaria o domínio do self-hoster.
              Altura fixa e largura livre porque a arte enviada tem proporção
              desconhecida; forçar as duas distorceria o logo de quem configurou. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? (
              <img
                src={logo}
                alt={nome}
                className={cn(
                  // `max-w-[min(10rem,100%)]` e não `max-w-[10rem]` sozinho, como o
                  // review mediu (#2723): a linha da logo tem ~207px úteis na barra
                  // aberta e o botão de recolher disputa o mesmo espaço. Uma arte
                  // própria larga (160px) vazava 7px do fundo claro e ficava a 1px
                  // do botão. O teto de 10rem continua valendo, mas agora a imagem
                  // encolhe antes de estourar.
                  //
                  // `max-w-[10rem]` + `max-w-full` não valem os dois: disputam a
                  // MESMA propriedade no CSS e só um sobrevive — a pegadinha que o
                  // review apontou, e por isso o teto é um único `min()`.
                  "h-7 w-auto max-w-[min(10rem,100%)] object-contain",
                  logoEscuro && "dark:hidden",
                )}
              />
            ) : (
              // `truncate` + `title`: o nome longo (uma clínica com nome grande,
              // medido no review) virava 3 linhas dentro de uma linha de 56px e
              // estourava a barra. Uma linha com reticências, e o nome completo
              // continua no tooltip. `block` porque este wrapper não é flex: inline,
              // o `truncate` não corta e o nome passa por cima do botão.
              <span className="block min-w-0 truncate dark:hidden" title={nome}>
                {nome}
              </span>
            )}
            {logoEscuro ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoEscuro}
                alt={nome}
                className="hidden h-7 w-auto max-w-[min(10rem,100%)] object-contain dark:block"
              />
            ) : null}
          </div>
        ) : marcaDoProduto ? (
          // O desenho do produto, inline (ver `components/branding/MarcaDoProduto.tsx`).
          <LogotipoDoProduto nome={nome} className="h-8 w-auto" />
        ) : (
          <span className="min-w-0 truncate font-semibold tracking-tight" title={nome}>
            {nome}
          </span>
        )}
      </div>
      {/*
        A DENSIDADE É MEDIDA, NÃO ESTÉTICA.

        O e2e `navegacao.spec.ts` exige que o menu inteiro caiba em 1280×900 sem
        rolar — porque um grupo abaixo da dobra é indistinguível de um grupo que
        não existe. Com 18 links a margem era de ~4px: a tela nova de Produtos
        estourou a dobra por uma linha, e reprovou no CI.

        `py-1.5` → `py-1` (linha de 32px para 28px) e o intervalo entre grupos de
        12px para 8px devolvem ~90px — folga para o próximo item, em vez de
        deixar a próxima tela nova repetir esta corrida.

        ⚠️ Isto é remendo de densidade, não conserto estrutural. O menu vai
        estourar de novo: a saída existente é o HUB (o grupo IA já a usa — nove
        das treze telas dele moram atrás do "Ver tudo em IA"), e o CRM ainda não
        tem um. Quando o quinto destino de CRM aparecer, é hub que se cria, não
        mais 4px que se raspa.

        ✅ O QUINTO APARECEU, e a promessa foi paga. Tarefas (PR #546) levou o
        CRM a cinco telas e a dobra estourou em 13px — medido em 1280×900,
        `scrollHeight` 776 contra 763 de altura. O conserto foi `/app/crm`, o
        hub do grupo: Produtos e Etapas do funil saíram do menu para dentro
        dele, e nenhum valor deste arquivo mudou por causa disso.

        Fica valendo o mesmo, agora para o próximo grupo: com hub em CRM, IA e
        Organização, tela nova de qualquer um dos três não pressiona mais o
        menu. Quem pressionar é um grupo SEM hub — Atendimento (4), Canais (3)
        ou Análise (3). Quando um deles passar de quatro, a resposta é a mesma:
        cria-se o hub, não se raspa densidade.

        ✅ ANÁLISE FOI A SEGUINTE, e a regra valeu igual. Atividades (PR #583)
        levou o grupo a cinco telas e a dobra estourou de novo — medido em
        1280×900, logado como admin: `scrollHeight` 776 contra 763 de altura
        visível, 13px de excesso, com o link "Audit Log" 13px abaixo da caixa de
        conteúdo da nav. O conserto foi `/app/analise`, o hub do grupo: Evolução
        da IA e Audit Log saíram do menu para dentro dele, e NENHUM valor deste
        arquivo mudou por causa disso. Sobrou 19px de folga — a mesma que havia
        antes de Atividades chegar.

        Ficam sem hub Atendimento e Canais (4 e 2 destinos quando isto foi
        medido) — em qualquer um deles, o quinto destino é que cria o hub, nunca
        mais densidade raspada. A conta é fechada e vale conferir antes de abrir
        o PR: cada linha custa 32px (28px de altura + 4px de `space-y-1`), e
        trocar N destinos do menu por um único link de hub devolve (N-1)×32px.
      */}
      <nav className="flex-1 space-y-2 overflow-y-auto p-2" aria-label={t("Navegação principal")}>
        {grupos.map(({ group, items }) => {
          const tituloId = `nav-grupo-${group.id}`;
          const aberto = !gruposFechados.has(group.id);
          return (
            <div key={group.id} className="space-y-1">
              <h2 id={tituloId}>
                <button
                  type="button"
                  onClick={() => toggleGrupo(group.id)}
                  aria-expanded={aberto}
                  className="flex w-full items-center justify-between rounded-md px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                >
                  {t(group.label)}
                  <CaretDown
                    size={12}
                    weight="bold"
                    className={cn(
                      "shrink-0 text-text-subtle transition-transform",
                      !aberto && "-rotate-90",
                    )}
                    aria-hidden
                  />
                </button>
              </h2>
              {aberto && (
                <ul aria-labelledby={tituloId} className="space-y-1">
                  {items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={isActive ? "page" : undefined}
                          onClick={onNavigate}
                          className={cn(
                            "relative flex items-center gap-3 rounded-md px-3 py-1 text-sm transition-colors",
                            isActive
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                          )}
                        >
                          <Icon size={18} weight={isActive ? "fill" : "regular"} aria-hidden />
                          <span className="truncate">{t(item.label)}</span>
                          {item.healthDot && <ConnectionHealthDot className="ml-auto" />}
                          {item.contador === "casos" && <ContadorDeCasos compacto={false} />}
                          {item.contador === "fila" && <ContadorDaFila compacto={false} />}
                        </Link>
                      </li>
                    );
                  })}
                  {group.hub && (
                    <li>
                      <Link
                        href={group.hub.href}
                        aria-current={pathname === group.hub.href ? "page" : undefined}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-1 text-sm transition-colors",
                          pathname === group.hub.href
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                        )}
                      >
                        <ArrowRight size={18} aria-hidden />
                        <span className="truncate">{t(group.hub.label)}</span>
                      </Link>
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
      <div className="border-t p-2">
        {rodape && (
          <Link
            href={rodape.href}
            aria-current={pathname.startsWith(rodape.href) ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "mb-1 flex items-center gap-3 rounded-md px-3 py-1 text-sm transition-colors",
              pathname.startsWith(rodape.href)
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Gear size={18} aria-hidden />
            <span className="truncate">{t(rodape.label)}</span>
          </Link>
        )}
        <VersionFooter collapsed={false} onNavigate={onNavigate} />
      </div>
    </TooltipProvider>
  );
}
