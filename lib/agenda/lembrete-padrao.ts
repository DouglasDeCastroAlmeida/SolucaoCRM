/**
 * O TEXTO PADRÃO DO LEMBRETE (mudança 007, REQ-001).
 *
 * Tipo de agendamento novo nasce com dois lembretes ligados, 24 h e 2 h antes,
 * e este é o texto de cada um. Sai como MOLDE (`{{variaveis}}`), não como frase
 * pronta: quem preenche é o cron `agenda-reminder` na hora do envio, e a pessoa
 * que opera o tipo pode editar o molde depois, como qualquer outro.
 *
 * Variáveis usadas: `{{primeiro_nome}}` (contato), `{{tipo}}` (serviço),
 * `{{dia}}`, `{{hora}}` e `{{organizacao}}` (nome da organização).
 *
 * Nome de marca NUNCA entra aqui: a única identidade citada é a da organização,
 * que é variável. A frase de confirmação ("Responda 1 ...") só entra quando o
 * tipo liga `client_confirmation_enabled`: prometer resposta que ninguém lê é
 * pior do que não prometer.
 *
 * Pura de propósito (sem banco, sem relógio): é o que o teste exercita.
 */
import { empacotarLembretes, type PassoDeLembrete } from "@/lib/agenda/lembretes";
import { traduzir } from "@/lib/i18n/dicionario";

/**
 * Os idiomas em que o texto padrão existe. `en` mora aqui mesmo, e não no
 * catálogo JSON: código de produto não pode importar `lib/i18n/traducoes`
 * (cerca em `catalogo-de-idioma-tem-forma`), e o inglês ainda está em construção.
 */
export type IdiomaDoTextoPadrao = "pt-BR" | "es" | "en";

export type DegrauPadrao = "dia_antes" | "horas_antes";

/** Antecedência de cada degrau padrão, do mais longe para o mais perto. */
export const DEGRAUS_DO_LEMBRETE_PADRAO: readonly number[] = [1440, 120];

const MOLDE_DIA_ANTES =
  "Oi {{primeiro_nome}}! Passando para lembrar do seu {{tipo}} em {{organizacao}}: {{dia}} às {{hora}}.";
const MOLDE_HORAS_ANTES =
  "Oi {{primeiro_nome}}! Seu {{tipo}} em {{organizacao}} é daqui a pouco, às {{hora}}. Até já!";

export const FRASE_DE_CONFIRMACAO_PT = "Responda 1 para confirmar ou 2 para remarcar.";

const TEXTOS_EN: Record<string, string> = {
  [MOLDE_DIA_ANTES]:
    "Hi {{primeiro_nome}}! A reminder of your {{tipo}} at {{organizacao}}: {{dia}} at {{hora}}.",
  [MOLDE_HORAS_ANTES]:
    "Hi {{primeiro_nome}}! Your {{tipo}} at {{organizacao}} is coming up at {{hora}}. See you soon!",
  [FRASE_DE_CONFIRMACAO_PT]: "Reply 1 to confirm or 2 to reschedule.",
};

// Cada texto vai ao dicionário como constante, nunca como parâmetro livre: é o que a
// cerca de i18n (`i18n-espanhol-cobre-a-tela`) exige para a tradução ser auditável.
const EM_ESPANHOL: Record<string, (idioma: IdiomaDoTextoPadrao) => string> = {
  [MOLDE_DIA_ANTES]: (idioma) => traduzir(MOLDE_DIA_ANTES, idioma),
  [MOLDE_HORAS_ANTES]: (idioma) => traduzir(MOLDE_HORAS_ANTES, idioma),
  [FRASE_DE_CONFIRMACAO_PT]: (idioma) => traduzir(FRASE_DE_CONFIRMACAO_PT, idioma),
};

function noIdioma(texto: string, idioma: IdiomaDoTextoPadrao): string {
  if (idioma === "en") return TEXTOS_EN[texto] ?? texto;
  return EM_ESPANHOL[texto]?.(idioma) ?? texto;
}

export function textoPadraoDoLembrete(
  degrau: DegrauPadrao,
  idioma: IdiomaDoTextoPadrao,
  confirmacaoDoCliente: boolean,
): string {
  const base = noIdioma(degrau === "dia_antes" ? MOLDE_DIA_ANTES : MOLDE_HORAS_ANTES, idioma);
  if (!confirmacaoDoCliente) return base;
  return `${base} ${noIdioma(FRASE_DE_CONFIRMACAO_PT, idioma)}`;
}

/** Os dois degraus que o tipo novo (ou o botão "ativar lembretes padrão") grava. */
export function lembretesPadrao(
  idioma: IdiomaDoTextoPadrao,
  confirmacaoDoCliente: boolean,
): PassoDeLembrete[] {
  return [
    { minutes: 1440, body: textoPadraoDoLembrete("dia_antes", idioma, confirmacaoDoCliente) },
    { minutes: 120, body: textoPadraoDoLembrete("horas_antes", idioma, confirmacaoDoCliente) },
  ];
}

/**
 * As colunas de `calendar_event_types` que ligam os lembretes padrão. É o MESMO
 * objeto na criação do tipo e no botão "ativar lembretes padrão": um só lugar
 * decide o que "padrão" quer dizer.
 */
export function camposDoLembretePadrao(
  idioma: IdiomaDoTextoPadrao,
  confirmacaoDoCliente: boolean,
): {
  reminder_enabled: true;
  reminder_minutes_before: number;
  reminder_extra_offsets_minutes: number[];
  reminder_body: string;
  reminder_bodies: Record<string, string>;
} {
  const emp = empacotarLembretes(lembretesPadrao(idioma, confirmacaoDoCliente));
  return {
    reminder_enabled: true,
    reminder_minutes_before: emp.principal,
    reminder_extra_offsets_minutes: emp.extras,
    reminder_body: emp.corpoPrincipal,
    reminder_bodies: emp.corposExtras,
  };
}

/** Idioma da organização → idioma do texto padrão. O que não existe cai em pt-BR. */
export function idiomaDoTextoPadrao(locale: string | null | undefined): IdiomaDoTextoPadrao {
  return locale === "es" || locale === "en" ? locale : "pt-BR";
}
