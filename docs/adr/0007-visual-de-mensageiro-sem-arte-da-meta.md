# Visual de mensageiro sem arte da Meta

Status: accepted (07/11/2026)

Todo o sistema (todas as telas, inclusive as públicas) segue a linguagem visual do WhatsApp Web, porque é a interface que os clientes já conhecem. Copiamos posições, formas, neutros e densidade, mas a cor de destaque continua vindo da marca e nenhum logo, nome, ícone ou fundo do WhatsApp entra no produto: são arte e marca da Meta, e o produto é vendido sob marcas próprias e de parceiros. O clone `ankitrajxd/whatsapp-frontend` serve só de referência visual; não é instalado nem copiado, porque traz a arte da Meta e uma pilha (Vite, socket.io, zustand) que não é a nossa. Os ícones vêm de bibliotecas abertas (Material Symbols onde o desenho é o mesmo do WhatsApp, Phosphor no resto), sempre pelo mapa único de ícones. O fundo da conversa é bege liso com um padrão próprio discreto, nunca o desenho do WhatsApp. A fonte passa a ser a do sistema (como no WhatsApp Web), no lugar da Atkinson Hyperlegible, com contraste e tamanho mínimo garantidos por teste. Não há chave para voltar ao visual antigo: as funcionalidades não mudam, e a volta é pelo deploy anterior.

## Considered Options

- Copiar os ícones do WhatsApp (o dono pediu de início): recusado pelo risco de marca num produto comercial.
- Paleta verde fixa do WhatsApp: recusada, quebraria as marcas parceiras e a identidade Corretora.io.
- Chave por instalação entre visual antigo e novo: recusada, dobraria o custo de manter dois visuais sem ganho funcional.
