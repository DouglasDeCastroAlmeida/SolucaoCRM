# Verde de mensageiro fixo em todo o app

Status: accepted (08/11/2026). Substitui a parte do ADR 0007 que dizia que a cor de destaque continua vinda da marca.

A primeira rodada do visual de mensageiro manteve a cor de destaque da marca (na homologação, um verde-oliva apagado; na produção, o verde-azulado da Corretora.io). Na homologação o resultado não lembrava o WhatsApp, e o dono decidiu que o app inteiro usa o **verde de mensageiro**, vivo e da família do verde do WhatsApp, em qualquer marca. A cor escolhida nas telas de Marca passa a valer só para logo, nome, favicon e e-mails. Os códigos de cor são próprios, na mesma família e não os mesmos do WhatsApp, para a trava contra a arte da Meta continuar valendo.

## Considered Options

- Verde de mensageiro só dentro da conversa, marca no resto: recusada, o dono quer "em tudo".
- Verde de mensageiro como padrão, com a marca podendo sobrescrever (a Corretora.io continuaria verde-azulada): recusada, a produção não ficaria com a cara do WhatsApp.
- Manter a cor da marca (decisão do ADR 0007): recusada pelo resultado visto na homologação.

## Consequences

- Os seletores de cor das telas de Marca (instalação, parceiro e empresa) deixam de colorir a interface; marcas de parceiro e de empresa não recolorem o app.
- Os testes de contraste passam a medir uma paleta fixa, não mais cada cor de marca; a derivação de cor por marca e a recusa de cores que reprovam o contraste deixam de ser necessárias na interface.
- O CSS personalizado da tela Marca continua existindo, mas passa a ser a única forma de alterar cores.
- Difícil de reverter: voltar à cor por marca exige refazer a derivação de cor e os testes que ela alimentava.
