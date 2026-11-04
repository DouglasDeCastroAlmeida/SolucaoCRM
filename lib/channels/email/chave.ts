/**
 * A chave de rollback do canal de e-mail (mudança 005, AC-008.3).
 *
 * LIGADO por padrão: só o texto `desligado` (sem distinguir caixa alta nem espaço) desliga.
 * Vazio, ausente ou qualquer outro valor deixa ligado, para um `.env` antigo continuar como
 * está. É o inverso do Datafy, que nasce desligado: aqui o canal é parte do produto.
 *
 * O parâmetro existe para o teste; em produção o padrão lê o ambiente.
 */
export function emailCanalLigado(valor: string | undefined = process.env.EMAIL_CANAL): boolean {
  return (valor ?? "").trim().toLowerCase() !== "desligado";
}
