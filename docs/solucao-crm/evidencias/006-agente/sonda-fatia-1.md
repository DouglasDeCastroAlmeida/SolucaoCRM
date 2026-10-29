# Sonda real da Fatia 1 (T-001, T-002, T-003) — 2026-10-28

Chave do dono lida de `C:\Users\Douglas\.secrets\openrouter.env` por script local; a chave não foi impressa nem gravada.

## OpenRouter, chat com chamada de ferramenta (AC-009.1)
Pedido: "Quais horários livres amanhã? Use a ferramenta." com uma ferramenta `consultar_horario(dia)`, `tool_choice: auto`.

| Modelo (gratuito) | HTTP | Tempo | Chamou a ferramenta? |
| :-- | :-- | :-- | :-- |
| `nvidia/nemotron-3.5-lightning:free` | 200 | 7,4 s | **Sim**: `consultar_horario {"dia":"sexta-feira"}` |
| `poolside/laguna-s-2.1:free` | 200 | 5,1 s | Não (respondeu sem a ferramenta) |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 200 | 4,2 s | Não (respondeu sem a ferramenta) |

Conclusão: o OpenRouter aceita o formato de ferramentas (OpenAI-compatível) e devolve a chamada. Nem todo modelo gratuito a usa, então a lista de modelos do produto deve marcar os que suportam ferramenta (`supported_parameters` contém `tools`).

## NÃO provado nesta sonda (declarado)
- **Provedor com endereço próprio:** não há credencial nem endereço combinado; fica para a Fatia 2, com teste de contrato.
- **Servidor MCP de terceiros:** o dono não tem um. A prova do protocolo MCP será feita na Fatia 7 contra um servidor de teste local subido pelo próprio teste, o que prova o nosso cliente, não um servidor externo real.

## Decisão (T-002)
Passou no ponto que decide o desenho (ferramentas pelo OpenRouter funcionam). Segue para a Fatia 2.

## ADR-004 (T-003)
Confirmada pelo dono em 2026-10-28 ("aceito"): o cadastro de servidor MCP abre ao administrador da organização, atrás da chave `MCP_EXTERNO_ADMIN_DA_ORG`, desligada de fábrica.
