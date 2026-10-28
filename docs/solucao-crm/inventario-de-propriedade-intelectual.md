# Inventário para a refatoração de propriedade intelectual

Este documento é um mapa de trabalho. Ele não é parecer jurídico e não conclui nada sobre
quem é dono de quê perante a lei. O objetivo é que, depois da primeira versão em produção,
quem for refatorar o sistema para que ele seja propriedade intelectual própria do dono
("de forma correta e justa") já tenha em mãos o que é herdado, o que é próprio e onde ainda
há ligação com o projeto de origem.

Data da medição: 28/10/2026, branch `chore/sp8-planejamento`.

## 1. De onde o sistema veio

O SolucaoCRM nasceu de um fork do **DeskcommCRM**, software livre sob a **licença MIT**, criado
por **Rafael Melgaço** (primeiro commit em 28/04/2026). A licença MIT permite usar, copiar,
modificar e distribuir, desde que o aviso de direitos autorais e o texto da licença sejam
mantidos. Esses avisos estão nos arquivos `LICENSE` e `NOTICE` na raiz e no parágrafo "Origem" do
README. Não apague nem altere esses arquivos sem orientação jurídica.

## 2. O que é herdado

A grande maioria do código. Medição por git:

- O repositório tem cerca de 13.400 commits. Os de autores do projeto de origem (Rafael Melgaço,
  `melgarafael`, `webtecnica`, `Pessoa`, `Paulo Lima Jr`, `jmpo`, `Tong-bit-art`, `João Paulo`, o
  robô de releases e outros) são a imensa maioria. Só 124 commits são do dono deste projeto
  (autor "DouglasDeCastroAlmeida" e "Douglas de Castro Almeida"), entre 21/10/2026 e 28/10/2026.
- Dos cerca de 9.000 arquivos versionados hoje, a regra é: **presuma que é herdado**, a menos
  que conste na seção 3.
- Herdado, em linhas gerais: o núcleo do CRM (app Next.js, API `/api/v1`, banco e `baseline.sql`,
  RLS, WhatsApp via WAHA, agentes de IA, MCP, LGPD), o kit de instalação `hostgator-setup-kit/`,
  as doutrinas em `docs/doctrine/`, os PRDs e specs em `docs/prd` e `docs/specs`, a maior parte
  dos testes e os workflows de CI.

## 3. O que é próprio do dono

Fontes de verdade: o histórico git e as pastas da esteira SDD.

- **Mudanças SDD** (pastas em `.sdd/archive/` e `.sdd/changes/`): 001 (fundação, instalação em
  servidor único, CI/CD, backups e isolamento), 002 (marcas, parceiros e domínios), 004 (inbox no
  estilo WhatsApp), 007 (agenda, lembretes e confirmação pelo cliente), 006 (ferramentas do agente,
  MCP e OpenRouter) e 008 (independência do repositório de origem). Estão em `.sdd/archive/`:
  001, 002, 004 e 007; em andamento em `.sdd/changes/`: 003, 005, 006 e 008.
- **`docs/solucao-crm/`**: guias, specs, runbooks, evidências e migração para a nuvem.
- **`.sdd/`** e **`.claude/sdd-esteira`**, **`.claude/commands`**: a esteira de desenvolvimento.
- Código novo medido por "arquivos que o dono criou" (cerca de 300 arquivos ainda existentes):
  `docs/solucao-crm` (35), `tests/infra` (32), `tests/unit` (30), `.sdd/changes` (21),
  `.claude/sdd-esteira` (20), `infra/solucao` (19), `lib/agenda` (11), `lib/brands` (8), além de
  rotas de `app/api` (11) e `lib/auth` (10).

Método e limites da medição: contei commits por nome de autor (`git log --format=%an`) e arquivos
pelo commit que os **criou** (`git log --diff-filter=A`), cruzados com os arquivos que existem hoje
(`git ls-files`). **Não medi**: linhas alteradas pelo dono dentro de arquivos herdados (um arquivo
herdado muito modificado conta como herdado); autoria de trechos copiados; commits feitos com outro
nome ou e-mail do dono; e o que foi renomeado ou movido (a contagem de criação pode contar duas
vezes ou perder um arquivo). Os números servem de ordem de grandeza, não de prova de autoria.

## 4. Pontos de acoplamento remanescentes

A cerca `tests/unit/nada-executa-contra-o-upstream.test.ts` impede que scripts, workflows e
código de produção apontem para o repositório de origem. Ela guarda uma lista de **11 exceções**
que só pode encolher. Cada uma, com a razão:

