import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import { coresDaBarraDoNavegador } from "@/lib/branding/barra-do-navegador";
import { MarcaDaInstalacaoProvider } from "@/lib/branding/contexto";
import { cssDaMarca } from "@/lib/branding/css";
import { iconeDaAba, sufixoDoIcone } from "@/lib/branding/icone";
import { folhaPersonalizadaDaInstalacao } from "@/lib/branding/folha-personalizada";
import { CABECALHO_SEM_CSS } from "@/lib/branding/sem-css-personalizado";
import {
  marcaDaInstalacao,
  motivoDoFallback,
  registrarEstadoDaMarca,
  type LinhaDaMarca,
} from "@/lib/branding/instalacao";
import { REGUA_DO_PRODUTO } from "@/lib/branding/regua-do-produto";
import {
  camadaDaInstalacao,
  camadaDoAmbiente,
  resolverMarca,
  type MarcaResolvida,
} from "@/lib/branding/resolve";
import { camadaDaMarca } from "@/lib/branding/camada-de-marca";
import { marcaDoPedido } from "@/lib/branding/marca-do-pedido";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ThemeProvider } from "@/lib/theme";
import { Providers } from "./providers";
import { PublicEnvScript } from "./public-env-script";
import "./globals.css";

// Visual de mensageiro (#84): o texto usa a fonte do sistema (pilha em
// `--font-sans`, app/globals.css), então só a monoespaçada é versionada em
// app/fonts/ (origem e licença no README de lá). A família passa a se chamar
// como a variável JS: use sempre a custom property (--font-mono).
const plexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-400-latin-latin-ext.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-500-latin-latin-ext.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  variable: "--font-mono",
});

/**
 * A pilha de camadas da marca da instalação: BANCO acima, `.env` embaixo.
 *
 * Uma função só porque `generateMetadata`, `MarcaNoNavegador`
 * precisam da MESMA resolução — montagens separadas da pilha divergiriam, e a
 * divergência apareceria como título da aba com uma marca, cor com outra e barra
 * lateral com uma terceira.
 *
 * A leitura do banco é memoizada em `lib/branding/instalacao.ts`, então as três
 * chamadas por requisição custam UMA consulta a cada TTL.
 */
async function marcaResolvida(): Promise<{
  /** A linha crua — guardada para quem precisar do registro bruto. */
  readonly linha: LinhaDaMarca | null;
  readonly marca: MarcaResolvida;
}> {
  const linha = await marcaDaInstalacao();
  // Antes do login só a marca do endereço entra (organização > marca > plataforma > ambiente).
  // `marcaDoPedido` nunca lança: banco fora ou chave `off` = marca padrão, toda nula.
  const { brand } = await marcaDoPedido();
  const marca = resolverMarca(
    [camadaDaMarca(brand), camadaDaInstalacao(linha), camadaDoAmbiente(env)],
    REGUA_DO_PRODUTO,
  );
  return { linha, marca };
}

