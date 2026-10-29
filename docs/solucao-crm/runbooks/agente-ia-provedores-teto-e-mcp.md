# Agente de IA: provedores, teto de custo, modos e servidor MCP externo

Para quem opera a instalação (o dono). Mudança 006. Tudo aqui se faz pela tela, exceto
a chave `MCP_EXTERNO_ADMIN_DA_ORG` (um ajuste no `.env` da VPS) e o desfazer.
Onde nada é ligado, o comportamento de antes continua igual.

Você vai precisar de: entrar como administrador da empresa e, para a seção 5 e o desfazer,
acesso à VPS pelo terminal.

## 1. Chave do OpenRouter e provedor de endereço próprio

Caminho: **Agente de IA** (menu) › **Credenciais** (`/app/ai/credentials`).

1. Clique para adicionar uma credencial e escolha o provedor: **OpenRouter** (um só login
   para vários modelos) ou **endereço próprio** (um servidor de IA seu ou de um gateway).
2. Cole a chave do provedor. Ela é guardada cifrada e depois só aparecem os últimos
   caracteres. Não cole a chave em conversa nenhuma.
3. No endereço próprio, preencha **Endereço (base URL)**, por exemplo
   `https://seu-gateway.example/v1`. **Só `https` vale**: endereço `http://`, rede interna e
   `localhost` são recusados por segurança.
4. Use o botão de teste da credencial. Se o modelo for fraco para atender, a tela avisa.
5. Em cada agente, escolha essa credencial e o modelo.

Se o provedor falhar de um jeito que repetir não resolve (chave revogada, saldo zerado), a
conversa vai na hora para uma pessoa e a Central avisa. Antes ela esperava a recarga por
até 6 horas.

## 2. Teto de custo do mês e aviso de 80%

Caminho: **Agente de IA** › **Uso e orçamento** (`/app/ai/usage`), visível para gerente ou
acima.

- A tela mostra o **Teto do mês** e, por agente e no total, tokens, custo em dólar e a
  **Parte do teto** já usada.
- Ao chegar a **80%**, o administrador é avisado na Central e por e-mail, uma vez por mês.
- Ao chegar a **100%**, o agente para e as conversas vão para uma pessoa.
- Empresas novas já nascem com teto ligado. Empresa antiga que nunca definiu um vê o aviso
  "Esta organização está sem teto de gasto: a IA não para sozinha por gasto". Defina o
  limite e escolha parar ao chegar nele no cartão de orçamento, acima do aviso.
- **Estimado:** modelo sem preço conhecido passa a ser contado por uma estimativa acima do
  provável, e a tela escreve "estimado". Nunca é um preço real. Por isso um agente com
  modelo sem preço pode chegar ao aviso e ao teto antes do que chegava.

## 3. Modos do agente

Caminho: abrir o agente, bloco **Operação do agente**, campo **Modo de operação**.

| Modo | O que faz |
|---|---|
| Assistido: revisar antes de enviar | O agente redige e uma pessoa aprova cada resposta. É o padrão de agente **novo**. |
| Automático: responder com as regras do agente | O agente responde sozinho. |

- Agentes que já existiam **não mudam**.
- Só o **administrador** troca o modo. Ao escolher automático abre o diálogo **Ligar o
  modo automático?**, que avisa que o agente passa a responder sozinho e que o custo vai na
  chave de IA da empresa. Só vale depois de **Confirmar e ligar o automático**. A regra
  também é cobrada no servidor, e a confirmação fica na auditoria.
- **Pausar automático** / **Retomar automático** continua disponível, sem perder a versão
  publicada.

## 4. Servidor MCP externo

Caminho: **Configurações** › **Servidor MCP externo** (`/app/settings/servidor-mcp-externo`).

1. Preencha identificador (letras minúsculas, números e hífen), nome, endereço e chave. O
   endereço é **só `https`**, de servidor público. Clique **Cadastrar e testar**: o sistema
   testa a conexão e lista as ferramentas do servidor.
2. Todas as ferramentas **nascem desligadas**.
3. Abra **Ferramentas** do servidor, escolha o agente e ligue as que quiser. Isso vale para
   o **rascunho** do agente: depois publique a nova versão.
4. Ferramenta de **escrita** (ou que o servidor não declara como só leitura) pede
   aprovação: em modo assistido ela não roda, vira uma ação pendente na Central, com
   botões **Aprovar** e **Recusar** (gerente ou acima).
