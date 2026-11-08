import { fireEvent, screen } from "@testing-library/react";

/**
 * "Nota interna" é opção do menu do clipe (#118): abre o clipe e escolhe a opção. Quem sai da nota
 * é o botão "Responder" da faixa da nota. Mesmo caminho do atendente, sem atalho de teste.
 */
export function entrarEmNota(): void {
  fireEvent.click(screen.getByRole("button", { name: /anexar/i }));
  fireEvent.click(screen.getByRole("button", { name: /nota interna/i }));
}
