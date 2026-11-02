# Ligar a cobrança com teste no cartão numa marca (produção)

Roteiro para o dono da instalação. Escrito para quem não é de infraestrutura: cada passo diz
**onde clicar** e **como saber que deu certo**. Nenhuma chave, token ou senha entra neste
documento nem no chat: eles vão só nos campos das telas indicadas.

O que isto faz: numa marca que você escolher, quem se cadastra informa o cartão no Checkout do
Asaas, ganha 7 dias de teste e só é cobrado no fim. Marca com a cobrança **desligada** (o padrão
de toda marca) segue exatamente como antes. O desenho está na mudança
`.sdd/changes/003-billing-com-trial-no-cartao-asaas/` e a cobrança geral da instalação em
[`../saas/cobranca.md`](../saas/cobranca.md).

## 0. Portão de release: leia antes de tudo

**Nenhuma marca liga a cobrança em produção antes de duas coisas estarem feitas e registradas:**

1. A **homologação** provou, com um pagamento de teste real no sandbox do Asaas, passando pela
   nossa tela, que a assinatura é achada pelo `checkoutSession` (o Asaas **não** propaga o
   `externalReference`, provado em 2/11/2026) e que a conta suspensa é reativada com **uma só**
   assinatura. A conferência é a sonda `scripts/sondas/conferir-pagamento-hml.mjs`.
2. O código novo já está **implantado em produção com todas as marcas desligadas** e a sonda de
   produção (passo 9) deu `TUDO PASSOU`.

O interruptor da tela **não consegue** checar o item 1: ele só confere se há plano, chave e
provedor. Quem garante o item 1 é você, olhando o registro da prova (pasta `evidence/003-billing/`).
Sem a prova, não ligue. (Esta prova, a T-040, ainda não foi concluída quando este texto foi escrito.)

## 1. Conta do Asaas de PRODUÇÃO

- A conta de produção precisa ser de **pessoa jurídica (CNPJ)**. Conta de pessoa física limita
  o que o Asaas libera e a nota fiscal de serviço.
- Termine a validação da conta no Asaas (documentos, dados bancários) antes de qualquer coisa.
  Sem conta aprovada, o Checkout em produção recusa.
- A conta de **testes** (sandbox) é outra conta; a chave dela começa com `$aact_hmlg_`. A de
  produção começa com `$aact_prod_`. Nunca misture.

## 2. Chave e aviso de pagamento (webhook)

1. No Asaas: **Integrações › Chaves de API**, gere a chave de produção. Ela aparece uma vez.
2. No DeskcommCRM: **Admin › Sistema** (menu do painel de administração): ligue
   **Recursos opcionais › Cobrança dos seus clientes**. Aparece o item **Cobrança** no menu.
3. **Cobrança › aba Conexão › Provedor: Asaas.** Cole a chave em **Chave de API do Asaas** e
   clique em **Testar e conectar**.
4. Confirme na tela: "Chave conectada" (só os 4 últimos caracteres) e **sem** o selo
   "MODO DE TESTE".
5. O aviso de pagamento (webhook) normalmente é cadastrado sozinho. Para isso o endereço da
   instalação (`NEXT_PUBLIC_APP_URL` no `.env`) precisa ser um **https público com DNS válido**:
   endereço de teste, IP ou domínio que não resolve é recusado. O Asaas ecoa em cada aviso um
   **token de autenticação** (o sistema gera um valor aleatório de **no mínimo 32 caracteres**;
   se você tiver de cadastrar à mão, use também 32 ou mais).
6. Se aparecer o quadro **"Falta um passo: cadastre o aviso de pagamento no Asaas"**, siga-o em
   **Asaas › Integrações › Webhooks › Adicionar**, cole a **URL do aviso** e o **Token de
   autenticação** e marque os eventos listados. O token aparece uma vez: se sair da tela sem
   copiar, conecte de novo.

## 3. Dados fiscais, com o seu contador

O DeskcommCRM **não emite nota fiscal**; emitir é obrigação sua como prestador. Antes de cobrar:

- Combine com o contador o enquadramento, o código do serviço e o município da nota de serviço
  (NFS-e).
- Decida se a nota sai pela emissão do próprio Asaas (configurada no painel dele) ou por fora.
- **Enquanto você não tiver CNPJ/PJ, a nota fiscal é manual e fica por sua conta**: não ligue a
  cobrança para clientes reais sem decidir isso.

## 4. V-3: o que é e como provar

**V-3** é uma dúvida de negócio da mudança: o **prazo padrão em que o Asaas repassa o dinheiro
do cartão** para a sua conta e o **custo de split/subconta** (divisão com parceiros). Não trava o
sistema; afeta o seu **fluxo de caixa** e o que sobra para parceiros.