| # | Arquivo | Razão |
|---|---|---|
| 1 | `.agents/skills/deskcomm-contribuir/scripts/quem-sou.sh` | crédito/identidade do autor original |
| 2 | `.mailmap` | crédito/identidade do autor original |
| 3 | `tests/shell/deskcomm-contribuir.test.sh` | crédito/identidade do autor original |
| 4 | `.agents/skills/deskcomm-contribuir/SKILL.md` | prosa sobre a vitrine/changelog do site do projeto de origem, sem comando |
| 5 | `extensoes/catalogo.json` | dado de catálogo versionado; regenerar com origem própria ficou para depois |
| 6 | `extensoes/loja.json` | idem |
| 7 | `tests/shell/extensao-nao-instala.test.sh` | asserção negativa (prova que o kit NÃO cita o dono do projeto de origem) |
| 8 | `tests/shell/update-guard.test.sh` | asserção negativa |
| 9 | `hostgator-setup-kit/test-validators.sh` | asserção negativa e fixture de crontab de um vizinho |
| 10 | `lib/waha/client.ts` | comentário histórico citando issue do projeto de origem |
| 11 | `tests/setup/vitest.setup.ts` | comentário histórico citando issue do projeto de origem |

Outros acoplamentos que a cerca não cobre: `docs/` e `CHANGELOG.md` (histórico), `triagem/`, e o
fato de `CLAUDE.md` e `AGENTS.md` ainda descreverem o fluxo e as regras do projeto de origem
(ver seção 7).

## 5. Nomes herdados

- Nome do produto: "DeskcommCRM" aparece em prosa, em comentários e em documentos; o domínio
  `deskcomm.com.br` pertence ao projeto de origem.
- Skills dos assistentes (`.agents/skills/` e o espelho `.claude/skills/`): `deskcomm-instalar`,
  `deskcomm-operacao`, `deskcomm-cliente-novo`, `deskcomm-saas`, `deskcomm-metricas`,
  `deskcomm-prompt`, `deskcomm-contribuir`, `deskcomm-extensao`, `deskcomm-doutrina`.
- Prefixos de código e dados: `dsk_` (tokens de API), pacotes e namespaces `deskcomm-*`,
  `DESKCOMM_*` em variáveis, pastas `extensoes/`, imagens e tags publicadas pelo projeto de origem.
- Repositório do dono: `DouglasDeCastroAlmeida/SolucaoCRM`.

Renomear nomes que estão gravados em bancos de clientes (prefixo de token, por exemplo) pode
quebrar instalações existentes: tratar como migração, não como busca e troca.

## 6. Perguntas para orientação jurídica

Nenhuma delas tem resposta neste documento. São para levar a um advogado de propriedade
intelectual.

1. O registro no INPI (programa de computador) é possível para uma obra derivada de software MIT?
   Em nome de quem, e o que exatamente se registra (só o que é do dono, ou o conjunto)?
2. Como manter corretamente o aviso MIT do autor original: basta `LICENSE` e `NOTICE`, ou é
   preciso manter o aviso em cada arquivo ou na tela do produto?
3. Reescrever partes herdadas muda a situação? Existe um critério (por exemplo, reescrita
   independente) que o advogado reconheça, e o que precisa ser documentado?
4. As contribuições de terceiros no projeto de origem (mais de um autor) têm algum termo
   (CLA) ou só a licença MIT?
5. O uso do nome "DeskcommCRM", das skills e do domínio `deskcomm.com.br` exige autorização ou
   troca? Existe marca registrada do projeto de origem?
6. Dá para vender o produto como SaaS ou licenciar para parceiros mantendo o aviso MIT? Quais
   cláusulas contratuais com clientes e parceiros são necessárias?
7. O que foi escrito com ajuda de ferramentas de IA (esteira SDD, código gerado) tem alguma
   exigência de registro ou de declaração de autoria?
8. Dependências de terceiros (WAHA, bibliotecas) têm licenças que limitam a distribuição ou a
   revenda?
9. Que provas de autoria convém guardar desde já (histórico git, datas, documentos)?
10. O que exige consultar advogado antes da refatoração, e o que o dono pode fazer sozinho?

## 7. Conferência de CLAUDE.md e AGENTS.md (T-023)

Nenhuma alteração de doutrina foi feita. Os comandos que o leitor executa (`gh api repos/...`)
já apontam para `DouglasDeCastroAlmeida/SolucaoCRM`. Sobram só links de leitura para o site do
projeto de origem, que não são comandos: `CLAUDE.md` linhas 706 e 771 (guias e changelog da LP) e
`AGENTS.md` linhas 554 e 574. O item 17 de `CLAUDE.md` ainda afirma que o corte confere a página de
changelog da LP; isso deixou de ser verdade na mudança 008. Fica para decisão do dono corrigir
a doutrina.
