# Delta: marcas-parceiros-e-dominios

> Comportamento ENTREGUE pela mudança 002 (subprojeto 1). Mesclado em `.sdd/specs/` no arquivamento.

## ADICIONADOS

### Requisito: Marca resolvida pelo endereço acessado

O sistema DEVE resolver a marca pelo host da requisição no servidor Node (o `proxy.ts` de borda só repassa `x-brand-host`), com cache de 60 s (teto de 500 entradas), e DEVE degradar para a marca padrão quando o host não tem marca ou a consulta falha. A precedência é organização > marca > plataforma > env > padrão do produto.

- Cenário: Dado dois domínios de marcas diferentes, quando cada um abre `/login`, então cada tela mostra o nome da sua marca e o endereço da instalação mostra a marca padrão.

### Requisito: Chave de desligamento e compatibilidade

O sistema DEVE ter a chave `MARCAS_POR_DOMINIO` (ligada por padrão); com `off`, o app volta à marca padrão sem migração de dados e sem reverter o banco. Uma instalação sem marcas cadastradas DEVE se comportar como antes.

- Cenário: Dado `MARCAS_POR_DOMINIO=off` e o app recriado, quando o login de uma marca é aberto, então aparece a marca padrão em até 120 s (medido: 15 s).

### Requisito: Modelo Plataforma > Parceiro > Marca > Organização com isolamento

O sistema DEVE manter as tabelas `vertical_packs`, `partners`, `partner_members`, `brands`, `brand_domains`, `brand_plans`, `brand_email_context` e `auth_hook_deliveries`, todas com RLS; `organizations.brand_id` aponta para a marca (padrão herdada). `brand_email_context` e `auth_hook_deliveries` não têm policy e só o `service_role` as acessa. Funções novas têm `revoke` de PUBLIC e anon. A troca de marca de uma organização passa por `fn_set_org_brand` e é auditada (`org.brand_changed`). O pacote vertical é copiado de forma atômica por `fn_copiar_pacote_para_org` (só `service_role`).

- Cenário: Dado duas marcas, quando um usuário de uma consulta a outra, então a RLS não devolve linhas.

### Requisito: Identidade única com visão filtrada por marca

O sistema DEVE manter uma identidade por pessoa e filtrar, na camada de app (`orgPertenceAMarca`), as organizações visíveis ao host da marca. Troca de organização para outra marca DEVE ser recusada.

- Cenário: Dado uma conta com organização só na marca B, quando entra pelo host da marca A, então não vê a organização da marca B.

### Requisito: Cadastro e acesso com a marca

O sistema DEVE aplicar cadastro aberto ou fechado da marca nas quatro portas (signUp, `/auth/confirm`, callback do Google e `recoverOrganization`) e mostrar a marca nas telas públicas.

- Cenário: Dado uma marca com cadastro fechado, quando alguém tenta se cadastrar pelo host dela, então o cadastro é recusado.

### Requisito: E-mails de acesso com a marca

O sistema DEVE receber o gancho Send Email do Supabase Auth em `/api/hooks/auth/send-email` (Standard Webhooks, comparação em tempo constante, janela de tempo, corpo ≤ 64 KB), fechado por padrão (segredo vazio ⇒ 401), com dedupe por `webhook-id` e trava de reenvio de 60 s. O remetente é só o endereço configurado, com o nome da marca acrescentado pelo código, e os links apontam para o host da marca.

- Cenário: Dado o gancho ligado, quando se pede redefinição de senha no host da marca A, então o e-mail sai em nome da marca A e o botão aponta para o host da marca A.

### Requisito: HTTPS sob demanda controlado

O sistema DEVE expor `/api/internal/tls-ask` (token por hash em tempo constante, sem `x-forwarded-for`, DNS do domínio deve apontar à VPS, limite por hora, erro de banco ⇒ 503) e bloquear `/api/internal/*` na borda. O `on_demand_tls` é opt-in por `caddy-sites/marcas.caddy`; sem ele o `ask` global é inerte e domínio sem marca não recebe certificado.

- Cenário: Dado um host sem marca, quando o Caddy pergunta ao app, então a resposta nega e nenhum certificado é emitido.

### Requisito: Painel da plataforma para marcas

O sistema DEVE oferecer em `/admin/marcas` o CRUD de marcas, domínios, planos, pacotes e a visão de contas, por rotas `app/api/v1/admin/**` que chamam `requireSupportWrite(` antes do efeito, exigem administrador da plataforma, validam com Zod e registram auditoria (`brand.*`).

- Cenário: Dado um administrador da plataforma, quando cria uma marca com subdomínio, então ela passa a resolver naquele host.
