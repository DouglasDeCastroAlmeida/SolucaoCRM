# Delta: navegacao-e-casca

## ADICIONADOS

### Requisito: Menu lateral recolhido por padrão e escolha por usuário

O menu lateral DEVE nascer recolhido (só ícones) para quem não tem preferência salva. A escolha DEVE ser guardada em cookie `sidebar_collapsed_<userId>` (httpOnly, SameSite=Strict), gravado pelo servidor com o `userId` de `auth.getUser()`, e DEVE persistir ao recarregar. O cookie antigo `sidebar_collapsed` (sem usuário) NÃO DEVE mais ser lido, e a escolha de um usuário NÃO DEVE afetar a de outro.

- Cenário: Dado um usuário sem cookie, quando abre qualquer tela do app, então o menu aparece recolhido.
- Cenário: Dado o cookie do usuário com "0", quando recarrega, então o menu aparece expandido.
- Cenário: Dado o cookie de outro usuário no mesmo navegador, quando o primeiro abre o app, então esse cookie é ignorado.
- Cenário: Dado nenhum usuário autenticado, quando a ação de alternar roda, então nada é gravado.

### Requisito: Menu recolhido acessível e sem destino a menos

No menu recolhido o nome de cada destino DEVE aparecer ao passar o mouse e ao focar por teclado, o item ativo DEVE ter `aria-current="page"`, o botão de expandir DEVE estar sempre visível, e todo destino do `NAV_CATALOG` DEVE continuar alcançável (ícone, "Ver tudo" do grupo ou paleta ⌘K). A cerca de navegação DEVE reprovar destino sem porta.

- Cenário: Dado o menu recolhido, quando o foco chega a um ícone, então o nome aparece.
- Cenário: Dado o catálogo de navegação, quando a cerca roda, então o recolhido e a gaveta do celular cobrem todos os destinos.

### Requisito: Barra de baixo e gaveta "Mais" no celular

Em tela estreita DEVE haver barra fixa embaixo com de 4 a 5 destinos e "Mais"; "Mais" DEVE abrir a gaveta com os demais destinos agrupados. Nenhuma tela DEVE ter rolagem lateral, os alvos de toque DEVEM ter ao menos 44 px, e a barra NÃO DEVE cobrir o campo de texto com o teclado aberto.

- Cenário: Dado 390 px de largura, quando a página é medida, então não há rolagem lateral e cada alvo tem 44 px ou mais.
- Cenário: Dado a barra de baixo, quando o usuário toca em "Mais", então todos os demais destinos aparecem agrupados.

### Requisito: Casca por tokens, com contraste e marca própria

Cabeçalho, cantos, espaçamento e tipografia DEVEM vir dos tokens de `app/globals.css`, sem hex novo em componente. Todo texto das telas principais DEVE ter contraste de ao menos 4,5:1 nos temas claro e escuro. Cores e logo DEVEM vir da marca; nenhuma tela DEVE usar verde, logo ou ícones do WhatsApp.

- Cenário: Dado o tema escuro, quando o texto discreto e o sino do cabeçalho são medidos, então passam de 4,5:1.
- Cenário: Dado uma marca própria, quando a casca é exibida, então usa a cor e o logo da marca.
