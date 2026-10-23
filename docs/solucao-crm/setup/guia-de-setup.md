# Guia de setup: contas, chaves e acessos

Este guia lista **tudo** o que precisa existir fora do código (contas, chaves de API, SSH,
DNS), com o passo a passo de cada lugar. Foi escrito para quem não é da área de infraestrutura.

> **Regras de ouro para segredos (senhas, chaves, tokens)**
> 1. Guarde tudo num **gerenciador de senhas** (Bitwarden gratuito, 1Password etc.). Crie uma
>    pasta "SolucaoCRM".
> 2. **Nunca** cole um segredo no chat do Claude, em issue ou em commit. Os segredos vão em dois
>    lugares só: os **Secrets do GitHub** e o arquivo **`.env` dentro da VPS**.
> 3. Se um segredo vazar, **revogue e gere outro** no painel de origem.
>
> **Os nomes de menus podem mudar** nos painéis. Se um botão não estiver com o nome exato
> abaixo, procure pelo termo parecido. Na dúvida, mande um print ao Claude Code **sem
> nenhuma chave visível**.

## Pré-requisitos do negócio (antes de tudo)
- [ ] **CNPJ**: necessário para conta PJ no Asaas, emissão de NFS-e e contas de desenvolvedor de empresa nas lojas.
- [ ] **Domínio principal** registrado (ex.: no Registro.br ou na própria Hostinger).
- [ ] **Termos de uso** e **Política de privacidade** publicados em páginas do seu domínio. São exigidos pelo Google (verificação do app), pelas lojas de apps e pela LGPD. Peça revisão a um advogado.

## Ordem sugerida
| Etapa | O quê | Quando |
|---|---|---|
| 1 | GitHub | Antes de abrir o Claude Code |
| 2 | Hostinger (snapshot, SSH, limpeza) | Antes do subprojeto 0 |
| 3 | Domínio e DNS | Antes do subprojeto 0 |
| 4 | Supabase (homologação) | Subprojeto 0 |
| 5 | Backup externo (R2 ou B2) | Subprojeto 0 |
| 6 | Resend (e-mail transacional) | Subprojeto 0 |
| 7 | Sentry e monitor de disponibilidade | Subprojeto 0 |
| 8 | Asaas | Subprojeto 2 |
| 9 | Google Cloud (Agenda) | Subprojeto 5 |
| 10 | Contas mobile (Expo, Apple, Google Play) | Comece o D-U-N-S já; o resto no subprojeto 7 |

---

## 1. GitHub

### 1.1 Repositório privado a partir do DeskcommCRM
> **Atenção:** um fork comum de um repositório público **continua público** no GitHub, e não dá
> para torná-lo privado. Como o seu produto é comercial, o caminho certo é criar um **repositório
> privado com uma cópia do código** e manter o original como "upstream" para puxar atualizações.
> A licença MIT permite isso; o arquivo `LICENSE` original deve ser mantido.

1. Entre em https://github.com e faça login.
2. Clique no **+** (canto superior direito) → **New repository**.
3. Nome: `solucao-crm` (ou o que preferir). Marque **Private**. **Não** marque "Add a README".
4. Clique em **Create repository**.
5. A cópia do código do DeskcommCRM para dentro dele será feita pelo **Claude Code** no
   subprojeto 0, com estes comandos (para referência):
   ```bash
   git clone --bare https://github.com/melgarafael/DeskcommCRM.git
   cd DeskcommCRM.git
   git push --mirror https://github.com/<seu-usuario>/solucao-crm.git
   cd .. && rm -rf DeskcommCRM.git
   git clone https://github.com/<seu-usuario>/solucao-crm.git
   cd solucao-crm
   git remote add upstream https://github.com/melgarafael/DeskcommCRM.git
   ```

