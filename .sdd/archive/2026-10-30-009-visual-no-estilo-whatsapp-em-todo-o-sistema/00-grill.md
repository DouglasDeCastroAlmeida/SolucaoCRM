# Grill: Visual no estilo WhatsApp em todo o sistema

> Mudança `009-visual-no-estilo-whatsapp-em-todo-o-sistema` · porte L · 2026-10-29
> Interrogatório técnico antes de qualquer requisito ou código. Uma pergunta por vez, sempre com
> uma resposta recomendada. O que o código responde, o agente descobre sozinho em vez de perguntar.

## Pedido original

Dono (28/10/2026): "não vi a mudança do front-end"; esperava "o sistema com a cara de WhatsApp conforme programado no início". Diretriz do início do projeto: usar o DeskcommCRM como base e adotar o visual do WhatsApp em todo o sistema, para a experiência do cliente autônomo ser fluida, sem mudar funcionalidades. Referência de layout indicada: https://github.com/ankitrajxd/whatsapp-frontend. Em 29/10/2026: "Na versão final entrará o visual do WhatsApp."

## Contexto levantado no código

- Spec do projeto, D-14: o visual segue o PADRÃO DE USO do WhatsApp, mas com as cores e o logo de cada marca; sem verde, logo ou ícones do WhatsApp (risco de marca registrada e white-label). Seção 7.1: reestilização do inbox de 3 painéis.
- A mudança 004 (arquivada) reestilizou só a caixa de conversas (balões, ✓✓, menu "/") pelos tokens da marca. O resto do sistema (menu lateral, CRM, IA, Análise, Configurações) manteve o visual do DeskcommCRM.
- Tailwind 4 CSS-first: tokens em `app/globals.css` (`:root` e `[data-theme]`), vigiado por `tests/unit/tailwind-tokens.test.ts`; marca vigiada por `tests/unit/branding.test.ts`.
- Doutrina de QA visual do CLAUDE.md: prova pela tela, medidas por ferramenta, ambiente fresco.

## Perguntas e respostas

### P1. Quanto do sistema entra no visual de WhatsApp?
- Recomendação do agente: a opção B. (A) só a casca global: menu lateral estreito de ícones, cabeçalhos, cores, tipografia e cantos no estilo do WhatsApp, em todas as telas. (B) A mais as telas de lista (contatos, funil, tarefas, agenda) lidas como lista de conversas: avatar, prévia e horário. (C) refazer tudo como o WhatsApp Web, inclusive o celular. A B dá a cara de WhatsApp no sistema inteiro sem mexer em funcionalidade; a C é a maior e arrisca quebrar o que já funciona.
- Resposta: B (casca global mais as telas de lista lidas como lista de conversas).

## Decisões

- **D-01** Escopo B: casca global mais as telas de lista lidas como lista de conversa (P1).
- **D-02** Referência `ankitrajxd/whatsapp-frontend` (Apache-2.0) só como referência de layout; nenhum código copiado (P2).
- **D-03** Menu lateral em barra estreita de ícones, recolhida por padrão no computador, nome ao passar o mouse, botão de expandir com escolha salva por usuário; no celular, barra de baixo com itens principais e "Mais" (P3).
- **D-04** Funil (quadro) e agenda (calendário) mantêm a forma e herdam a casca. Viram lista de conversa: Contatos, Tarefas, Casos, Follow-ups e cartões da Central. Gráficos e Configurações só herdam a casca (P4).
- **D-05** Sem opção de visual antigo. Retorno pela imagem anterior. Duas levas, cada uma provada na hml antes da produção: 1) casca, 2) listas como conversa (P5).
- **D-06** O dono aprova capturas lado a lado (tela nova, antiga e WhatsApp Web; claro e escuro; computador e celular) antes de cada leva ir à produção. Medidas por ferramenta: contraste 4,5 mínimo, alvos de toque de 44 px, sem rolagem lateral no celular (P6).
- **D-07** Vale a D-14 da spec do projeto: cores e logo de cada marca; nunca o verde, o logo ou os ícones do WhatsApp. Marca vem dos tokens, sem hex fixo (cerca `branding.test.ts`).

## Fora de escopo

- Qualquer mudança de funcionalidade, de rota, de permissão ou de dado.
- Copiar código da referência visual.
- Usar verde, logo ou ícones do WhatsApp.
- Opção de visual clássico.
- Reescrever funil, agenda ou gráficos com outra forma.
- Cobrança (003) e e-mail (005): mudanças separadas.

## Riscos e premissas