/**
 * Metadata dinâmica (não `export const metadata`) para a marca ser lida em RUNTIME.
 * Constante seria resolvida durante o `next build`, e a imagem self-host — que é
 * pré-buildada — carregaria a nossa marca para sempre. Ver `lib/branding.ts`.
 *
 * O `template` é o que faz a marca existir em UM lugar só: as páginas filhas
 * declaram apenas o próprio nome ("Entrar") e herdam o sufixo daqui.
 *
 * Passou a ler o BANCO (era `branding()`, só `.env`) porque senão `app_name` na
 * tabela seria coluna decorativa nesta fase: o operador trocaria o nome, a
 * gravação daria certo e a aba continuaria com o nome antigo. Os demais call
 * sites de `lib/branding` seguem no `.env` — está declarado no handoff, com o
 * motivo medido.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { linha, marca } = await marcaResolvida();
  const { name } = marca;
  return {
    title: {
      default: `${name} — atendimento e vendas por WhatsApp com agentes de IA`,
      template: `%s · ${name}`,
    },
    description:
      "Centralize o atendimento por WhatsApp num funil só. Agentes de IA resolvem o que dá pra resolver e passam para o time humano o que importa — com tudo registrado. Multi-tenant, LGPD-nativo, feito para operações brasileiras.",
    applicationName: name,
    authors: [{ name }],
    keywords: ["CRM", "atendimento", "WhatsApp", "IA conversacional", "LGPD", "multi-tenant"],
    robots: { index: false, follow: false },
    // Sem esta linha o navegador pede `/favicon.ico`, que não existe: medido em
    // produção, o 404 é a `app/not-found.tsx` INTEIRA (19.435 bytes de HTML)
    // servida para um pedido de ícone, em toda navegação sem cache. Declarar
    // `/icon` faz o pedido ir para `app/icon.tsx`, que desenha a marca da
    // instalação em runtime — ver o cabeçalho daquele arquivo para por que ele
    // não pode ser um arquivo estático em `public/`.
    // Com um ícone subido em `/admin/marca` (migration 0443), o link aponta para
    // o arquivo no storage da instalação — ver `iconeDaAba`.
    //
    // O iPhone não lê o ícone nem o nome do manifest: pede `apple-touch-icon`
    // (o PNG de 180, com margem para o canto que ele arredonda) e
    // `apple-mobile-web-app-title` — sem este, a tela de início ganharia o
    // título longo acima.
    icons: {
      icon: iconeDaAba(linha?.favicon_path),
      apple: `/app-icon/180${sufixoDoIcone(linha?.favicon_path)}`,
    },
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
  };
}

/**
 * A cor da barra do navegador sai da RÉGUA, não de dois hexes redigitados aqui.
 * O porquê — inclusive por que isto NÃO deve virar `generateViewport()` lendo o
 * banco — está no cabeçalho de `lib/branding/barra-do-navegador.ts`.
 *
 * ─── As quatro linhas abaixo do `themeColor`, e por que não são enfeite ──────
 *
 * `viewportFit: "cover"` é PRÉ-REQUISITO, não acabamento. Sem ele o navegador
 * não estende o documento sob o notch, e aí `env(safe-area-inset-*)` devolve
 * **zero** em toda regra que o consulte — o CSS fica escrito e sem efeito. O
 * princípio 3 de `docs/design-system/screen-flow/07-responsive-strategy.md`
 * ("`safe-area-inset-bottom` em qualquer composer ou bottom-bar") estava escrito
 * desde abril de 2026 e não tinha como funcionar: faltava esta chave.
 *
 * `interactiveWidget: "resizes-content"` é o que faz o teclado virtual ENCOLHER
 * a área de conteúdo em vez de deslizar por cima dela. No padrão
 * (`resizes-visual`) o composer da conversa fica atrás do teclado — a mesma
 * classe de defeito do rodapé, só que causada pelo sistema.
 *
 * `width`/`initialScale` o Next já emitia por padrão; declarar aqui é o que
 * impede que acrescentar qualquer outra chave a este objeto apague o default
 * silenciosamente (o Next só emite o default quando NENHUMA das duas existe).
 * Nada de `maximumScale` nem `userScalable: false`: impedir o zoom é barreira
 * de acessibilidade, e quem lê a tela de perto precisa dele.
 */
