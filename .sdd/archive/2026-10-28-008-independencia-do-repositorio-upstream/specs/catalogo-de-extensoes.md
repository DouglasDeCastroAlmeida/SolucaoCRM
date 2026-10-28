# Delta: catalogo-de-extensoes

> Mudança 008, REQ-003. O catálogo não consulta servidor de terceiro por padrão.

## ADICIONADOS

### Requisito: Origem do catálogo sem valor padrão

O instalador de extensões (`hostgator-setup-kit/extensao.sh`, variável `EXTENSOES_ORIGEM`) e o gerador (`scripts/gerar-catalogo-de-extensoes.ts`) NÃO DEVEM ter origem padrão. Sem origem informada DEVEM terminar com sucesso, sem nenhuma chamada de rede, avisando em português que não há origem configurada e como informá-la. Com origem informada DEVEM se comportar como antes. Extensão já instalada permanece instalada e funcionando, porque a instalada não depende da origem. `extensoes/catalogo.json` e `extensoes/loja.json` seguem versionados como dado (exceções declaradas na cerca).

- Cenário: Dado `extensao.sh listar` ou `baixar` sem `EXTENSOES_ORIGEM`, quando roda, então sai com 0, não chama `curl` e avisa que falta origem.
- Cenário: Dado `EXTENSOES_ORIGEM` informada, quando roda, então consulta essa origem e devolve erro explicativo se ela for inalcançável.
