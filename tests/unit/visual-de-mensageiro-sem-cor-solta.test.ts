/**
 * Visual de mensageiro 17/17 (#99): trava global contra cor solta.
 *
 * Em `app/**` e `components/**`, nenhuma linha de código pode trazer cor fora
 * dos tokens: paleta crua do Tailwind (`bg-amber-500`), `white`/`black` crus
 * (`bg-white`, `text-black/60`), hex, `rgb()`/`hsl()` literal. Cor vem de token
 * (`primary`, `success`, `warning`, `error`, `info`, `border`, `muted`...), que
 * acompanha a marca e troca sozinho entre os temas claro e escuro desenhados à
 * parte. Também reprova `hsl(var(--x))`: os tokens são hex, então esse wrapper
 * produz cor inválida.
 *
 * Esta trava substitui as travas por lote (lote 1 e 2, acesso e onboarding,
 * configurações): cada uma olhava um pedaço da árvore com a mesma regra, e esta
 * olha a árvore inteira.
 *
 * Linhas de comentário não contam (prosa pode citar um hex). O que sobra de
 * proposital está em EXCECOES, cada uma com o MOTIVO escrito. Para entrar ali,
 * a cor precisa ser dado ou conteúdo, e não aparência do produto.
 *
 * Fora do alcance, de propósito: `lib/**` (cores geradas: régua da marca, ícone
 * do app, e-mail HTML) e `emails/**`. Lá a cor é dado computado, não classe.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const PASTAS = ["app", "components"];

const NOMES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTILITARIOS =
  "bg|text|border|ring|from|to|via|fill|stroke|divide|outline|decoration|shadow|accent|caret|placeholder";

export const PROIBIDOS: Array<[string, RegExp]> = [
  ["paleta crua do Tailwind", new RegExp(`\\b(?:${UTILITARIOS})-(?:${NOMES})-\\d{2,3}\\b`)],
  ["branco/preto cru", new RegExp(`\\b(?:${UTILITARIOS})-(?:white|black)\\b`)],
  ["hex", /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b(?<=#\w*[a-fA-F]\w*)/],
  ["hex só de dígitos entre aspas", /["'`]#\d{3,8}["'`]/],
  ["rgb/hsl literal", /\b(?:rgba?|hsla?)\(\s*\d/],
  ["hsl(var(--x)) sobre token hex", /hsl\(\s*var\(/],
];

type Excecao = {
  /** Arquivo exato, ou pasta terminada em `/`. */
  onde: string;
  /** Sem `linha`, vale para o arquivo/pasta inteiro. Com ela, só para a linha que casa. */
  linha?: RegExp;
  motivo: string;
};

