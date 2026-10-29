# mcp-servidores-externos

## Requisitos

### Requisito: Vários servidores MCP por organização com ferramentas desligadas por padrão

O sistema DEVE permitir cadastrar vários servidores MCP externos por organização (endereço https seguro, credencial cifrada, teste de conexão e listagem de ferramentas). Quem cadastra é o administrador da instalação, ou o admin da organização se MCP_EXTERNO_ADMIN_DA_ORG estiver ligada. Ferramentas nascem desligadas; o admin liga por agente; o agente enxerga só as ligadas, de qualquer servidor. O servidor MCP único anterior DEVE ser migrado como primeiro servidor, com as ferramentas já em uso mantidas.

- Cenário: Dado um servidor recém-cadastrado, quando as ferramentas são listadas, então todas estão desligadas.
- Cenário: Dado uma organização com o servidor antigo, quando a mudança é implantada, então ele segue funcionando sem ação do admin.

### Requisito: Aprovação das ferramentas de escrita

Em "aprovar antes de enviar", ferramenta que o servidor declara de escrita ou destrutiva DEVE ficar pendente (mcp_acoes_pendentes) e rodar só após Aprovar na Central. Em modo automático, só roda sem aprovação a marcada "pode rodar sem aprovação", com aviso na tela; leitura roda sem aprovação. Atualizar ferramentas DEVE revogar a liberação das de escrita alteradas ou removidas, e ferramenta nova nunca nasce ligada.

- Cenário: Dado uma ferramenta de escrita em modo assistido, quando o agente a chama, então aparece cartão Aprovar/Recusar e nada roda antes.

### Requisito: Retorno do servidor é dado externo, com limite, tempo e auditoria sem valores

O texto devolvido DEVE entrar no contexto dentro do envelope [DADO EXTERNO ...] ... [FIM DO DADO EXTERNO], com no máximo 8.000 caracteres, sem alterar permissões nem ferramentas, e com a credencial trocada se repetida. A chamada DEVE terminar em até 10 s com erro claro. A auditoria DEVE registrar servidor, ferramenta e resumos, sem a credencial e sem texto do servidor.

- Cenário: Dado um servidor lento, quando o agente chama, então erro claro em até 10 s e a conversa segue.

### Requisito: Rotas e tabelas de MCP protegidas

Toda rota mutante de MCP DEVE chamar requireSupportWrite antes do efeito, validar com Zod estrito, exigir o papel certo, auditar, e tirar organization_id da sessão. As tabelas mcp_servidores_externos, mcp_acoes_pendentes e ai_falhas_de_ferramenta DEVEM ter RLS por organização, sem GRANT de colunas de segredo a authenticated.

- Cenário: Dado outra organização, quando tenta ler ou alterar servidores desta, então a RLS e o filtro impedem.
