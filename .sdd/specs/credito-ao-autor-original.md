# credito-ao-autor-original

## Requisitos

### Requisito: Aviso de copyright e origem do fork preservados

O `LICENSE` DEVE manter o texto MIT e a linha "Copyright (c) 2026 Rafael Melgaço" e acrescentar abaixo dela "Copyright (c) 2026 Douglas de Castro Almeida — modificações". O `NOTICE` na raiz DEVE dizer que o projeto nasceu de um fork do DeskcommCRM sob a licença MIT, nomear autor original e dono das modificações, e NÃO conter URL. O `README.md`, `README.en.md` e `README.es.md` DEVEM ter o parágrafo "Origem" e nenhum comando de instalação que baixe algo do upstream. Vigiado por `tests/unit/credito-ao-autor-original.test.ts`.

- Cenário: Dado o `LICENSE`, quando é lido, então a linha original vem antes da do dono e o texto da permissão MIT está intacto.
- Cenário: Dado o `NOTICE`, quando é lido, então não casa endereço http, github.com nem www.
