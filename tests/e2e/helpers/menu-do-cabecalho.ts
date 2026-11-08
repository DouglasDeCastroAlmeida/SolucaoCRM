import type { Page } from "@playwright/test";

/**
 * #117: as ações de atendimento do cabeçalho da conversa (assumir, liberar, transferir, fechar,
 * reabrir, arquivar, reservar serviço, devolver ao automático...) moram no menu "Mais ações". Os itens
 * só existem no DOM com o menu aberto; este é o único lugar que sabe disso.
 */
export async function abrirMaisAcoes(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^(Mais ações|Más acciones|More actions)$/ }).click();
}

/** Abre o menu e clica o item pelo nome (exato). */
export async function clicarAcaoDoCabecalho(page: Page, nome: string | RegExp): Promise<void> {
  await abrirMaisAcoes(page);
  await page.getByRole("menuitem", { name: nome, exact: typeof nome === "string" ? true : undefined }).click();
}
