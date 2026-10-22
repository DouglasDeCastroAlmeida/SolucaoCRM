# Diagnóstico da VPS — 2026-10-21 (após a limpeza)

Insumo para o Grill do subprojeto 0 (validações V-4 e V-5). Sem segredos neste arquivo.

## Servidor
- Hostinger KVM4, `srv2049015`, Ubuntu 26.04, 4 vCPU, 15 GB de RAM, sem swap.
- Disco: 193 GB, 13 GB em uso.
- RAM: cerca de 1,6 GB em uso, 13 GB disponíveis.
- Docker 29.9.1, Compose v5.6.0.
- Firewall `ufw` ativo: 22, 80, 443 e 8000 liberadas. A 8000 sobrou de um projeto antigo e não é necessária.
- Não existe proxy da Hostinger. Quem escuta 80/443 é o container do vava.

## Usuários
- `root` (acesso SSH usado até agora) e `dev` (uid 1000, sem acesso ao Docker, pastas `bin` e `projetos`).
- O usuário `deploy` (guia, seção 2.4) ainda não foi criado.

## O que roda hoje
| Item | Detalhe |
|---|---|
| Projeto Docker `vava` | `/opt/vava`, container `valesca_almeida_website` (Caddy). Publica 80, 443/tcp e 443/udp. Site `valescaalmeida.com` |
| `portainer` | Painel do Docker, porta 9000, volume `portainer_data`. Fora de qualquer projeto Compose |
| Redes | `vava_network` (o vava) mais as padrão do Docker |
| Volumes | `vava_caddy_config`, `vava_caddy_data`, `portainer_data` |

Removidos em 2026-10-21 (com snapshot prévio): projetos `botimobiliario` e `evo-crm-community`, com containers, volumes, redes, imagens e pastas. Os domínios `corretora.io`, `app.corretora.io` e `api.corretora.io` ficaram sem resposta, o que era esperado.

## Atenção ao vava
- O `Caddyfile` e o `deploy.sh` em `/opt/vava` têm modificações locais **não enviadas ao GitHub** (`git status` mostra `M`). O `Caddyfile` local ainda contém as rotas dos projetos removidos. Um deploy do vava pode sobrescrever esses arquivos.
- O vava **não** depende de nenhuma rede além da `vava_network` (verificado no `docker-compose.yml` do repositório e da VPS).

## Requisito do dono do projeto
**Não pode haver dois serviços disputando as portas 80 e 443.** Deve existir um único dono dessas portas na VPS.

## Pontos para V-4 e V-5 (a decidir no Grill)
- O instalador single-server do DeskcommCRM traz o seu próprio proxy (`Caddyfile.single-server`, `docker-compose.single-server.yml`) e quer 80/443. Conflita com o Caddy do vava.
- Opções a avaliar, respeitando o requisito acima e sem alterar o vava sem aprovação:
  1. O proxy do kit passa a ser o único dono de 80/443 e o vava entra atrás dele (exige mudar a publicação de portas do vava; precisa de aprovação explícita).
  2. O Caddy do vava vira o único dono e encaminha o domínio do CRM para o kit (o kit publica só em portas internas).
  3. Usar o modo do instalador que publica atrás de um proxy existente (alternativa citada na V-4).
- V-5: há folga de RAM e disco (13 GB de RAM livres, 180 GB de disco) para o modo single-server junto com o vava, mas o Claude Code também roda na VPS conforme a seção 4 da spec.
