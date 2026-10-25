# isolamento-dev

## Requisitos

### Requisito: Claude Code sem poder direto sobre a produção

O usuário dev DEVE não pertencer ao grupo docker, não poder ler /opt/crm-prod nem os .env, e obter estado e logs apenas por um atalho de leitura que mascara segredos.

- Cenário: Dado o usuário dev, quando executa docker ps, então é negado.
- Cenário: Dado o usuário dev, quando lê o .env da produção, então é negado.
- Cenário: Dado o atalho de leitura, quando consulta estado e logs, então nenhum segredo aparece.

### Requisito: Usuário de deploy restrito

O usuário deploy DEVE aceitar somente a chave de deploy e executar apenas o necessário ao deploy.

- Cenário: Dado o authorized_keys do deploy, quando outra chave tenta entrar, então é recusada.

### Requisito: Toda ação administrativa é script versionado

Toda ação administrativa na VPS DEVE existir como script em infra/solucao/, com modo de simulação (dry-run), ser mostrada ao dono antes e aprovada.

- Cenário: Dado um script administrativo, quando executado em dry-run, então descreve o que faria sem alterar a VPS.