Como provar (leva alguns minutos, na conta de produção, **por escrito**):

1. Pergunte ao Asaas (chat da conta ou gerente) o prazo de recebimento do cartão no seu plano e as
   tarifas, e se há custo para split ou subcontas.
2. Guarde a resposta (print ou e-mail) fora do repositório, sem dados da conta.
3. Faça a conta: entra 7 dias depois do teste + o prazo do cartão. Não prometa pagamento a
   parceiro antes de o dinheiro cair.

## 5. Texto do direito de arrependimento, com advogado

O cliente que paga pode pedir reembolso em até 7 dias (arrependimento do consumidor). O texto
que aparece na tela de início do teste e nos termos **precisa ser revisado por advogado** antes
de ir ao ar. Peça a ele: o texto do aviso, o prazo, como o cliente pede e em quanto tempo você
devolve. Sem revisão, não ligue.

## 6. Criar o plano e o preço

**Admin › Marcas**, escolha a marca, aba **Cobrança**, bloco **Planos**:

1. Preencha nome, **preço em reais** (ex.: `149,90`), intervalo (mês ou ano) e **dias de teste**
   (7 para o teste padrão; aceita de 0 a 90).
2. Salve e marque **um** plano como **Plano do cadastro**: é o que o novo cliente recebe.
3. O preço mínimo é R$ 5,00.

## 7. Ligar o interruptor

Na mesma aba **Cobrança** da marca, o texto mostra "A cobrança desta marca está desligada."
Clique em **Ligar cobrança**.

- Se faltar algo, a própria tela lista em **"Para ligar, falta:"** (módulo ligado, um plano com
  preço, plano do cadastro, provedor, chave, provedor com teste no cartão). O servidor recusa
  ligar sem isso.
- Depois de ligado, **só cadastros novos** daquela marca passam pelo cartão. Quem já existe
  continua como estava; ninguém é cobrado retroativamente.

## 8. Teste final pela tela (obrigatório)

Antes de divulgar, faça um cadastro de verdade como um leigo, num navegador anônimo, com um
cartão **seu**: criar conta, passar pelo Checkout, ver o aviso de "só será cobrado em DD/MM",
entrar no sistema. Depois cancele pelo painel e peça o reembolso (passo 11) para treinar.

## 9. Conferir com a sonda

A sonda **só lê**. Rode no seu computador, com a chave de **leitura** do banco em variável de
ambiente (nunca no chat nem em arquivo do repositório):

```bash
SONDA_URL_PRODUCAO=https://seu-dominio.com.br \
SONDA_SUPABASE_URL=https://<projeto>.supabase.co \
SONDA_CHAVE_LEITURA=<a chave, só no seu terminal> \
SONDA_LINHA_DE_BASE='{"organizacoes_total":<quantas organizações existiam antes>}' \
node scripts/sondas/sonda-producao-cobranca.mjs
```

- **Antes de ligar qualquer marca** o esperado é `TUDO PASSOU`: `/` 200, `/app` 307, saúde
  respondendo, **nenhuma marca ligada**, nenhuma organização suspensa por cobrança, nenhuma
  assinatura em estado de cobrança, organizações não diminuíram.
- **Depois de ligar** uma marca de propósito, o item B1 (e os de cobrança) passam a **FALHAR de
  propósito**, porque a sonda foi feita para provar o estado "tudo desligado". Ajuste a linha de
  base (`marcas_ligadas`, etc.) para o novo normal.
- Sem a chave de leitura a sonda confere só o site.

## 10. Como DESLIGAR (rollback, menos de 2 minutos)

1. **Admin › Marcas › sua marca › aba Cobrança › Desligar cobrança.** Volta ao comportamento
   anterior para cadastros novos. **Não cancela nem apaga** assinaturas que já existem.
2. Quem já se cadastrou e está **suspenso à espera do primeiro pagamento** continua suspenso:
   resolva caso a caso (concluir o pagamento, ou reativar/isentar pela tela de Cobrança do
   painel).
3. Se o problema for o código, volte a imagem anterior pelo procedimento de
   [`deploy.md`](deploy.md). As migrations da mudança só **acrescentam**; voltar a imagem não
   exige desfazê-las.
4. Depois de qualquer deploy: `/` responde **200** e `/app` responde **307**.

## 11. O que continua manual

- **Reembolso** (arrependimento ou erro): é feito **no painel do Asaas** (cobrança › estornar),
  por você. O sistema registra o pedido, mas não devolve dinheiro sozinho.
- **Nota fiscal**: manual enquanto não houver PJ (e, com PJ, é a emissão do contador ou do
  Asaas), como no passo 3.
- Cancelamento de assinatura antiga ou duplicada no Asaas, se a conferência da hml ou da
  produção achar mais de uma.