- Risco: tela que depende de largura do menu antigo (cartões, tabelas largas) quebrar no menu estreito. Mitigação: prova pela tela medida em cada leva.
- Risco: a regra de navegação (`navegacao-completude`) e as telas sem porta: o menu estreito não pode esconder destino. Mitigação: o catálogo `NAV_CATALOG` continua a fonte única.
- Premissa: as telas atuais são shadcn com tokens; a mudança é de tokens e composição, não de componentes novos de negócio.
- Premissa: o dono avalia o resultado olhando a hml; sem avaliação, a leva não vai à produção.
- A confirmar no design: nível exato de mudança de tipografia, e se alguma tela usa cores fixas fora dos tokens.

### P2. Licença da referência visual
- Fonte: `gh api repos/ankitrajxd/whatsapp-frontend` — licença Apache-2.0 (permite uso com aviso). Mesmo assim, o plano é NÃO copiar código dele: só tomar como referência de layout, e desenhar com os nossos tokens e componentes (shadcn), por causa de D-14 e do white-label.

### P3. O menu lateral vira uma barra estreita de ícones, como no WhatsApp Web?
- Recomendação do agente: sim, recolhida por padrão no computador, com o nome de cada item ao passar o mouse e um botão para expandir (a escolha fica salva por usuário). Hoje o menu é largo, com grupos e textos (Atendimento, CRM, Agente de IA, Canais, Análise, Configurações). A barra de ícones é o que mais dá cara de WhatsApp, mas para um usuário leigo o texto ajuda a achar as coisas; por isso o botão de expandir e o rótulo ao passar o mouse. No celular, o menu vira a barra de baixo com 4 ou 5 itens principais e um "Mais".
- Resposta: Concordo (barra estreita de ícones recolhida por padrão no computador, nome ao passar o mouse, botão de expandir salvo por usuário; no celular, barra de baixo com itens principais e "Mais").

### P4. Telas que não são lista (funil em quadro, agenda em calendário, gráficos) também mudam?
- Recomendação do agente: o funil continua em quadro (kanban) e a agenda em calendário, porque o WhatsApp não tem equivalente e mudar a forma quebraria o uso. Eles só herdam a casca nova (cores, cantos, tipografia, cabeçalho). Viram "lista de conversa" apenas as telas que já são listas de pessoas ou itens: Contatos, Tarefas, Casos, Follow-ups e os cartões de aviso da Central. Gráficos e configurações só herdam a casca.
- Resposta: Sim (funil e agenda mantêm a forma e herdam a casca; viram lista de conversa Contatos, Tarefas, Casos, Follow-ups e cartões da Central; gráficos e Configurações só herdam a casca).

### P5. Mantemos uma opção de voltar ao visual antigo?
- Recomendação do agente: não. Uma opção "visual clássico" dobra a manutenção, a prova pela tela e as cercas de marca e de tokens. O retorno seguro é pela imagem anterior (menos de 2 minutos, sem mexer no banco, porque a mudança é só visual). Para reduzir o risco, entregar em duas levas, cada uma provada na hml antes da produção: primeiro a casca (menu, cores, tipografia, cabeçalhos), depois as listas como conversa.
- Resposta: Sim (sem opção de visual antigo; retorno pela imagem anterior; duas levas, cada uma provada na hml antes da produção: casca e depois listas como conversa).

### P6. Quem diz que ficou com cara de WhatsApp, e como?
- Recomendação do agente: você, olhando as telas na hml antes de cada leva ir para a produção. Eu entrego capturas lado a lado (a tela nova, a tela antiga e, como referência, o WhatsApp Web) em claro e escuro, no computador e no celular, e você aprova ou pede ajuste. Os números ficam por conta da ferramenta (contraste mínimo 4,5, alvos de toque de 44 px, nada de rolagem lateral no celular), nunca a olho. Só depois da sua aprovação da leva eu peço a sua autorização de deploy.
- Resposta: Sim (o dono aprova as capturas na hml antes de cada leva; números por ferramenta).

### Eixos cobertos
- Necessidade e valor: o dono esperava a cara de WhatsApp no sistema inteiro (P1, P6).
- Falhas e timeouts: N/A — mudança só visual, sem dependência externa nem dado novo.
- Concorrência e idempotência: N/A — sem escrita nova; a preferência do menu (recolhido ou expandido) é por usuário e sobrescreve o valor anterior.
- Segurança e permissões: nenhuma permissão muda; a escolha do menu não pode vazar entre usuários nem organizações (P3).
- Rollback: imagem anterior, menos de 2 minutos, sem mexer no banco (P5).