### 1.2 Login do GitHub na VPS (para o Claude Code)
No terminal da VPS (com o usuário em que o Claude Code roda):
```bash
gh auth login
```
Responda: **GitHub.com** → **HTTPS** → **Login with a web browser**. Ele mostra um código;
abra o link no navegador do seu computador, cole o código e autorize. O Claude Code passa a
usar essa sessão. Você nunca precisa digitar senha para ele.

### 1.3 Proteção da `main`
1. No repositório: **Settings** → **Branches** (ou **Rules → Rulesets**) → **Add rule** para `main`.
2. Marque: **Require a pull request before merging** e **Require status checks to pass**
   (os checks aparecem na lista depois do primeiro PR com CI; volte aqui para marcá-los).

### 1.4 Ambientes de deploy
1. **Settings** → **Environments** → **New environment** → `homologacao` → **Configure**.
2. Repita para `producao` e, nele, marque **Required reviewers** e adicione você mesmo.
   Isso cria o botão "Aprovar deploy em produção".

### 1.5 Secrets
**Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | De onde vem | Etapa |
|---|---|---|
| `SSH_HOST` | IP da VPS (painel Hostinger) | 2 |
| `SSH_PORT` | Porta SSH (normalmente 22) | 2 |
| `SSH_USER` | `deploy` (criado na etapa 2) | 2 |
| `SSH_PRIVATE_KEY` | Chave privada de deploy (etapa 2.4) | 2 |
| `EXPO_TOKEN` | Expo (etapa 10) | 10 |

O registro de imagens (GHCR) usa o `GITHUB_TOKEN` automático, sem configurar nada.
As demais chaves (Asaas, Google, Resend etc.) ficam no `.env` da VPS, não no GitHub.

---

## 2. Hostinger (VPS KVM4)

### 2.1 Snapshot antes de qualquer mudança
1. https://hpanel.hostinger.com → **VPS** → selecione o servidor.
2. Menu **Snapshots e backups** → **Criar snapshot**. Aguarde concluir.
   (A Hostinger mantém um snapshot por vez; um novo substitui o anterior.)

### 2.2 Remover os projetos antigos
Você combinou de pedir isso ao Claude Code. Para fazer pelo painel:
**VPS** → **Docker Manager** (Projetos Docker) → no projeto `botimobiliario`, clique em **⋮**
→ **Excluir**. Repita para `evo-crm-community`. **Mantenha o `vava`.**
Depois, peça ao Claude Code para limpar imagens e volumes órfãos (`docker system prune`),
**conferindo antes** que nenhum volume do `vava` será apagado.

### 2.3 Firewall
**VPS** → **Segurança** → **Firewall** → crie uma regra que permita apenas:
- **22** (SSH), **80** (HTTP) e **443** (HTTPS) para entrada.
Todo o resto bloqueado. O painel do Supabase **não** deve ficar exposto na internet; o kit
do DeskcommCRM o deixa acessível só por túnel.

### 2.4 Chaves SSH e usuários
São dois usuários, para separar responsabilidades:
- `deploy`: usado só pelo GitHub Actions para publicar. Tem acesso ao Docker de produção.
- o usuário do **Claude Code** (de desenvolvimento): **sem** acesso aos arquivos e ao Docker de produção.

**a) Gerar a chave de deploy no seu computador (Windows, PowerShell):**
```powershell
ssh-keygen -t ed25519 -C "deploy-solucao-crm" -f $HOME\.ssh\deploy_solucao_crm
```
Aperte Enter quando pedir senha (deixe vazia; é uma chave de máquina). São gerados dois
arquivos: `deploy_solucao_crm` (**privada**, vai no secret `SSH_PRIVATE_KEY`) e
`deploy_solucao_crm.pub` (**pública**, vai na VPS).

**b) Criar o usuário `deploy` na VPS** (peça ao Claude Code ou rode como root):
```bash
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
nano /home/deploy/.ssh/authorized_keys   # cole o conteúdo do .pub e salve (Ctrl+O, Enter, Ctrl+X)
chmod 600 /home/deploy/.ssh/authorized_keys && chown -R deploy:deploy /home/deploy/.ssh
```

