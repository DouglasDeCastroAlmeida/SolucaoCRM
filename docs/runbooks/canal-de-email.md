# Canal de e-mail (caixa IMAP/SMTP em Conexões)

> **RASCUNHO.** Escrito a partir do código e do design da mudança 005, ainda **sem a prova
> pela tela com um servidor de e-mail real** (tarefa T-044). Os passos do Gmail abaixo
> precisam ser conferidos na tela do Google e do CRM antes de este texto virar guia final.

Com o canal de e-mail, quem escreve para a sua caixa aparece como conversa no Inbox, e a sua
equipe responde por lá. É a mesma conversa, só que o cliente fala por e-mail em vez de WhatsApp.

## Antes de começar

- Você precisa ser **administrador** da empresa no CRM.
- A caixa tem de aceitar **IMAP** (leitura) e **SMTP** (envio). Gmail, Outlook, Zoho e a
  maioria das hospedagens aceitam.
- **Nada do passado é importado.** O CRM só traz os e-mails que chegarem **depois** de a
  caixa ser conectada.

## Gmail: criar a senha de app

O Gmail não aceita a sua senha normal em programas de fora. Ele pede uma **senha de app**,
uma senha de 16 letras criada só para o CRM.

1. Entre na sua conta Google (https://myaccount.google.com) e abra **Segurança**.
2. Ligue a **Verificação em duas etapas**, se ainda não estiver ligada. Sem ela, a opção de
   senha de app não aparece.
3. Ainda em Segurança, procure **Senhas de app** (se não achar, use a busca da página).
4. Dê um nome, por exemplo "CRM", e clique em **Criar**.
5. O Google mostra uma senha de 16 letras. **Copie na hora**: ele não mostra de novo.
6. No CRM, vá em **Conexões › E-mail › Conectar uma caixa de e-mail**, escolha **Gmail**,
   informe o seu endereço e cole a senha de app no campo de senha.
7. Clique em **Testar**. O CRM entra na caixa e envia um e-mail de teste para ela. Deu certo?
   Clique em **Conectar**.

Os servidores do Gmail já vêm preenchidos: leitura `imap.gmail.com`, porta 993; envio
`smtp.gmail.com`, porta 465.

Contas de trabalho (Google Workspace) podem ter a senha de app bloqueada pelo administrador do
domínio. Se a opção não aparecer, peça a ele para liberar.

## Outros provedores

Escolha **Outro provedor** e preencha com os dados que o seu provedor informa (procure por
"configuração IMAP e SMTP" no site dele).

| O que | Valor aceito |
|---|---|
| Leitura (IMAP) | porta **993** com SSL/TLS (recomendado) ou **143** com STARTTLS |
| Envio (SMTP) | porta **465** com SSL/TLS ou **587** com STARTTLS |

**Só essas portas.** Outra porta é recusada. O endereço do servidor tem de ser o nome do
servidor (por exemplo `imap.seudominio.com`), nunca um endereço de rede interna. Se o provedor
exigir senha de app (Outlook/Microsoft, Yahoo e outros também pedem), crie-a no painel dele e use
no lugar da senha normal.

## Limites (para a sua conta não ser bloqueada)

- **Teto diário:** 200 e-mails por dia, por caixa (padrão; dá para ajustar em **Configurar**).
  O que passar do teto **não se perde**: fica na fila e sai no dia seguinte. A conversa
  mostra o aviso.
- **Intervalo entre envios:** 30 segundos por padrão (ajustável). O CRM espera esse tempo entre
  um e-mail e outro.
- **Anexos:** a soma dos anexos de uma resposta pode ter até 18 MB (as caixas comuns recusam mais que isso). Acima disso o
  CRM recusa e pede um arquivo menor.
- **Ignorados:** e-mails que o CRM não transforma em conversa (listas, propaganda, avisos
  automáticos) ficam numa lista por **30 dias**, só com remetente e assunto. Dali você pode
  promover um deles a conversa ou marcar o remetente como **não é cliente**.

## Se a senha for recusada

O CRM **para na primeira recusa**, de propósito, para não insistir e bloquear a sua conta:

1. A caixa aparece como **Senha recusada** em Conexões › E-mail.
2. Abre um aviso na **Central** e chega um e-mail para os administradores.
3. A leitura e o envio dessa caixa ficam **parados**; as conversas ficam como estão.
4. Para voltar: clique em **Configurar**, informe a **senha nova** (no Gmail, crie outra senha de
   app) e salve. A caixa retoma **de onde parou**, sem perder nem repetir e-mails.

Também dá para **Pausar** e **Retomar** uma caixa à mão quando quiser.

## Desligar o canal inteiro

Para parar tudo (leitura e envio de todas as caixas) sem apagar nada, ponha no arquivo `.env` da
VPS:

```
EMAIL_CANAL=desligado
```

e reinicie o app e o worker pelo caminho de sempre do `docs/runbooks/deploy.md`. As caixas e as
conversas ficam intactas, e o resto do CRM segue igual. Para ligar de novo, deixe a variável
**vazia** (vazio quer dizer ligado).

## O que o canal de e-mail NÃO faz

- **Não faz campanha em lote.** É só para responder a quem escreveu; usar o canal em campanha é
  recusado.
- **Não inicia conversa com quem nunca escreveu.** Não há "Iniciar conversa" por e-mail: a
  conversa nasce quando a pessoa manda a primeira mensagem.
- **A IA não envia sozinha.** Em e-mail, a IA só **rascunha**; o envio depende de uma pessoa da
  equipe aprovar.
- Não importa o histórico antigo da caixa, e só lê a **caixa de entrada** (não pastas, rótulos ou
  spam).

## A caixa nasce aberta (decisão registrada, ADR-009)

No WhatsApp, o número novo nasce em "pré-liberação" e só conversa com telefones de teste. No
e-mail isso não faz sentido, porque quem escreve não tem telefone, e a IA nunca atenderia
ninguém. Por isso **a caixa de e-mail nasce aberta**. A proteção é outra: a IA só rascunha e o
envio exige aprovação humana. Ainda **não existe** uma lista de remetentes permitidos para
e-mail: a IA pode rascunhar para qualquer remetente. Melhorias previstas para depois: guarda por
remetente e tratamento de mensagens automáticas (`List-Unsubscribe`, `Precedence: bulk`).

## Privacidade (LGPD)

Anonimizar um contato apaga também, na mesma operação, os anexos de e-mail dele (todos, não só o
primeiro) e as linhas dele na lista de ignorados e de "não é cliente". Se o endereço for de um
remetente marcado como "não é cliente" e depois anonimizado, essa marcação some junto: um novo
e-mail dele voltará a ser avaliado como de qualquer remetente desconhecido.
