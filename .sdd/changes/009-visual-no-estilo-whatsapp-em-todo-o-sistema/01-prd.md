# PRD: Visual no estilo WhatsApp em todo o sistema

> Mudança `009-visual-no-estilo-whatsapp-em-todo-o-sistema` · porte L · 2026-10-29
> O QUÊ e o PORQUÊ. Nada de como implementar. Derivado de `00-grill.md`.

## Problema

O autônomo que usa o CRM já vive dentro do WhatsApp. Hoje só a caixa de conversas tem a cara dele
(mudança 004); o resto do sistema (menu, CRM, IA, Análise, Configurações) continua com o visual
herdado do DeskcommCRM, largo e cheio de texto. O dono esperava "o sistema com a cara de WhatsApp"
e não viu essa mudança. O custo de não resolver é o cliente sentir duas aplicações em uma, e o
produto perder a fluidez que justifica vendê-lo para quem não é técnico.

## Objetivos e métricas

- Todas as telas do app do tenant passam a parecer parte do mesmo produto, no padrão de uso do
  WhatsApp, com as cores e o logo de cada marca (D-07).
- Nenhuma funcionalidade, rota, permissão ou dado muda.
- Contraste de texto mínimo de 4,5:1 em todas as telas medidas, nos dois temas.
- Alvos de toque de pelo menos 44 px no celular e nenhuma rolagem lateral da página.
- O dono aprova as capturas de cada leva antes dela ir à produção.

## Personas e cenários

- **Autônomo (dono da conta):** abre o sistema no computador e no celular, atende, vê contatos,
  tarefas e agenda. Quer achar tudo sem treinamento.
- **Atendente convidado:** usa o dia todo a caixa de conversas e as listas; precisa de pouco ruído.
- **Revendedor (white-label):** troca a marca da instalação e espera que o novo visual a respeite.

## Requisitos funcionais

### REQ-001: Menu lateral estreito no computador

Como autônomo, quero um menu lateral de ícones, como o do WhatsApp Web, para ter mais espaço para o
trabalho sem perder a navegação.

- **AC-001.1** Dado um usuário no computador sem preferência salva, quando abre qualquer tela do app, então o menu lateral aparece recolhido, só com ícones.
- **AC-001.2** Dado o menu recolhido, quando o usuário passa o mouse ou foca um ícone pelo teclado, então o nome do destino aparece.
- **AC-001.3** Dado o menu recolhido, quando o usuário aciona o botão de expandir, então o menu mostra ícones e nomes agrupados como hoje, e a escolha continua ao recarregar a página.
- **AC-001.4** Dado dois usuários diferentes no mesmo navegador ou organização, quando cada um escolhe recolhido ou expandido, então a escolha de um não altera a do outro.
- **AC-001.5** Dado qualquer destino que existe hoje no menu, quando o menu está recolhido, então esse destino continua alcançável por ícone, por "Ver tudo" do grupo ou pela paleta ⌘K, sem nenhum destino a menos.
- **AC-001.6** Dado o menu recolhido, quando o item da tela atual está ativo, então ele aparece destacado e anuncia a página atual a leitor de tela.

### REQ-002: Navegação no celular

Como autônomo no celular, quero uma barra de baixo com o essencial para trabalhar com uma mão.

- **AC-002.1** Dado uma tela estreita, quando o app abre, então aparece uma barra fixa embaixo com de 4 a 5 destinos principais e um item "Mais".
- **AC-002.2** Dado a barra de baixo, quando o usuário toca em "Mais", então todos os demais destinos do catálogo aparecem agrupados, sem destino a menos.
- **AC-002.3** Dado qualquer tela no celular, quando a página é medida, então não há rolagem lateral e cada alvo de toque tem no mínimo 44 px.
- **AC-002.4** Dado a barra de baixo, quando o teclado do celular abre num campo de texto, então a barra não cobre o campo.

### REQ-003: Casca global no padrão do WhatsApp

Como cliente, quero cores, tipografia, cantos e cabeçalhos coerentes em todas as telas.

- **AC-003.1** Dado qualquer tela do app do tenant, quando renderizada, então cabeçalho, cantos, espaçamento e tipografia seguem um conjunto único de tokens, sem cor ou tamanho fixo fora dos tokens.
- **AC-003.2** Dado o tema claro e o tema escuro, quando as telas principais são medidas por ferramenta, então todo texto tem contraste de pelo menos 4,5:1.
- **AC-003.3** Dado uma instalação ou organização com marca própria, quando o visual novo é exibido, então as cores e o logo vêm da marca e nenhuma tela usa o verde, o logo ou os ícones do WhatsApp.
- **AC-003.4** Dado a caixa de conversas já reestilizada pela 004, quando a casca nova é aplicada, então ela continua com balões, ✓✓ e o menu "/" funcionando, e se encaixa na casca sem remendo visual.

