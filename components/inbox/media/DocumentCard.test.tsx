/**
 * Documento no formato do mensageiro (#89): cartao com icone, nome e uma linha "TIPO · tamanho",
 * que baixa ao tocar.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocumentCard } from "./DocumentCard";

describe("DocumentCard", () => {
  it("mostra o nome original e a linha 'TIPO · tamanho'", () => {
    render(
      <DocumentCard messageId="m1" mime="application/pdf" sizeBytes={2048} storagePath="x/contrato.pdf" isOutbound={false} fileName="contrato.pdf" />,
    );
    expect(screen.getByTitle("contrato.pdf")).toBeTruthy();
    expect(screen.getByTestId("documento-detalhe").textContent).toMatch(/^PDF · 2(,0)? ?KB$/i);
  });

  it("e um link que baixa o arquivo da mensagem", () => {
    render(<DocumentCard messageId="m9" mime="application/pdf" sizeBytes={1024} storagePath="a.pdf" isOutbound />);
    expect(screen.getByRole("link").getAttribute("href")).toContain("m9");
  });
});
