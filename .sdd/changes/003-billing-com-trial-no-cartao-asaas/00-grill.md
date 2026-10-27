# Grill: Billing com trial no cartão (Asaas)

> Mudança `003-billing-com-trial-no-cartao-asaas` · porte L · 2026-10-27
> Interrogatório técnico antes de qualquer requisito ou código. Uma pergunta por vez, sempre com
> uma resposta recomendada. O que o código responde, o agente descobre sozinho em vez de perguntar.

## Pedido original

Usuário: "Tudo certo com Subprocesso1? Se sim, vamos para o 2." Subprojeto 2 da seção 12 da spec `docs/solucao-crm/specs/2026-10-21-crm-autonomos-design.md`: **Billing com trial no cartão (Asaas)**, porte L, depende do 1 (concluído). Escopo: seção 6 da spec (fluxo do trial, planos e preços, estados da conta, confiabilidade) e decisões D-07 e D-12. Validações V-1, V-2 e V-3 a resolver aqui.

## Contexto levantado no código

- O fork JÁ tem a "cobrança do revendedor" (spec `docs/superpowers/specs/2026-09-29-cobranca-do-revendedor-design.md`): `lib/cobranca/**` (estado, régua, avisos, prorata, sincronizar, rodada, painel, checkout), adaptadores `lib/cobranca/provedores/{asaas,stripe}.ts` atrás do contrato `contrato.ts` (iniciarAssinatura com `trialAte`, trocarPlano, ajuste proporcional, verificarWebhook, lerSituacao, cancelarNoFim), tabelas `cobranca_planos` (da instalação, sem organization_id) e `cobranca_assinaturas` (uma por organização), estados da assinatura (trial, ativa, em_atraso, cancelada) e "suspensa" única para dois motivos.
- O adaptador do Asaas já manda `nextDueDate` = fim do teste (`lib/cobranca/provedores/asaas.ts:493-504`), mas o desenho atual é por INSTALAÇÃO (um conjunto de planos e uma chave), não por MARCA.
- A SP1 entregou `brand_plans` (planos por marca) e `organizations.brand_id`; o plano inicial por marca (AC-005.3) ficou como dívida para cá.
- A spec 6 pede: Checkout hospedado do Asaas com cartão validado sem cobrança e 1ª cobrança em D+7, avisos nos dias 5 e 6, NFS-e, mensal/anual/2 anos, pró-rata, um trial por CPF/CNPJ por marca, estados em_teste→ativa→pagamento_atrasado→suspensa→cancelada, webhook em `event_log` e rotina diária de conciliação.
- Ainda NÃO levantado (fazer antes do PRD): quanto do fluxo 6.1 o código atual já cumpre (cartão exigido no cadastro? aviso D5/D6? NFS-e? plano de 2 anos? um trial por documento por marca?).

## Perguntas e respostas

### P1. De quem é a conta do Asaas: uma da plataforma para todas as marcas, ou uma por marca?
- Recomendação do agente: **uma conta Asaas da plataforma, com uma chave só, atendendo todas as marcas** neste subprojeto. É o que o código atual já faz (uma chave por instalação), é a decisão D-07 (split e subcontas ficam para quando houver repasse a parceiros) e evita guardar uma chave por marca. O dinheiro cai todo na sua conta e a divisão com parceiros vem depois. A marca só muda o que a pessoa vê (nome, planos, preços), não quem recebe.
- Resposta: aceita a recomendação

### P2. O plano de 2 anos (cobrança única, renovação pelo nosso agendador) entra neste subprojeto?
- Recomendação do agente: **não; fica para depois do lançamento**. Mensal e anual usam a assinatura recorrente do Asaas, que o código já sabe criar, trocar e cancelar. O de 2 anos é outro mecanismo (cobrança única à vista ou parcelada, um agendador nosso para renovar, taxa maior no parcelado, reembolso diferente) e dobraria o risco de um subprojeto que já mexe em dinheiro. Para quem é autônomo, o anual com 2 meses grátis já cobre o desconto por prazo longo.
- Resposta: aceita a recomendação

