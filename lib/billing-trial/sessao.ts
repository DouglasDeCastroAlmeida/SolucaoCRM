/**
 * A sessão do checkout do trial na linha (`checkout_sessao_id`): `<tentativa>:<id do provedor>`.
 * A tentativa é o id que o selo da URL de retorno amarra (ver `retorno.ts`); fica num arquivo
 * à parte, sem `env`, porque `confirmar` também a lê.
 */
export function sessaoDaTentativa(tentativa: string, idDoProvedor: string): string {
  return `${tentativa}:${idDoProvedor}`;
}

/** A sessão guardada na linha é a da tentativa que o selo diz? */
export function sessaoEhDaTentativa(sessaoGuardada: string | null, tentativa: string): boolean {
  return sessaoGuardada !== null && sessaoGuardada.startsWith(`${tentativa}:`);
}
