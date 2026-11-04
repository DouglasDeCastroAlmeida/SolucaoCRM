/**
 * Tamanho bruto máximo da soma dos anexos de uma resposta por e-mail. Gmail e Outlook limitam a
 * ~25 MB já codificados (base64 +33%).
 *
 * Mora sozinho, sem nenhuma importação, porque a MATRIZ DE CAPACIDADES (que a tela também lê)
 * o declara: importar `envio.ts` de lá levaria nodemailer e o banco para o pacote do navegador.
 */
export const LIMITE_ANEXOS_BYTES = 18 * 1024 * 1024;
