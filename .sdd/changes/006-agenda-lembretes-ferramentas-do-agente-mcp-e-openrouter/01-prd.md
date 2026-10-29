# PRD: Agente de IA: provedores, ferramentas e MCP

> Mudança `006-agenda-lembretes-ferramentas-do-agente-mcp-e-openrouter` · porte L · 2026-10-27
> O QUÊ e o PORQUÊ. Nada de como implementar. Derivado de `00-grill.md`.
> O escopo da agenda foi para a mudança 007; esta é só a IA.

## Como ler este PRD (o que já existe e o que é novo)

O motor do agente já existe e já tem partes das proteções. Levantado no código antes de escrever:
- Existe orçamento por organização (`lib/ai/budget/`, tabela `ai_budgets`, com "o que acontece ao chegar no teto"), autonomia e respostas revisadas (migration 0227), rascunho e resposta aprovada (`draft-reply`, `approved-reply`), `handoff` e as ferramentas de agendamento, funil, leads e conhecimento.
- O MCP externo existe como **um servidor por organização** (`lib/mcp/servidor-externo/`, endereço em `settings.mcp_externo`, chave cifrada, tela em Configurações › Servidor MCP externo).
- **Não existem:** provedores OpenRouter e compatíveis com OpenAI (os CHECKs aceitam só Anthropic, OpenAI e Google), vários servidores MCP, escolha de ferramentas por agente, aprovação das ferramentas de escrita do MCP, e o teto de custo obrigatório e visível.

Por isso, cada critério abaixo vale como **comportamento garantido por teste**: onde o código já cumpre, a primeira tarefa é um teste de caracterização que prova (e fixa) o comportamento; onde não cumpre, é o trabalho novo. Nenhum comportamento existente pode regredir.

## Problema

O autônomo paga a própria LLM (decisão D-06), então precisa poder escolher onde comprar: hoje só há três provedores, e os mais baratos e flexíveis (OpenRouter, Groq, modelos locais) ficam de fora. Ao mesmo tempo, dar um agente autônomo a quem não é técnico é arriscado: ele pode gastar a conta da pessoa, responder errado a um cliente ou ser enganado por texto escondido numa resposta de um servidor externo. O custo de errar é financeiro (conta de LLM do cliente), de reputação (resposta errada ao cliente dele) e de segurança (agente usado como porta para a rede interna ou para ações que ninguém aprovou).

## Objetivos e métricas

- Uma pessoa conecta uma chave do OpenRouter e põe o agente para responder em menos de 10 minutos, seguindo o assistente.
- Zero resposta enviada por um agente que a pessoa não ligou ou não autorizou (agente desligado de fábrica).
- Nenhuma organização gasta além do teto sem aviso: aviso em 80% e parada em 100%.
- Zero chave de IA ou credencial de MCP em log, resposta de API, auditoria ou Sentry.
- Zero ação de escrita de servidor MCP externo sem aprovação, a menos que o admin tenha liberado explicitamente.
- Nenhuma regressão: todos os testes atuais do motor do agente continuam verdes.

## Personas e cenários

- **Autônomo/admin da organização:** conecta a chave de IA que comprou, escolhe o modelo, liga o agente em modo "aprovar antes de enviar", acompanha o gasto e, quando confiar, passa ao automático.
- **Atendente:** aprova ou edita as respostas redigidas pelo agente.
- **Admin técnico:** cadastra servidores MCP (um ERP, uma agenda externa), liga só as ferramentas que quer para cada agente.
- **Dono da plataforma:** não paga a LLM de ninguém, mas não pode ter um agente que vire porta de ataque.

## Requisitos funcionais

### REQ-001: Provedores OpenRouter e compatíveis com a API da OpenAI

Como admin, quero usar a LLM que eu escolhi, mesmo que não seja das três atuais.

