# implantacao-single-server

## Requisitos

### Requisito: Um único dono das portas 80 e 443

O sistema DEVE ter somente o Caddy do CRM escutando em 80 e 443, com o site do vava atrás dele e sem porta do vava aberta à internet.

- Cenário: Dado o ambiente instalado, quando se lista o que escuta 80/443, então só o Caddy do CRM aparece.
- Cenário: Dado o vava reconfigurado, quando se acessa o site do vava, então responde 200 com o mesmo conteúdo.
- Cenário: Dada a troca de dono das portas, quando ela é executada, então existe cópia prévia do vava e procedimento de reversão, e a queda medida é de no máximo 5 minutos.

### Requisito: Produção single-server

O sistema DEVE servir a raiz de app.corretora.io (200) e /app (307), com /api/v1/health saudável para Supabase, Redis e WAHA, Studio e Postgres inacessíveis pela internet e voice-agent desligado.

- Cenário: Dado o instalador concluído, quando se consulta a raiz e /app, então 200 e 307.
- Cenário: Dado o instalador, quando falta variável crítica ou DNS, então falha com mensagem em português que diz o que fazer, sem instalação pela metade.

### Requisito: Homologação isolada

O sistema DEVE manter crm-hml em hml.corretora.io, com banco no Supabase Cloud, sem compartilhar banco, .env, credenciais nem volumes com a produção, e sem roubar o apelido de rede da produção.

- Cenário: Dado crm-hml, quando se inspeciona o .env, então o banco é do Supabase Cloud.

### Requisito: Limites de memória e CPU, swap e medição

O sistema DEVE ter swap de 4 GB persistente, limite de memória e CPU em todos os containers (produção com prioridade), medição contínua de memória livre e alerta ao dono quando ela ficar abaixo de 2 GB por mais de um dia.

- Cenário: Dada a produção em uso normal, quando se mede por 24 h, então a memória disponível é registrada e fica acima de 2 GB.

### Requisito: Domínio, DNS e firewall

O sistema DEVE resolver app, hml e subdomínios arbitrários de corretora.io para o IP da VPS e expor ao público apenas 22, 80 e 443 (a 8000 fechada), sem que portas publicadas por container furem o firewall.

- Cenário: Dado o firewall, quando se listam as portas abertas, então só 22, 80 e 443.

### Requisito: Monitoramento básico

O sistema DEVE enviar erros ao Sentry do dono sem dados sensíveis e avisar o dono quando /api/v1/health de produção cair. Entregue: Sentry. Pendente de evidência: monitor de disponibilidade com alerta no celular (AC-011.1).

- Cenário: Dado o Sentry configurado, quando ocorre um erro de teste em homologação, então ele aparece no painel sem dados sensíveis.
