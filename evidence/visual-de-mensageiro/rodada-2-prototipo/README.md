# Rodada 2, tarefa #115: capturas do protótipo do Inbox

Página: `app/design/inbox/PrototipoDoInbox.tsx` (rota pública `/design/inbox`, noindex, só dados de exemplo; não toca o Inbox real). Capturas geradas renderizando o componente com o CSS compilado do projeto (`app/globals.css`, tokens do ADR 0008) no Chromium do Playwright, a 1440x900 (computador) e 390x844 (celular). Estas imagens esperam a aprovação do dono; a tarefa #116 em diante só começa depois dela.

As quatro principais:

- `evidence/visual-de-mensageiro/rodada-2-prototipo/inbox-prototipo-computador-claro.png`
- `evidence/visual-de-mensageiro/rodada-2-prototipo/inbox-prototipo-computador-escuro.png`
- `evidence/visual-de-mensageiro/rodada-2-prototipo/inbox-prototipo-celular-claro.png`
- `evidence/visual-de-mensageiro/rodada-2-prototipo/inbox-prototipo-celular-escuro.png`

Variantes:

- Painel "Dados do contato" aberto: `evidence/visual-de-mensageiro/rodada-2-prototipo/inbox-prototipo-computador-claro-painel.png` e `evidence/visual-de-mensageiro/rodada-2-prototipo/inbox-prototipo-computador-escuro-painel.png`
- Menu "Mais ações" aberto: `evidence/visual-de-mensageiro/rodada-2-prototipo/inbox-prototipo-computador-claro-menu.png` e `evidence/visual-de-mensageiro/rodada-2-prototipo/inbox-prototipo-computador-escuro-menu.png`
- Celular, lista de conversas: `evidence/visual-de-mensageiro/rodada-2-prototipo/inbox-prototipo-celular-claro-lista.png` e `evidence/visual-de-mensageiro/rodada-2-prototipo/inbox-prototipo-celular-escuro-lista.png`
- Celular, dados do contato: `evidence/visual-de-mensageiro/rodada-2-prototipo/inbox-prototipo-celular-claro-contato.png` e `evidence/visual-de-mensageiro/rodada-2-prototipo/inbox-prototipo-celular-escuro-contato.png`

Não provado: a rota `/design/inbox` servida por `next dev` (não sobe nesta máquina com a junction de `node_modules`); a página foi renderizada por `react-dom/server` e o teste unitário cobre a forma.