**c) Copiar a chave privada para o GitHub:**
```powershell
Get-Content $HOME\.ssh\deploy_solucao_crm | Set-Clipboard
```
Cole no secret `SSH_PRIVATE_KEY` (etapa 1.5). Depois, limpe a área de transferência.

### 2.5 Isolamento do Claude Code
Peça ao Claude Code, no subprojeto 0, para:
- garantir que o usuário dele **não** está no grupo `docker` de produção nem tem acesso a `/opt/crm-prod`;
- aplicar limites de CPU e memória aos containers de produção no Compose.

---

## 3. Domínio e DNS

No painel onde o domínio está registrado (Registro.br → **DNS**; Hostinger → **Domínios → DNS / Nameservers**):

| Tipo | Nome | Valor | Para quê |
|---|---|---|---|
| A | `@` | IP da VPS | Domínio principal |
| A | `*` | IP da VPS | Subdomínios das marcas (`corretor.seudominio.com.br`) |
| A | `hml` | IP da VPS | Homologação (`hml.seudominio.com.br`) |

A propagação leva de minutos a algumas horas. Teste no PowerShell: `nslookup corretor.seudominio.com.br`.
O valor deve ser o IP da VPS.

**Domínio próprio de uma marca** (ex.: `corretorcrm.com.br`), quando você criar uma: registro
**A** `@` apontando para o IP da VPS, e cadastrar o domínio no painel da plataforma. O HTTPS é
emitido sozinho.

---

## 4. Supabase

### 4.1 Produção (self-hosted, na VPS)
Não há nada a criar manualmente: o instalador single-server do DeskcommCRM sobe o Supabase e
**gera todas as chaves**. O Claude Code conduz isso no subprojeto 0. Ao final, guarde no
gerenciador de senhas a senha do painel do Supabase e do admin do CRM que o instalador mostrar.

### 4.2 Homologação (Supabase Cloud, gratuito)
1. https://supabase.com → **Start your project** → entre com o GitHub.
2. **New project** → nome `solucao-crm-hml` → defina uma **senha do banco** (guarde) →
   região **South America (São Paulo)** → plano **Free** → **Create**.
3. Quando terminar, vá em **Project Settings**:
   - **API**: copie **Project URL**, **anon key** e **service_role key**.
   - **Database → Connection string**: copie a do **Session pooler**.
4. Esses valores vão no `.env` de homologação na VPS (o Claude Code indica onde).
   A `service_role key` é um segredo forte: **nunca** no front-end, em issue ou em chat.

Observação: no plano Free o projeto é **pausado após 1 semana sem uso**. Basta reativá-lo pelo painel.

---

## 5. Backup externo (escolha um)

### Opção A: Cloudflare R2
1. https://dash.cloudflare.com → crie a conta → menu **R2 Object Storage**.
   (O R2 pode pedir um cartão cadastrado mesmo para usar a faixa gratuita.)
2. **Create bucket** → nome `solucao-crm-backups` → região automática.
3. **Manage R2 API Tokens** → **Create API token** → permissão **Object Read & Write**,
   restrita ao bucket `solucao-crm-backups`.
4. Copie **Access Key ID**, **Secret Access Key** e o **endpoint** (S3 API). Vão no `.env` da VPS.

### Opção B: Backblaze B2
1. https://www.backblaze.com → **B2 Cloud Storage** → crie a conta.
2. **Buckets → Create a Bucket** → `solucao-crm-backups` → **Private**.
3. **Application Keys → Add a New Application Key** → acesso só a esse bucket, Read and Write.
4. Copie **keyID**, **applicationKey** e o **endpoint S3**.

Depois do setup, peça ao Claude Code para **testar uma restauração** a partir do bucket. Backup
que nunca foi restaurado não é garantia.

---