### REQ-004: Listas lidas como lista de conversa

Como atendente, quero que contatos e tarefas pareçam a lista de conversas, para reconhecer o padrão.

- **AC-004.1** Dado as telas Contatos, Tarefas, Casos, Follow-ups e os cartões da Central, quando exibidas, então cada item aparece como linha com avatar ou ícone, título, prévia e horário ou situação à direita.
- **AC-004.2** Dado uma dessas listas, quando o usuário busca, filtra, ordena, pagina ou age sobre um item, então o resultado é idêntico ao de antes da mudança.
- **AC-004.3** Dado uma lista com muitos itens, quando carregada, então a rolagem continua fluida e a paginação existente é preservada.
- **AC-004.4** Dado uma lista vazia, com erro ou carregando, quando exibida, então os estados vazio, de erro e de carga continuam existindo no estilo novo.

### REQ-005: Telas que mantêm a forma

Como cliente, quero funil e agenda como sempre, só com a cara nova.

- **AC-005.1** Dado o funil em quadro e a agenda em calendário, quando exibidos, então mantêm a forma atual e herdam cores, cantos, tipografia e cabeçalho da casca nova.
- **AC-005.2** Dado as telas de Análise e de Configurações, quando exibidas, então só herdam a casca nova e nenhum comportamento muda.

### REQ-006: Nenhuma funcionalidade muda

Como dono do produto, quero que a mudança seja só visual, para não arriscar o que já funciona.

- **AC-006.1** Dado a suíte de testes existente, quando roda depois da mudança, então os testes de comportamento continuam passando sem terem sido enfraquecidos.
- **AC-006.2** Dado qualquer rota, permissão ou dado, quando comparados antes e depois, então nada foi acrescentado, removido ou alterado.
- **AC-006.3** Dado uma tela nova ou renomeada no menu, quando o CI roda, então a cerca de navegação reprova se algum destino ficar sem porta.

### REQ-007: Entrega em levas e aprovação do dono

Como dono do produto, quero ver as telas antes de ir à produção.

- **AC-007.1** Dado a leva 1 (casca) pronta na homologação, quando o dono recebe capturas lado a lado da tela nova, da antiga e do WhatsApp Web, em claro e escuro, no computador e no celular, então a leva só segue para a produção depois da aprovação dele.
- **AC-007.2** Dado a leva 2 (listas como conversa) pronta na homologação, quando o dono recebe as mesmas capturas, então ela só segue para a produção depois da aprovação dele.
- **AC-007.3** Dado qualquer leva em produção, quando for preciso desfazer, então a volta para a imagem anterior restaura o visual antigo em menos de 2 minutos, sem mexer no banco.

## Requisitos não funcionais

- **Acessibilidade:** foco visível, navegação por teclado no menu recolhido e rótulos para leitor de tela (cobertos por AC-001.2, AC-001.6 e AC-003.2).
- **Desempenho:** a mudança não pode piorar de forma perceptível o carregamento das telas; o build de produção continua dentro do orçamento do `build-and-size`.
- **Marca:** a varredura `branding.test.ts` e a de tokens `tailwind-tokens.test.ts` continuam verdes (AC-003.1, AC-003.3).
- **Textos:** qualquer texto novo (nomes de itens do menu, rótulos) sai em português, inglês e espanhol pelo dicionário existente.

## Fora de escopo

- Qualquer mudança de funcionalidade, de rota, de permissão ou de dado.
- Copiar código da referência visual `ankitrajxd/whatsapp-frontend` (Apache-2.0, só referência de layout).
- Adotar a biblioteca Astryx da Meta (motor de estilo concorrente, temas fixos, versão 0.7).
- Usar verde, logo ou ícones do WhatsApp.
- Opção de visual clássico.
- Reescrever funil, agenda ou gráficos com outra forma.
- Cobrança (003) e canal de e-mail (005), que são mudanças separadas.

## Dependências e riscos

- Telas que dependem da largura do menu antigo (cartões, tabelas largas) podem quebrar no menu estreito. Mitigação: prova pela tela medida em cada leva (REQ-007).
- O menu estreito não pode esconder destino. Mitigação: o catálogo de navegação continua a fonte única (AC-001.5 e AC-006.3).
- Dependência de aprovação do dono a cada leva: sem ela, a leva não vai à produção.
- A confirmar no design: nível exato de mudança da tipografia, e se alguma tela usa cores fora dos tokens.