- **AC-001.1** Dado a tela de chaves de IA, quando o admin escolhe "OpenRouter", então informa só a chave e o modelo, e o endereço do serviço já vem preenchido.
- **AC-001.2** Dado a tela de chaves de IA, quando o admin escolhe "Compatível com OpenAI", então informa endereço base, chave e modelo.
- **AC-001.3** Dado os dados informados, quando o admin clica em "Testar", então o sistema faz uma chamada real ao modelo e mostra sucesso ou a causa em português claro (chave inválida, modelo inexistente, endereço inalcançável, sem saldo).
- **AC-001.4** Dado uma chave salva, quando a tela é exibida, então mostra só os 4 últimos caracteres e a chave nunca volta inteira.
- **AC-001.5** Dado um agente configurado com modelo de um provedor novo, quando atende uma conversa, então redige respostas e chama as ferramentas pelo mesmo caminho dos provedores atuais.
- **AC-001.6** Dado um modelo informado que o provedor não reconhece para chamada de ferramentas, quando o teste roda, então a tela avisa que modelos fracos podem errar as ferramentas, sem impedir o uso.
- **AC-001.7** Dado o provedor de um agente que passa a falhar (chave revogada, saldo zerado), quando o agente tenta responder, então a resposta não sai, a conversa vai para a fila de um humano e a Central avisa o motivo.

### REQ-002: Endereço base seguro

Como dono, quero que o endereço informado pela pessoa nunca alcance a rede interna da VPS.

- **AC-002.1** Dado um endereço base que resolve para loopback, rede local, link-local, endereço de metadata ou faixa reservada, quando o admin tenta salvar ou testar, então o sistema recusa com a causa.
- **AC-002.2** Dado um endereço base `http` sem TLS, quando informado, então é recusado (exceto no ambiente de teste local declarado).
- **AC-002.3** Dado um endereço válido, quando a chamada é feita, então o IP resolvido na validação é o mesmo usado na conexão (sem janela de troca de DNS).
- **AC-002.4** Dado um redirecionamento do serviço para outro endereço, quando recebido, então não é seguido para um destino não validado.

### REQ-003: O agente começa desligado e o automático exige confirmação

Como admin, quero que o agente nunca responda sozinho sem eu ter decidido.

- **AC-003.1** Dado uma organização nova ou um agente novo, quando criado, então nasce sem versão publicada e no modo "aprovar antes de enviar", e nenhuma mensagem é enviada por ele até que um administrador o publique e o ligue. (Ajuste de 2026-10-29, decisão do dono: o texto original dizia "está desligado"; o que de fato impede o envio é a ausência de versão publicada, somada ao modo que só redige.)
- **AC-003.2** Dado um agente que o admin liga, quando ligado pela primeira vez, então o modo é "aprovar antes de enviar": o agente redige e uma pessoa aprova cada resposta.
- **AC-003.3** Dado o modo "aprovar antes de enviar", quando a resposta é redigida, então fica pendente e só sai depois da aprovação de uma pessoa, e se o texto mudar depois de aprovado exige nova aprovação.
- **AC-003.4** Dado a troca para "automático", quando o admin a escolhe, então vê uma tela dizendo que o agente passará a responder sozinho e que o custo vai na chave dele, e só vale após o clique de confirmação.
- **AC-003.5** Dado a confirmação do automático, quando feita, então fica registrada na auditoria com quem, quando e qual agente.
- **AC-003.6** Dado um usuário sem papel de administrador, quando tenta trocar o modo do agente para automático, então a rota recusa. (Ajuste de 2026-10-29, decisão do dono: o texto original dizia "admin ou gerente"; o código e o design exigem só administrador, que é o desenho mais restritivo e o que a doutrina de papéis pede para esta ação.)
- **AC-003.7** Dado um agente desligado depois de ligado, quando desligado, então para de enviar imediatamente e as respostas pendentes permanecem para revisão humana.

### REQ-004: Teto de custo e contador de tokens

Como admin, quero saber o que a IA está gastando e que ela pare antes de estourar.

- **AC-004.1** Dado uma organização com o agente ligado, quando o agente é ativado, então existe um teto de custo configurado (com um valor padrão), nunca "sem teto" silencioso.
- **AC-004.2** Dado o gasto chegando a 80% do teto, quando acontece, então o admin é avisado na Central e por e-mail uma única vez no período.
- **AC-004.3** Dado o gasto chegando a 100% do teto, quando acontece, então o agente para de responder, as conversas pendentes vão para a fila humana e a Central avisa.
- **AC-004.4** Dado a tela de Configurações, quando o admin a abre, então vê tokens usados, custo estimado e teto do período, por agente e total.
- **AC-004.5** Dado um novo período de orçamento, quando começa, então o contador zera e o agente parado por teto volta a responder, se o admin tiver mantido essa escolha.
- **AC-004.6** Dado um provedor que não informa custo, quando o agente usa o modelo, então o contador mostra os tokens e o custo como "estimado", sem inventar preço.

