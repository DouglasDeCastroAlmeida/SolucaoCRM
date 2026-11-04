import { describe, expect, it } from "vitest";

import { higienizarHtml } from "./html-seguro";

describe("higienizarHtml", () => {
  it("AC-007.3: remove script, formulario, iframe, estilo e imagem remota", () => {
    const sujo = `
      <p onclick="roubar()">Ola <b>mundo</b></p>
      <script>alert(1)</script>
      <style>body{background:url(http://x.com/a.png)}</style>
      <form action="http://x.com"><input name="s" value="1"><button>Enviar</button></form>
      <iframe src="http://x.com/embed"></iframe>
      <img src="http://rastreio.com/pixel.gif" width="1" height="1">
      <p style="color:red" class="x">fim</p>`;
    const limpo = higienizarHtml(sujo);
    expect(limpo).toContain("Ola <b>mundo</b>");
    expect(limpo).toContain("fim");
    for (const proibido of ["<script", "alert(1)", "<style", "background", "<form", "<input", "<button", "<iframe", "<img", "rastreio.com", "onclick", "style=", "class="]) {
      expect(limpo, proibido).not.toContain(proibido);
    }
  });

  it("AC-007.3: link com javascript: perde o endereco e link seguro ganha rel", () => {
    const limpo = higienizarHtml(`<a href="javascript:alert(1)">ruim</a> <a href="https://exemplo.com/p">bom</a>`);
    expect(limpo).not.toContain("javascript:");
    expect(limpo).toContain('href="https://exemplo.com/p"');
    expect(limpo).toContain('rel="noopener noreferrer nofollow"');
    expect(limpo).toContain('target="_blank"');
  });

  it("AC-007.3: entrada vazia devolve texto vazio", () => {
    expect(higienizarHtml("")).toBe("");
  });
});
