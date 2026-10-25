# Perfil: Web React

> **Quando usar:** front-end React (Vite ou Next.js) em TypeScript, em projeto novo ou sem design system já estabelecido.

Se o projeto já tem biblioteca de componentes, tema, ícones ou convenções próprias, **o que existe prevalece**: aplique deste perfil só o que não conflita e registre a divergência como decisão (D-xx) no Grill.

## Componentes e design system

Escolha **uma** base por projeto e registre a escolha em um ADR. Não misture bibliotecas de componentes.

| Base | Quando escolher | Referência |
| :-- | :-- | :-- |
| MUI (Material UI) | Aplicações gerais, formulários, painéis | https://mui.com/material-ui/getting-started/ |
| Ant Design | Sistemas corporativos, telas densas de dados, tabelas e filtros | https://ant.design/docs/react/introduce |
| Tailwind CSS + componentes headless | Identidade visual própria, landing pages, controle fino do layout | https://tailwindcss.com/docs |

- Cores, tipografia, espaçamento, raios e sombras vêm de **tokens do tema**, nunca valores soltos no componente.
- Acabamento visual (tipografia, hierarquia, espaçamento, microinterações): siga as diretrizes do Impeccable Style — https://impeccable.style/docs/
- Componentes de tela ficam finos: lógica e chamadas de API em hooks/serviços testáveis.

## Cores e contraste

- Monte a paleta com Color Hunt (https://colorhunt.co/) ou Adobe Color (https://color.adobe.com/create/color-wheel) e converta em tokens (primária, secundária, neutros, sucesso, aviso, erro).
- Contraste **WCAG 2.2 AA**: 4,5:1 para texto normal, 3:1 para texto grande e elementos de interface.
- Modo escuro, se existir, é outro conjunto de tokens, não `filter` ou inversão.
- Cor nunca é o único meio de transmitir informação (erro também tem ícone ou texto).

## Ícones

- **Lucide** (https://lucide.dev/icons/) é o conjunto padrão. Importe ícone por ícone, nunca o pacote inteiro.
- **Lordicon** (https://lordicon.com/) só em momentos pontuais de destaque (onboarding, sucesso); animações pesam no bundle.
- **Heroicons** (https://heroicons.com/) e **React Icons** (https://react-icons.github.io/react-icons/) apenas quando faltar um ícone no conjunto padrão.
- Ícone sem texto visível exige `aria-label`; ícone decorativo leva `aria-hidden`.

## Acessibilidade

- HTML semântico primeiro (`button`, `nav`, `main`, `label`); ARIA só quando o HTML não resolve.
- Tudo operável por teclado, com foco visível e ordem lógica.
- Formulários: `label` associado, mensagem de erro ligada ao campo e anunciada.
- Imagens com `alt` significativo ou vazio quando decorativas.

## Código

- TypeScript `strict`, sem `any` e sem casts inseguros.
- Validação de formulários e de respostas de API com Zod nas bordas.
- Estado de servidor separado do estado de interface; nada de dado de API duplicado em estado local sem motivo.
- Layout responsivo a partir de 360 px de largura.

## Testes

| Camada | Ferramenta | Regra |
| :-- | :-- | :-- |
| Componente | Vitest/Jest + Testing Library + user-event | Buscar por papel e rótulo (`getByRole`, `getByLabelText`), nunca por classe CSS ou `data-testid` quando houver alternativa acessível |
| E2E | Playwright | Locators por papel; só as jornadas críticas de cada critério de aceite; sem `waitForTimeout` |
| Acessibilidade | `@axe-core/playwright` | Zero violações `serious` e `critical` nas telas tocadas |

Para economizar tokens: rode E2E com reporter de linha (`--reporter=line`) e via `sdd run e2e`; screenshots e traces só quando um teste falhar.

## Ferramentas no Claude Code

- **MUI MCP** (servidor oficial de documentação do MUI): consultar API e exemplos de componentes no design e na implementação.
- **Playwright MCP** ou **Chrome DevTools MCP**: depurar uma falha específica no navegador (console, rede, layout). Não use como rotina de verificação: capturas de tela consomem muitos tokens. A verificação é a suíte Playwright.
- Skill de front-end (ex.: `frontend-design`), se instalada: apoio na direção visual de telas novas.

## Definition of Done adicional

- Sem erros nem avisos novos no console do navegador.
- axe sem violações `serious`/`critical` nas telas alteradas.
- Contraste AA conferido nos tokens novos.
- Tela utilizável por teclado e em 360 px.
