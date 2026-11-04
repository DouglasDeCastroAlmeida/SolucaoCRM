/**
 * Quanto tempo um e-mail ignorado (só o cabeçalho: remetente, assunto, data, motivo) fica na
 * lista antes de o cron `data-retention` apagá-lo. Fixo em 30 dias: é dado de terceiros que
 * nunca falaram com a empresa, e a lista serve para a pessoa conferir e promover, não para arquivo.
 * Arquivo à parte para o cron não carregar as bibliotecas de IMAP só para ler um número.
 */
export const RETENCAO_DOS_IGNORADOS_DIAS = 30;
