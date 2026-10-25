# Perfil: API Node.js

> **Quando usar:** back-end ou API em Node.js com TypeScript, com PostgreSQL ou MongoDB.

Se o projeto já tem arquitetura, ORM ou convenções próprias, **o que existe prevalece**: aplique deste perfil só o que não conflita e registre a divergência como decisão (D-xx) no Grill.

## Arquitetura

- Monólito modular por domínio até que o design justifique separar serviços (ADR obrigatório para separar).
- Camadas: **Controller** (HTTP, validação, mapeamento de erro) → **Service** (regra de negócio, sem saber de HTTP) → **Repository** (persistência).
- Dependências injetadas no Service (repositórios, clientes externos, relógio) para permitir teste sem rede.
- TypeScript `strict`, sem `any` e sem casts inseguros.

## Entrada e saída

- Toda entrada externa (body, query, params, headers, webhooks, mensagens de fila) validada com **Zod** no Controller, antes da regra de negócio.
- Respostas e erros com formato estável e documentado (OpenAPI quando a API for consumida por terceiros).
- Erros de domínio tipados; o Controller traduz para status HTTP. Nunca devolver stack trace ou mensagem interna ao cliente.
- POST que cria recurso aceita `Idempotency-Key` quando o cliente puder repetir a chamada.

## Resiliência

| Situação | Padrão |
| :-- | :-- |
| Chamada a serviço externo | Timeout explícito (padrão **5 s**), nunca infinito |
| Falha transitória | Retry com backoff exponencial e **jitter**, só em operação idempotente, com limite de tentativas |
| Dependência instável e crítica | Circuit breaker com fallback definido no design |
| Trabalho demorado | Fila/assíncrono com reprocessamento idempotente |

## Dados

- **PostgreSQL** por padrão, com **Prisma** ou **Drizzle**. **MongoDB** com **Mongoose** para dados semiestruturados, logs ou catálogos (registrar o motivo em ADR).
- Migrações versionadas e **compatíveis com rollback** (expandir → migrar → contrair); nunca editar migração já aplicada.
- Transação em operações que alteram mais de uma tabela/coleção.
- Multi-cliente: o identificador do cliente (tenant) vem de fonte confiável (token/sessão), nunca do body, e toda consulta filtra por ele.

## Segurança

- Segredos só por variável de ambiente; `.env` fora do git.
- Autorização checada no Service ou em middleware testado, não só no front-end.
- Consultas parametrizadas; nada de concatenar SQL ou comandos de shell com entrada do usuário.
- Logs estruturados (JSON) sem dados pessoais, senhas ou tokens; mascarar quando inevitável.

## Testes

| Camada | Ferramenta | Regra |
| :-- | :-- | :-- |
| Contrato | Vitest/Jest + schemas Zod | Entrada válida, inválida e limites de cada schema |
| Unitário | Vitest/Jest | Regras do Service com dependências falsas simples; sem banco nem rede |
| Integração | Supertest + banco real (Testcontainers ou Docker Compose de teste) | Rota → Service → banco; mock só de serviços de terceiros |
| Isolamento | Teste de integração | Usuário do cliente A não lê nem altera dado do cliente B |

Use `testFocused` durante o TDD e a suíte completa só no fechamento de cada fatia.

## Ferramentas no Claude Code

- Documentação oficial das bibliotecas por busca na web ou MCP de documentação, quando a decisão depender de versão.
- `/security-review` (comando nativo do Claude Code) na verificação de mudanças de porte L ou que mexam em autenticação, autorização ou dados sensíveis.

## Definition of Done adicional

- Toda rota nova com teste de integração, incluindo caso de erro e de permissão negada.
- Migração testada de ida (e de volta, quando reversível).
- Nenhum segredo, dado pessoal ou token em log, teste ou fixture versionada.