## 6. Resend (e-mails do sistema: confirmação, recuperação de senha, avisos de cobrança)
1. https://resend.com → crie a conta.
2. **Domains → Add Domain** → use um subdomínio, ex.: `mail.seudominio.com.br`.
3. O Resend mostra registros DNS (SPF, DKIM e um MX de retorno). Crie **exatamente** esses
   registros no seu DNS (etapa 3). Recomendado: também um registro **DMARC** (o Resend sugere o valor).
4. Aguarde o status **Verified**.
5. **API Keys → Create API Key** → permissão **Sending access** → copie. Vai no `.env` da VPS.

Para marcas com domínio próprio, repita os passos 2 a 4 com o domínio da marca, quando quiser
que os e-mails saiam dele.

---

## 7. Monitoramento

### 7.1 Sentry (erros)
1. https://sentry.io → crie a conta → **Create Project** → plataforma **Next.js**.
2. Copie o **DSN**. Vai no `.env` da VPS como `SENTRY_DSN`.

### 7.2 Monitor de disponibilidade (ex.: UptimeRobot, plano gratuito)
1. https://uptimerobot.com → crie a conta → **New monitor** → tipo **HTTP(s)**.
2. URL: `https://seudominio.com.br/api/v1/health` → intervalo de 5 minutos.
3. Instale o app do UptimeRobot no celular para receber o alerta quando o sistema cair.
4. Repita para `https://hml.seudominio.com.br/api/v1/health` (opcional).

---

## 8. Asaas (cobrança e NFS-e)

### 8.1 Contas
1. **Produção:** https://www.asaas.com → **Criar conta** → **Pessoa Jurídica** (com seu CNPJ).
   Complete a verificação de documentos que o Asaas pedir.
2. **Sandbox (testes):** https://sandbox.asaas.com → crie uma conta separada. Todo o
   desenvolvimento usa o sandbox; nenhum cartão real é cobrado.

### 8.2 Chave de API (faça nas duas contas)
1. **Integrações** (ou **Minha conta → Integrações**) → **Chave de API** → **Gerar**.
2. Copie e guarde: ela aparece **uma única vez**. Vai no `.env` (sandbox em homologação, produção em produção).

### 8.3 Webhook
1. **Integrações → Webhooks → Adicionar**.
2. URL: definida no subprojeto 2 (algo como `https://seudominio.com.br/api/v1/webhooks/asaas`).
3. Defina um **token de autenticação** forte (gere no gerenciador de senhas). Ele vai também no `.env`.
4. Marque os eventos de **cobranças**, **assinaturas** e **checkout**.

### 8.4 Nota fiscal de serviço (NFS-e)
1. Menu **Notas fiscais → Configurações**.
2. Informe a **inscrição municipal**, o **código do serviço** do seu município (para SaaS costuma
   ser um item de "licenciamento ou cessão de uso de software"; **confirme com seu contador**) e as
   alíquotas.
3. O Asaas pede as credenciais de acesso ao sistema da sua prefeitura ou o certificado digital,
   conforme o município.
4. Ative a **emissão automática ao receber o pagamento**.

### 8.5 Tokenização (só se o plano B for necessário)
Se as validações V-1/V-2 da spec falharem, peça ao **gerente da sua conta Asaas** a habilitação
da **tokenização de cartão** em produção. Está sujeita a análise do Asaas.

---

## 9. Google Cloud (Google Agenda)

1. https://console.cloud.google.com → seletor de projetos → **Novo projeto** → `solucao-crm`.
2. **APIs e serviços → Biblioteca** → procure **Google Calendar API** → **Ativar**.
3. **APIs e serviços → Tela de consentimento OAuth** (ou **Google Auth Platform → Branding**):
   - Tipo de usuário: **Externo**.
   - Nome do app, e-mail de suporte, logo.
   - **Domínios autorizados**: `seudominio.com.br`.
   - Links da **Política de privacidade** e dos **Termos de uso** (pré-requisitos).
   - **Escopos**: adicione os de agenda que o DeskcommCRM usa (o Claude Code confirma a lista no
     subprojeto 5; tipicamente `calendar.events` e leitura da lista de agendas).
   - **Usuários de teste**: adicione o seu Gmail.