const EXCECOES: Excecao[] = [
  {
    onde: "app/globals.css",
    motivo: "É a fonte dos tokens: os hex e rgba dos temas claro e escuro moram aqui.",
  },
  {
    onde: "app/global-error.tsx",
    motivo:
      "Renderiza FORA do layout (substitui o <html>), então nenhum token carregou: " +
      "o CSS próprio espelha os neutros do produto.",
  },
  {
    onde: "app/design/",
    motivo:
      "Laboratório de design (rota pública /design, noindex): mostra paletas e " +
      "pares de fonte CANDIDATOS, com hex e a Atkinson de propósito. Não é tela do produto.",
  },
  {
    onde: "app/admin/(protected)/marca/_css-personalizado.tsx",
    linha: /EXEMPLO/,
    motivo: "Exemplo de CSS personalizado mostrado ao admin: é texto de ajuda, não estilo da tela.",
  },
  {
    onde: "app/admin/(protected)/marca/_form.tsx",
    linha: /COR_NEUTRA_DO_SELETOR|#7a5cd6/,
    motivo: "Valor neutro do seletor de cor e exemplo de código de cor no placeholder e na ajuda.",
  },
  {
    onde: "app/app/settings/marca/_form.tsx",
    linha: /COR_NEUTRA_DO_SELETOR|#7a5cd6/,
    motivo: "Valor neutro do seletor de cor e exemplo de código de cor no placeholder e na ajuda.",
  },
  {
    onde: "components/branding/CampoDeLogo.tsx",
    linha: /\?\? "#ffffff"|rounded-md bg-white/,
    motivo:
      "Prévia do logo do cliente: fundo claro fixo atrás da arte sem versão para o escuro " +
      "(mesma proteção do #659) e o branco de último recurso quando a régua não traz a superfície.",
  },
  {
    onde: "components/branding/MarcaDoProduto.tsx",
    linha: /_CLARO_ESCURO = "fill-\[#/,
    motivo:
      "Cores do LOGO do produto, idênticas às de docs/brand/*.svg e do ícone do app " +
      "(`CORES_DA_MARCA`). É arte da marca, não cromo de tela; a igualdade é provada por " +
      "tests/unit/marca-do-produto.test.tsx. Mudar o logo é decisão de marca, não de limpeza.",
  },
  {
    onde: "components/inbox/ChannelLogo.tsx",
    linha: /color: "text-\[#/,
    motivo:
      "Cor de identidade de cada canal (WhatsApp, Instagram, Messenger), para o atendente " +
      "reconhecer o canal. É dado do canal, não paleta do produto; fica fora dos tokens da marca.",
  },
  {
    onde: "components/inbox/EmailDaMensagem.tsx",
    linha: /bg-white/,
    motivo: "O e-mail recebido é HTML de terceiros, escrito para fundo branco; o quadro dele fica claro nos dois temas.",
  },
  {
    onde: "components/shell/Sidebar.tsx",
    linha: /dark:bg-white/,
    motivo: "Logo do cliente sem arte para o escuro precisa de fundo claro fixo atrás (proteção de contraste do #659).",
  },
  {
    onde: "app/(public)/layout.tsx",
    linha: /dark:bg-white/,
    motivo:
      "Logo do cliente na tela de entrada, sem arte para o escuro, precisa de fundo claro fixo " +
      "atrás (proteção de contraste do #659). `dark:bg-foreground` ficava escuro-sobre-escuro " +
      "no tema escuro; a cerca logo-nao-some-no-tema-escuro.test.ts exige este chip.",
  },
  {
    onde: "components/shell/FaixaDeIcones.tsx",
    linha: /dark:bg-white/,
    motivo: "Logo do cliente sem arte para o escuro precisa de fundo claro fixo atrás (proteção de contraste do #659).",
  },
];

function arquivos(dir: string): string[] {
  return fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : arquivos(rel);
    return /\.(tsx?|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [rel] : [];
  });
}

const COMENTARIO = /^\s*(\/\/|\*|\/\*|\{\/\*)/;

function permitida(arquivo: string, linha: string): boolean {
  return EXCECOES.some(
    (x) =>
      (x.onde.endsWith("/") ? arquivo.startsWith(x.onde) : arquivo === x.onde) &&
      (x.linha === undefined || x.linha.test(linha)),
  );
}

function achados(re: RegExp): string[] {
  const out: string[] = [];
  for (const f of PASTAS.flatMap(arquivos)) {
    fs.readFileSync(path.join(RAIZ, f), "utf8")
      .split("\n")
      .forEach((linha, i) => {
        if (COMENTARIO.test(linha) || !re.test(linha) || permitida(f, linha)) return;
        out.push(`${f}:${i + 1}: ${linha.trim().slice(0, 120)}`);
      });
  }
  return out;
}

describe("#99: sem cor solta em app/** e components/**", () => {
  it("encontra a árvore inteira", () => {
    expect(PASTAS.flatMap(arquivos).length).toBeGreaterThan(500);
  });

  for (const [nome, re] of PROIBIDOS) {
    it(`sem ${nome}`, () => {
      expect(achados(re)).toEqual([]);
    });
  }

  it("toda exceção ainda é necessária e tem motivo", () => {
    const sobrando: string[] = [];
    for (const x of EXCECOES) {
      expect(x.motivo.length).toBeGreaterThan(30);
      const alvo = x.onde.endsWith("/") ? arquivos(x.onde.slice(0, -1)) : [x.onde];
      const usada = alvo.some((f) =>
        fs
          .readFileSync(path.join(RAIZ, f), "utf8")
          .split("\n")
          .some(
            (linha) =>
              !COMENTARIO.test(linha) &&
              PROIBIDOS.some(([, re]) => re.test(linha)) &&
              (x.linha === undefined || x.linha.test(linha)),
          ),
      );
      if (!usada) sobrando.push(`${x.onde} ${x.linha ?? ""}`);
    }
    expect(sobrando).toEqual([]);
  });
});