### REQ-005: Transferência para humano

Como cliente final, quero falar com uma pessoa quando a IA não resolve.

- **AC-005.1** Dado o cliente pedir uma pessoa, quando o agente recebe a mensagem, então a conversa é transferida para a fila humana e o agente para de responder nela.
- **AC-005.2** Dado o agente não saber responder com segurança, quando decide, então transfere em vez de inventar.
- **AC-005.3** Dado o modelo errar a chamada de uma ferramenta duas vezes seguidas na mesma conversa, quando acontece, então a conversa é transferida para um humano e o motivo fica registrado.
- **AC-005.4** Dado uma conversa transferida, quando a pessoa a assume, então o histórico e o motivo da transferência aparecem a ela.

### REQ-006: Ferramentas do agente

Como admin, quero que o agente consulte e aja no CRM de forma segura e repetível.

- **AC-006.1** Dado o agente com permissão, quando o cliente pede um horário, então consulta os horários livres e marca, e uma segunda chamada com os mesmos dados não cria um segundo compromisso.
- **AC-006.2** Dado o agente, quando decide mover o contato de etapa, então move para a etapa certa do funil da organização e uma repetição não cria efeito duplicado.
- **AC-006.3** Dado o agente, quando decide criar uma tarefa, então cria uma tarefa vinculada ao contato, e uma repetição não cria uma segunda tarefa igual.
- **AC-006.4** Dado uma pergunta que a base de conhecimento responde, quando o agente a consulta, então a resposta cita a fonte e só usa conteúdo da própria organização.
- **AC-006.5** Dado uma ferramenta chamada com argumentos inválidos, quando executada, então retorna erro claro ao modelo e nada é gravado.
- **AC-006.6** Dado uma ferramenta de qualquer tipo, quando executada, então só atua dentro da organização do agente.

### REQ-007: Servidores MCP externos com escolha de ferramentas

Como admin técnico, quero ligar o agente a sistemas externos escolhendo exatamente o que ele pode fazer.

- **AC-007.1** Dado o cadastro de servidor MCP, quando o admin informa endereço `https` e credencial, então o sistema valida o destino (mesma proteção do REQ-002), testa a conexão e lista as ferramentas do servidor.
- **AC-007.2** Dado um servidor cadastrado, quando suas ferramentas são listadas, então todas nascem desligadas, e o admin liga, por agente, só as que quer.
- **AC-007.3** Dado uma ferramenta que o servidor declara como de escrita ou destrutiva, quando o agente está em "aprovar antes de enviar", então a chamada só roda depois da aprovação de uma pessoa.
- **AC-007.4** Dado o agente em modo automático, quando chama uma ferramenta de escrita, então só roda sem aprovação se o admin marcou "pode rodar sem aprovação" para ela, com aviso na tela; as de leitura rodam sem aprovação.
- **AC-007.5** Dado o texto devolvido pelo servidor, quando entra no contexto do modelo, então vai marcado como dado externo, com tamanho máximo, e não altera permissões nem ferramentas disponíveis.
- **AC-007.6** Dado um servidor lento ou fora do ar, quando o agente chama a ferramenta, então a chamada termina em até 10 segundos com erro claro e o agente segue sem travar a conversa.
- **AC-007.7** Dado uma chamada a servidor externo, quando concluída, então a auditoria registra servidor, ferramenta, argumentos resumidos e resultado resumido, sem a credencial.
- **AC-007.8** Dado a organização com vários servidores cadastrados, quando o agente atende, então enxerga apenas as ferramentas ligadas para ele, de qualquer servidor.
- **AC-007.9** Dado uma organização que já usa o servidor MCP externo atual, quando a mudança é implantada, então o servidor continua funcionando sem ação do admin (migrado como o primeiro servidor, com as ferramentas já em uso mantidas ligadas).