### P3. Como provamos V-1 e V-2 (o Checkout do Asaas aceita a 1ª cobrança em D+7 e o ciclo anual)?
- Recomendação do agente: **testar no sandbox do Asaas, antes de escrever o PRD**, com uma conta de testes sua. Você cria a conta no sandbox (é grátis e sem dinheiro de verdade), gera a chave e salva em `C:\Users\Douglas\.secrets\asaas-sandbox.env` (nunca no chat); eu uso o arquivo para criar um checkout de teste com cobrança em D+7 e outro anual, e registro o resultado. Se o Asaas não aceitar, o plano B da spec (tokenização própria) muda o tamanho do subprojeto, e é melhor saber isso antes de escrever requisitos. Eu te dou os cliques exatos da conta sandbox.
- Resposta: aceita a recomendação, com ajuste: o dono não consegue criar as credenciais do sandbox agora (planejamento remoto). A prova de V-1/V-2 vira a **primeira tarefa da implementação** (sonda no sandbox, sem código de produção antes dela), com as credenciais fornecidas pelo dono nessa etapa. O PRD e o design assumem que V-1/V-2 passam e registram o plano B (tokenização própria) como risco; se a sonda falhar, a esteira para e volta ao design.

### P4. O que acontece com as contas que já existem e com as marcas que não vão cobrar?
- Recomendação do agente: **a cobrança é ligada por marca, com a chave desligada por padrão** (`brands.cobranca_ligada`, default falso). Marca com a chave desligada se comporta exatamente como hoje: sem checkout, sem trial, sem suspensão. As organizações que já existem (a sua, na produção e na homologação) ficam como **cortesia** (sem cobrança, nunca suspensas) até você decidir o contrário pela tela. Só cadastros novos, por uma marca com a cobrança ligada, passam pelo fluxo do trial. Isso protege a produção atual e dá o desligamento em menos de 2 minutos: desligar a chave da marca devolve o comportamento de antes, sem mexer em dados.
- Resposta: aceita a recomendação

### P5. A nota fiscal (NFS-e) fica por conta do Asaas, sem lógica fiscal nossa?
- Recomendação do agente: **sim**. O Asaas emite a NFS-e quando o pagamento é confirmado, desde que a conta dele tenha os dados fiscais da empresa (inscrição municipal, serviço, alíquota). Nosso código só garante que a cobrança é criada pedindo a nota e mostra o link da nota ao cliente quando existir; não calculamos imposto nem emitimos nada. A configuração fiscal é um passo seu, com seu contador, e entra no roteiro de implantação (não bloqueia o código; sem ela a cobrança funciona e a nota não sai). Se o Asaas recusar emitir para algum município, o fluxo de pagamento não pode travar por isso.
- Resposta: aceita a recomendação

### P6. O reembolso de arrependimento (7 dias após a 1ª cobrança) é automático ou manual?
- Recomendação do agente: **manual, com pedido registrado pelo app**. O cliente pede pela tela de cobrança (botão "Pedir reembolso", visível só nos 7 dias após a primeira cobrança paga); o pedido vira um item na Central da plataforma e uma linha de auditoria, e a conta passa a cancelada. Quem devolve o dinheiro é você, no painel do Asaas, em um clique. Reembolso automático por API é fácil de errar (devolver valor errado, devolver duas vezes) e, com poucos clientes no início, o manual é seguro e barato. O prazo legal e o texto exato a confirmar com um advogado, como já diz a spec.
- Resposta: aceita a recomendação

Respondidas pelo código e pela spec, sem perguntar:

### P7. Webhook duplicado, fora de ordem ou perdido: como a conta não fica errada?
- Fonte: `lib/cobranca/estado.ts` — o estado vem da RELEITURA no provedor, nunca do corpo do webhook; a dívida é monotônica e o período pago nunca é apagado por leitura nula. `lib/cobranca/provedores/asaas.ts` — verificação do webhook em tempo constante e POST idempotente por releitura antes de criar. Spec 6.4 pede ainda rotina diária de conciliação (`lib/cobranca/sincronizar.ts` e `rodada.ts` já existem; a tarefa é conferir que cobre o trial com cartão).

### P8. O cartão passa pelo nosso servidor?
- Fonte: decisão D-12 da spec — não: Checkout hospedado do Asaas. Nenhum campo de cartão em tela nossa, nenhum dado de cartão no banco, em log ou no Sentry. O adaptador já proíbe chave e `description` do pagador em log e erro (cabeçalho de `asaas.ts`).

