/**
 * Lê um corpo como stream contando BYTES e aborta ao passar do limite: o
 * `content-length` pode faltar ou mentir, então ele sozinho não limita nada.
 * `null` = passou do limite.
 */
export async function lerCorpoLimitado(corpo: ReadableStream<Uint8Array> | null, limite: number): Promise<string | null> {
  if (!corpo) return "";
  const leitor = corpo.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel().catch(() => undefined);
      return null;
    }
    partes.push(value);
  }
  return Buffer.concat(partes).toString("utf8");
}
