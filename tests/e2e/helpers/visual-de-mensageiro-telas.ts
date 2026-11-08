/**
 * As telas do visual de mensageiro, por etapa (issue #82, ADR 0007).
 *
 * É a lista que a jornada `visual-de-mensageiro-jornada.spec.ts` percorre para tirar as capturas que o
 * dono aprova na homologação. Cada etapa da issue tem as suas telas; uma tela nova entra aqui na etapa
 * em que ela é refeita, e a trava `visual-de-mensageiro-telas.test.ts` confere que toda rota listada existe.
 *
 * `acesso`: `app` = administrador da empresa logado; `plataforma` = dono da instalação logado;
 * `publica` = sem login.
 */
export type Acesso = "app" | "plataforma" | "publica";

export interface TelaDoVisual {
  /** Nome do arquivo da captura, sem extensão. */
  slug: string;
  rota: string;
  acesso: Acesso;
}

export const ETAPAS = [1, 2, 3, 4, 5] as const;
export type Etapa = (typeof ETAPAS)[number];

export const TELAS_POR_ETAPA: Record<Etapa, TelaDoVisual[]> = {
  // 1. tokens, fonte, componentes básicos e casca (faixa de ícones, cabeçalho, barra inferior).
  1: [
    { slug: "inbox-casca", rota: "/app/inbox", acesso: "app" },
    { slug: "painel-inicial", rota: "/app", acesso: "app" },
    { slug: "configuracoes-perfil", rota: "/app/settings/profile", acesso: "app" },
  ],
  // 2. Inbox completo.
  2: [
    { slug: "inbox-lista-e-conversa", rota: "/app/inbox", acesso: "app" },
  ],
  // 3. Contatos, Leads, Empresas, Pessoas, Pipeline, Agenda e Tarefas.
  3: [
    { slug: "contatos", rota: "/app/contacts", acesso: "app" },
    { slug: "crm", rota: "/app/crm", acesso: "app" },
    { slug: "empresas", rota: "/app/companies", acesso: "app" },
    { slug: "pessoas", rota: "/app/people", acesso: "app" },
    { slug: "pipeline", rota: "/app/kanban", acesso: "app" },
    { slug: "agenda", rota: "/app/agenda", acesso: "app" },
    { slug: "tarefas", rota: "/app/tasks", acesso: "app" },
  ],
  // 4. Configurações, demais áreas do app e Admin da plataforma.
  4: [
    { slug: "configuracoes-marca", rota: "/app/settings/marca", acesso: "app" },
    { slug: "equipe", rota: "/app/team", acesso: "app" },
    { slug: "campanhas", rota: "/app/campaigns", acesso: "app" },
    { slug: "analise", rota: "/app/analise", acesso: "app" },
    { slug: "conexoes", rota: "/app/connections", acesso: "app" },
    { slug: "modelos", rota: "/app/templates", acesso: "app" },
    { slug: "admin-painel", rota: "/admin/dashboard", acesso: "plataforma" },
    { slug: "admin-marca", rota: "/admin/marca", acesso: "plataforma" },
    { slug: "admin-empresas", rota: "/admin/tenants", acesso: "plataforma" },
  ],
  // 5. Acesso, onboarding e páginas públicas.
  5: [
    { slug: "login", rota: "/login", acesso: "publica" },
    { slug: "cadastro", rota: "/signup", acesso: "publica" },
    { slug: "inicio", rota: "/get-started", acesso: "publica" },
    { slug: "termos", rota: "/legal/terms", acesso: "publica" },
    { slug: "privacidade", rota: "/legal/privacy", acesso: "publica" },
  ],
};

export const VIEWPORTS = [
  { nome: "computador", largura: 1280, altura: 800, celular: false },
  { nome: "celular", largura: 390, altura: 844, celular: true },
] as const;

export const TEMAS = ["claro", "escuro"] as const;
export type TemaDaCaptura = (typeof TEMAS)[number];

/** O tema do app (`lib/theme.tsx`) guarda `light` ou `dark` na chave abaixo. */
export const CHAVE_DO_TEMA = "deskcomm-theme";
export const VALOR_DO_TEMA: Record<TemaDaCaptura, "light" | "dark"> = { claro: "light", escuro: "dark" };