### REQ-008: Segurança dos segredos

- **AC-008.1** Dado a chave de IA ou a credencial de MCP, quando salvas, então ficam cifradas e nunca aparecem em resposta de API, log, auditoria ou Sentry (só os 4 últimos caracteres).
- **AC-008.2** Dado uma resposta de API ou um log do motor examinados nos testes, quando varridos, então não contêm nenhuma chave nem credencial.
- **AC-008.3** Dado qualquer rota mutante nova, quando chamada, então declara requireSupportWrite antes do efeito, valida com Zod, exige o papel certo e gera auditoria.
- **AC-008.4** Dado outra organização, quando tenta ler, usar ou alterar chaves, agentes ou servidores desta, então a RLS e o filtro de organização impedem.

### REQ-009: Prova, compatibilidade e liberação segura

- **AC-009.1** A primeira tarefa da implementação DEVE provar com uma chave real do OpenRouter e um servidor MCP de teste que o chat com ferramentas funciona (sonda), com evidência gravada; antes dela não há código de produção.
- **AC-009.2** A mudança de schema DEVE sair como migration versionada com apêndice idempotente no baseline, funções novas com revoke de PUBLIC e anon, CHECKs ampliados no padrão drop+add e RLS testada entre duas organizações.
- **AC-009.3** A jornada completa (conectar chave, testar, ligar em "aprovar antes de enviar", aprovar uma resposta, estourar o teto, cadastrar MCP, ligar uma ferramenta) DEVE ser provada pela tela em ambiente de homologação com serviços reais.
- **AC-009.4** Dado a produção sem nenhum agente ligado e sem MCP, quando a sonda roda, então o resultado é igual ao de antes e nenhum provedor novo é chamado.
- **AC-009.5** QUANDO textos novos são exibidos o sistema DEVE tirá-los do dicionário em pt-BR, en e es, sem texto fixo de marca.

## Requisitos não funcionais

- **Segurança:** destino de rede validado com IP fixado; TLS; segredos cifrados; retorno de MCP como dado; ferramentas desligadas por padrão; escrita com aprovação.
- **Desempenho:** nenhuma chamada a provedor dentro de transação de banco; prazo por chamada a provedor e a MCP; falha de um provedor não derruba o motor.
- **Observabilidade:** custo, tokens e erros por agente; falha de provedor vira aviso na Central, sem texto livre do cliente.
- **Compatibilidade:** quem usa Anthropic, OpenAI ou Google, ou o MCP externo atual, não vê mudança de comportamento.
- **Idioma e acessibilidade:** pt-BR, en e es pelo dicionário; telas navegáveis por teclado.

## Fora de escopo

- A agenda: lembretes por WhatsApp, confirmação "responda 1" e Google Agenda (mudança 007).
- LLM fornecida pela plataforma com cobrança por token.
- Escolher ou recomendar o "melhor" modelo automaticamente.
- Treinar, ajustar ou hospedar modelos.
- Assistente de conexão padronizado e painel de saúde geral (subprojeto 6), além do mínimo aqui.
- Marketplace ou catálogo público de servidores MCP.
- Mudar o motor de decisão, pacing ou anti-banimento.

## Dependências e riscos

- **Prompt injection** (texto do cliente ou resposta de MCP tentando mandar no agente): mitigado por dado externo marcado, ferramentas desligadas, escrita com aprovação.
- **Modelo fraco** erra ferramentas: aviso na tela e transferência após dois erros.
- **Custo da LLM do cliente:** teto obrigatório, aviso em 80% e parada em 100%.
- **Rede interna via endereço base ou MCP:** mesma proteção estrita do canal de e-mail (mudança 005); o design decide um helper compartilhado.
- **Migração do MCP externo atual** para vários servidores sem quebrar quem usa (AC-007.9).
- **Regressão no motor:** testes atuais como piso e testes de caracterização antes de mexer.
- **Premissa:** OpenRouter e serviços compatíveis seguem o protocolo da OpenAI para chat e ferramentas; a sonda confirma.
- **Dono:** uma chave do OpenRouter (há modelos gratuitos) e um servidor MCP de teste, em `C:\Users\Douglas\.secrets\`, na implementação.