### P9. Quem define preços e limites dos planos?
- Fonte: spec 6.2 — "configuráveis por marca"; a SP1 entregou `brand_plans` e o painel `/admin/marcas`. Nenhum preço é gravado no código nem em migration: o dono define no painel antes de ligar `cobranca_ligada` na marca. Solo, Pro e Equipe são os nomes e a ordem dos limites (1, até 3, vários usuários).

## Decisões

- **D-01** Uma conta Asaas da plataforma, uma chave, atendendo todas as marcas; split e subcontas ficam para quando houver repasse a parceiros (D-07).
- **D-02** Planos mensal e anual, em assinatura recorrente do Asaas. O plano de 2 anos fica fora (depois do lançamento).
- **D-03** V-1 e V-2 (1ª cobrança em D+7 e ciclo anual no Checkout) são provadas numa sonda no sandbox do Asaas, que é a **primeira tarefa da implementação**, com credenciais fornecidas pelo dono nessa etapa. Falhou: a esteira para e volta ao design (plano B: tokenização própria).
- **D-04** Cobrança ligada por marca com a chave `brands.cobranca_ligada`, desligada por padrão. Desligada, o comportamento é o de hoje. Desligar devolve o comportamento anterior em menos de 2 minutos, sem mexer em dados.
- **D-05** Organizações que já existem ficam como cortesia (nunca cobradas nem suspensas) até o dono decidir pela tela. Só cadastros novos por marca com a cobrança ligada passam pelo trial.
- **D-06** NFS-e é do Asaas: a cobrança pede a nota, o app mostra o link quando existir, nenhuma lógica fiscal nossa e nenhum pagamento travado por falha de nota. A configuração fiscal é passo do dono no roteiro de implantação.
- **D-07** Reembolso de arrependimento manual: botão "Pedir reembolso" nos 7 dias após a 1ª cobrança paga cria item na Central e auditoria e cancela a conta; o dinheiro é devolvido pelo dono no painel do Asaas.
- **D-08** Reaproveitar `lib/cobranca/**` e o contrato de provedor; estender, não reescrever. O trial com cartão e cobrança automática entra como modo novo no contrato.
- **D-09** Fluxo do trial e estados da conta conforme a seção 6 da spec (7 dias, avisos nos dias 5 e 6, 3 dias de tolerância no atraso, suspensa em somente leitura, cancelada com dados mantidos 90 dias). Um trial por CPF/CNPJ por marca.
- **D-10** O plano inicial por marca (dívida AC-005.3 da SP1) entra aqui: o cadastro por uma marca com cobrança ligada cria a assinatura no plano escolhido.

## Fora de escopo

- Plano de 2 anos e qualquer cobrança única parcelada.
- Split, subcontas e repasse a parceiros.
- Reembolso automático por API.
- Cálculo ou emissão própria de nota fiscal e a configuração fiscal da conta Asaas.
- Tokenização própria de cartão (só se a sonda V-1/V-2 falhar, e então volta ao design).
- Stripe e outros provedores (o adaptador existente fica como está).
- Cobrança por uso de IA ou de tokens (a LLM é do cliente, D-06 da spec).

## Riscos e premissas

- **Premissa:** o Checkout do Asaas aceita a 1ª cobrança em D+7 e o ciclo anual (V-1 e V-2). Não provada ainda; a sonda é a primeira tarefa da implementação.
- **Risco:** V-1 ou V-2 falhar muda o tamanho do subprojeto (tokenização própria, PCI). Mitigação: sonda antes de qualquer código de produção.
- **Premissa:** o prazo de recebimento do cartão e o custo de split (V-3) só afetam fluxo de caixa e parceiros; registrados no roteiro, sem bloquear o código.
- **Risco:** a conta Asaas sem dados fiscais não emite nota. Mitigação: passo do dono no roteiro; o pagamento não depende dela.
- **Risco:** conta existente cobrada por engano. Mitigação: cortesia por padrão e chave por marca desligada (D-04, D-05), com teste de regressão.
- **Premissa:** o dono define preços e limites no painel antes de ligar a cobrança da marca.
- **Dependência do dono:** credenciais do sandbox (arquivo em `C:\Users\Douglas\.secrets\`) na implementação, e a conta Asaas de produção mais o contador para a parte fiscal antes de cobrar de verdade.
