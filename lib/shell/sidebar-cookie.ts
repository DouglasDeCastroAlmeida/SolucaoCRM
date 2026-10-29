/**
 * Preferência do menu lateral, POR USUÁRIO (mudança 009, REQ-001).
 * Cookie `sidebar_collapsed_<userId>`: "1" recolhido, "0" expandido, ausente =
 * RECOLHIDO. O cookie antigo `sidebar_collapsed` (sem usuário) não é mais lido.
 * O userId vem sempre do servidor (`auth.getUser()`), nunca do cliente.
 */
export function nomeDoCookieDoMenu(userId: string): string {
  return `sidebar_collapsed_${userId}`;
}

export function lerSidebarRecolhida(
  get: (nome: string) => { value: string } | undefined,
  userId: string,
): boolean {
  return get(nomeDoCookieDoMenu(userId))?.value !== "0";
}
