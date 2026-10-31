import { describe, expect, it } from "vitest";

import { MENSAGEM_ASAAS_FORA, MENSAGEM_MUITAS_TENTATIVAS } from "@/lib/billing-trial/iniciar";
import { paginaDeAviso } from "@/lib/billing-trial/pagina";
import { AVISO_TENTAR_DE_NOVO, FRASE_CONFIRMANDO, TITULO_CONFIRMANDO, textoDaPagina } from "@/lib/billing-trial/textos";
import { MENSAGEM_TRIAL_JA_USADO } from "@/lib/cobranca/trial-documento";

const MARCA = { nome: "Marca <Teste>", accent: "#112233", accentFg: "#ffffff" };
const FRASES = [
  "Cadastre o cartão do seu teste grátis",
  "Você só será cobrado em {dia}. Hoje não sai nada do seu cartão.",
  "Plano {plano}: {preco} {periodo}, a partir de {dia}. Cancele antes disso e não paga nada.",
  "Continuar para o cartão",
  "O teste grátis já foi usado",
  "Não foi possível abrir o cartão",
  "Já estamos abrindo a página do cartão. Aguarde alguns segundos e tente de novo.",
  "Informe seu CPF ou CNPJ",
  "CPF ou CNPJ",
  "Esse CPF ou CNPJ não confere. Confira os números e tente de novo.",
  "Voltar",
  "por mês",
  "por ano",
  "Verificar agora",
  "Tentar de novo",
  TITULO_CONFIRMANDO,
  FRASE_CONFIRMANDO,
  AVISO_TENTAR_DE_NOVO,
  MENSAGEM_ASAAS_FORA,
  MENSAGEM_MUITAS_TENTATIVAS,
  MENSAGEM_TRIAL_JA_USADO,
];

describe("páginas de /cobranca/iniciar", () => {
  it("AC-003.2: toda frase existe em es e en, diferente do português, e a data entra depois de traduzir", () => {
    for (const frase of FRASES) {
      expect(textoDaPagina(frase, "es"), `es: ${frase}`).not.toBe(frase);
      expect(textoDaPagina(frase, "en"), `en: ${frase}`).not.toBe(frase);
      expect(textoDaPagina(frase, "pt-BR")).toBe(frase);
    }
    expect(textoDaPagina("Você só será cobrado em {dia}. Hoje não sai nada do seu cartão.", "en", { dia: "07/11" })).toBe(
      "You will only be charged on 07/11. Nothing is taken from your card today.",
    );
  });

  it("AC-003.2: a página usa o nome e a cor da marca, o idioma e escapa o que é texto", async () => {
    const r = paginaDeAviso({
      marca: MARCA,
      idioma: "es",
      titulo: "T",
      paragrafos: ["p"],
      documento: { rotulo: "CPF o CNPJ", ajuda: "ajuda", erro: "erro" },
      enviar: { texto: "Ir", acao: "/cobranca/iniciar" },
      voltar: { texto: "Volver", href: "/account-suspended" },
      status: 422,
    });
    const html = await r.text();

    expect(r.status).toBe(422);
    expect(html).toContain('<html lang="es">');
    expect(html).toContain("Marca &lt;Teste&gt;");
    expect(html).toContain("#112233");
    expect(html).toContain('name="documento"');
    expect(html).toContain('role="alert"');
    expect(r.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(r.headers.get("Content-Security-Policy")).not.toContain("script-src");
  });

  it("AC-003.2: cor fora do formato nunca entra no CSS (cai na cor do sistema)", async () => {
    const html = await paginaDeAviso({
      marca: { nome: "M", accent: "red;}</style><script>x", accentFg: "#fff" },
      idioma: "en",
      titulo: "T",
      paragrafos: [],
      voltar: { texto: "Back", href: "/" },
    }).text();

    expect(html).not.toContain("<script>");
    expect(html).toContain("AccentColor");
  });
});