5. **Pode rodar sem aprovação:** opção por ferramenta, com aviso e o botão **Entendi o
   risco, liberar**. Só tem efeito com o agente no modo **automático** e para ferramenta já
   ligada. Use só se você confia no que a ferramenta faz.
6. **Atualizar ferramentas** refaz a lista. Ferramenta nova entra desligada, e uma
   ferramenta que você já viu nunca vira "só leitura" sozinha.
7. O que o servidor devolve chega ao agente como dado externo, com tamanho limitado. Cada
   chamada espera no máximo 10 segundos e lê no máximo 1 MB. A auditoria guarda só o nome
   dos campos e os tamanhos, nunca os valores.
8. Para o agente usar os servidores durante o atendimento, deixe ligada a opção **Usar o
   servidor de ferramentas externo durante o atendimento** no agente. Os dados do cliente
   da conversa vão a todos os servidores com ferramenta ligada naquele agente.

## 5. Quem pode cadastrar: a chave `MCP_EXTERNO_ADMIN_DA_ORG`

- **Desligada (padrão de fábrica):** só o administrador da **instalação** (você) cadastra e
  mantém servidores. O administrador da empresa não consegue (recebe "Você não tem
  permissão para gerenciar servidores MCP.").
- **Ligada:** o administrador de **cada empresa** cadastra e mantém os servidores da
  **própria** empresa. Você continua podendo. A empresa sempre vem da sessão, nunca do
  formulário.

Para ligar: no `.env` da VPS, ponha `MCP_EXTERNO_ADMIN_DA_ORG=true` e
recrie **só o app** (use os dois arquivos de compose da sua VPS, como em
`docs/runbooks/deploy.md`). Os valores aceitos são `true` e `false`. Para desligar, volte
a `false` e recrie o app. Os servidores já cadastrados continuam existindo.

## 6. Atenção: quem já usa MCP com `http://`

Depois de atualizar, o servidor MCP externo **só aceita `https`** e **não segue
redirecionamento**. Se o seu usa `http://`, ou o endereço redireciona, ele para de
funcionar e a tela diz "O endereço precisa começar com https". Troque o endereço em
**Configurações › Servidor MCP externo** por um `https` direto. Servidor que demora mais de
10 segundos passa a falhar com erro claro. O servidor antigo é copiado para o novo formato
com o identificador `padrao`, sem apagar o formato anterior.

O mesmo vale para o provedor de endereço próprio em Credenciais: `http://` deixa de servir.

## 7. Como desfazer

1. Volte a imagem anterior (a versão anterior do app, do worker e do scheduler) e recrie os
   serviços, como em `docs/runbooks/deploy.md`.
2. **Não é preciso mexer no banco.** A migration 0724 só acrescenta (tabelas e colunas
   novas, sem apagar nada), e o formato antigo do servidor MCP foi preservado como leitura
   de reserva.
3. Confira: `/` responde 200 e `/app` responde 307.

Alternativa sem voltar a imagem: desligue a chave da seção 5 e, na tela, desative o
servidor (**Desativar**) ou volte o agente para **Assistido**.

---

# Roteiro do dono (passo a passo, sem termos técnicos)

Faça nesta ordem. Leva uns 20 minutos.

1. **Entre como administrador** e abra **Agente de IA › Credenciais**. Adicione a chave do
   OpenRouter. Clique em testar. Se aparecer aviso de modelo fraco, escolha outro modelo.
2. Abra **Agente de IA › Uso e orçamento**. Confira que existe um **Teto do mês**. Se vir o
   aviso "sem teto de gasto", defina o limite e escolha parar ao chegar nele. Anote: aos
   80% você recebe aviso; aos 100% o agente para.
3. Abra um agente e veja **Operação do agente**. Deixe em **Assistido** no começo. Quando
   confiar, troque para **Automático** e leia o aviso antes de confirmar.
4. Se usa um sistema de fora (pedidos, ERP): **Configurações › Servidor MCP externo**.
   Endereço tem de começar com `https`. Cadastre, abra **Ferramentas**, ligue só as que o
   agente precisa e publique o agente.
5. Quando o agente quiser fazer uma ação que muda algo no sistema de fora, ela aparece na
   **Central** com **Aprovar** e **Recusar**. Leia e decida.
6. Não use "Pode rodar sem aprovação" no começo.
7. Se algo der errado: volte o agente para **Assistido**, desative o servidor, ou peça para
   voltar a versão anterior (seção 7). Seus dados não se perdem.

Nunca mande chaves por conversa: cole-as só nas telas acima.