export const viewport: Viewport = {
  themeColor: coresDaBarraDoNavegador(REGUA_DO_PRODUTO),
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

// Inline FOUC-prevention. Conteúdo é string literal estática (zero input do usuário),
// portanto seguro. Lê localStorage + prefers-color-scheme antes do primeiro paint.
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('deskcomm-theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var r=(s==='dark'||s==='light')?s:((s==='system'||!s)&&d?'dark':'light');document.documentElement.setAttribute('data-theme',r);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

/**
 * A cor da MARCA não colore mais a interface (ADR 0008, issue #114): o verde de mensageiro e os
 * neutros são fixos e moram em `app/globals.css`. A marca da instalação continua em nome, logo,
 * favicon e e-mails; por isso este layout não injeta mais nenhum `<style>` de cor.
 */

/**
 * CSS visual, escopado e validado do administrador da instalação. `?sem_css=1`
 * desliga a folha para quem pediu (ver `lib/branding/sem-css-personalizado.ts`).
 */
async function EstiloCssPersonalizado() {
  const desligada = (await headers()).get(CABECALHO_SEM_CSS) === "1";
  const css = await folhaPersonalizadaDaInstalacao(desligada);
  if (!css) return null;
  return <style id="marca-css-personalizado" dangerouslySetInnerHTML={{ __html: css }} />;
}

/**
 * A marca que atravessa para o NAVEGADOR — a MESMA pilha da aba e do CSS.
 *
 * Componente próprio, e não uma chamada dentro do `RootLayout`, pelo mesmo
 * motivo do antigo bloco de cor: só este nó do `<head>` espera o banco, e o resto do
 * documento não passa a depender de uma consulta que a marca já memoiza.
 *
 * Antes desta onda, `<PublicEnvScript/>` lia `env.APP_NAME`/`env.APP_LOGO_URL`
 * — o arquivo de instalação cru. Era por aqui que a marca GRAVADA parava de
 * chegar aos client components: o título da aba lia o banco e a barra lateral
 * lia o `.env`, e `platform_branding.logo_url` não tinha leitor nenhum. Ver o
 * cabeçalho de `app/public-env-script.tsx`.
 */
async function MarcaNoNavegador() {
  const { marca } = await marcaResolvida();
  return <PublicEnvScript marca={{ name: marca.name, logoUrl: marca.logoUrl }} />;
}

/**
 * A marca que os CLIENT COMPONENTS leem — a MESMA pilha, entregue por prop.
 *
 * ⚠️ Esta é a peça que impede o hydration mismatch, e o motivo é assimétrico:
 * `<PublicEnvScript/>` acima entrega a marca ao NAVEGADOR, e o navegador só a
 * tem depois que o script roda. O SSR de um `"use client"` acontece ANTES disso,
 * no servidor, onde `branding()` lê `process.env` — o `.env`, sem o banco. Numa
 * instalação com logo gravado pela tela e `APP_LOGO_URL` vazio, o servidor
 * renderizava `<span>` com o nome e o cliente hidratava `<img>` com o logo:
 * troca de TIPO de elemento, que é React #418 em toda tela.
 *
 * Passar o valor por prop resolve pela origem, não pela coincidência: o que o
 * servidor renderiza e o que o cliente hidrata é literalmente o mesmo objeto,
 * serializado no payload do RSC. Mesma rota que `user`/`activeOrg` já fazem em
 * `hooks/auth/AuthProvider.tsx`.
 *
 * Custa ZERO consulta a mais: `marcaResolvida()` chama `marcaDaInstalacao()`,
 * memoizada por TTL no módulo, e o `<head>` já espera a
 * mesma resposta antes de o documento ser liberado.
 */
async function MarcaDosClientComponents({ children }: { children: React.ReactNode }) {
  const { marca } = await marcaResolvida();
  // Só os três campos de `Branding`: `marca` carrega junto `cor`, `origens` e
  // `motivos`, que são diagnóstico do servidor e não têm leitor no navegador —
  // mandá-los engordaria o payload do RSC de TODA página com dado que ninguém lê.
  return (
    <MarcaDaInstalacaoProvider
      marca={{
        name: marca.name,
        logoUrl: marca.logoUrl,
        logoDarkUrl: marca.logoDarkUrl,
        initial: marca.initial,
      }}
    >
      {children}
    </MarcaDaInstalacaoProvider>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      data-theme="light"
      suppressHydrationWarning
      className={plexMono.variable}
    >
      <head>
        {/* Primeiro de tudo: a cor da instalação, antes do CSS e do script de tema. */}
        <EstiloCssPersonalizado />
        {/* Config pública do Supabase + marca resolvida, em runtime (imagem
            genérica self-host). */}
        <MarcaNoNavegador />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      {/*
        `min-h-dvh` e não `min-h-screen`: `100vh` é a janela com a barra de
        endereço do navegador móvel RECOLHIDA, e esse valor nunca é corrigido.
        Com a barra visível — o estado em que toda página abre — o `<body>` mede
        mais que a janela e o documento nasce rolável sem ter conteúdo para
        rolar: um puxão de ~60px que não leva a nada, na primeira interação de
        quem abre o produto no celular. Princípio 2 de
        `docs/design-system/screen-flow/07-responsive-strategy.md`.
      */}
      <body className="min-h-dvh bg-bg font-sans text-text antialiased">
        <Providers>
          <MarcaDosClientComponents>
            <ThemeProvider>{children}</ThemeProvider>
          </MarcaDosClientComponents>
          {/*
            O AVISO VAI PARA BAIXO, e isto foi medido na tela.

            Com `position="top-right"` o sonner usa largura CHEIA abaixo de
            600px (regra dele, não nossa) — então no celular o aviso virava uma
            faixa colada no topo, **cobrindo a barra de navegação inteira**:
            hambúrguer, organização, busca e sino sumiam atrás dele. Visto em
            360px na agenda, com um aviso de quatro linhas.

            `position` é prop, não CSS: não dá para torná-la responsiva sem
            decidir layout em JavaScript, que é o que a casa recusa (pisca na
            hidratação). E a estratégia responsiva já pedia baixo nos DOIS
            tamanhos — "Desktop: bottom-right; Mobile: bottom-center,
            full-width com `safe-area-inset-bottom`". O código é que discordava.

            ⚠️ Isto muda o desktop também: o aviso passa do canto superior
            direito para o inferior direito.

            `mobileOffset` sobe o aviso acima do que o rodapé já ocupa — a barra
            de abas do celular (`components/shell/BarraInferior.tsx`) mora
            exatamente onde o aviso cairia. O número vem do contrato
            (`--rodape-ocupado`), não de uma constante aqui: é a mesma variável
            que o `<main>` desconta, então os dois nunca discordam. Quando não
            há barra, o `max()` cai na área segura do iOS (ou nos 8px).
          */}
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            duration={4000}
            mobileOffset={{
              bottom:
                "calc(0.5rem + max(0.5rem, env(safe-area-inset-bottom, 0px), var(--rodape-ocupado, 0px)))",
              left: "0.75rem",
              right: "0.75rem",
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