4. **Credenciais → Criar credenciais → ID do cliente OAuth** → tipo **Aplicativo da Web**:
   - **URIs de redirecionamento autorizados**: os endereços de retorno indicados pelo Claude Code
     (um para produção e um para homologação).
   - Copie **Client ID** e **Client secret** → `.env` da VPS.
5. **Verificação:** quando estiver pronto para clientes reais, **Publicar app** → **Enviar para
   verificação**. Antes disso, verifique a propriedade do domínio no **Google Search Console**.
   Até a verificação sair, o app funciona para até 100 usuários, com tela de aviso.

> **E-mail dos clientes não usa o Google Cloud.** No MVP o e-mail é conectado por IMAP/SMTP com
> "senha de app" que **o próprio cliente** gera na conta Google dele (Conta Google → Segurança →
> Verificação em duas etapas → Senhas de app). O assistente de conexão explica isso para ele.

---

## 10. Contas mobile (subprojeto 7)

### 10.1 D-U-N-S (comece já: leva dias)
Necessário para contas de **empresa** na Apple e no Google.
1. Consulte ou solicite gratuitamente pelo site de D-U-N-S da Apple
   (https://developer.apple.com/support/D-U-N-S/), informando os dados do CNPJ exatamente como
   estão na Receita Federal.

### 10.2 Expo
1. https://expo.dev → crie a conta.
2. **Account settings → Access tokens → Create token** → copie para o secret `EXPO_TOKEN` do GitHub.

### 10.3 Apple Developer (cerca de US$ 99/ano)
1. https://developer.apple.com/programs/enroll → inscreva-se como **Organization** (exige D-U-N-S e um Apple ID com verificação em duas etapas).
2. Após a aprovação, o Claude Code configura certificados e o app via EAS no subprojeto 7.

### 10.4 Google Play Console (cerca de US$ 25, pagamento único)
1. https://play.google.com/console → crie a conta como **Organização** (com D-U-N-S).
   Contas **pessoais** novas precisam de um teste fechado com dezenas de testadores por 14 dias
   antes de publicar; contas de organização não têm essa exigência.
2. Conclua a verificação de identidade que o Google pedir.

---

## 11. Chave de IA (opcional, só para testes)
Os clientes usam a própria chave. Para testar o agente você mesmo, crie uma chave de baixo custo
(OpenRouter, OpenAI ou Anthropic), **defina um limite de gasto mensal no painel do provedor** e
cadastre-a pela tela do CRM, não no `.env`.

---

## 12. Resumo: onde cada segredo mora

| Segredo | Secrets do GitHub | `.env` produção | `.env` homologação |
|---|---|---|---|
| SSH de deploy (host, porta, usuário, chave) | ✅ | | |
| Expo token | ✅ | | |
| Supabase (gerado pelo instalador) | | ✅ | |
| Supabase Cloud (URL, anon, service_role, pooler) | | | ✅ |
| Asaas chave + token de webhook | | ✅ (produção) | ✅ (sandbox) |
| Google OAuth Client ID/secret | | ✅ | ✅ |
| Resend API key | | ✅ | ✅ |
| Bucket de backup (chaves + endpoint) | | ✅ | |
| Sentry DSN | | ✅ | ✅ |

---

## 13. Primeiro prompt sugerido no Claude Code

Depois das etapas 1 a 3, abra o Claude Code na VPS e envie:

```
Leia docs/solucao-crm/LEIA-PRIMEIRO.md e, por ele, a spec e este guia
(todos em docs/solucao-crm/). Instale a esteira SDD globalmente
(claude plugin marketplace add DouglasDeCastroAlmeida/sddEsteiraPropria e
claude plugin install sdd@sdd-esteira). Depois, vamos iniciar o subprojeto 0
(Fundação) com /sdd:new, usando a spec como insumo do Grill.
```
