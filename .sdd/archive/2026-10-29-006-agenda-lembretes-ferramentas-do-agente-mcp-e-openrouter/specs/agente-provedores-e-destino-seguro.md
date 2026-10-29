# Delta: agente-provedores-e-destino-seguro

## ADICIONADOS

### Requisito: Provedores OpenRouter e compatível com a API da OpenAI

O sistema DEVE aceitar, na tela de chaves de IA, os provedores "OpenRouter" (só chave e modelo; endereço preenchido) e "Compatível com OpenAI" (endereço base, chave e modelo), com botão "Testar" que faz chamada real e mostra sucesso ou a causa em português, em en ou em es. A chave DEVE ficar cifrada e a tela e a API DEVEM mostrar só os 4 últimos caracteres. O agente com modelo desses provedores DEVE redigir e chamar ferramentas pelo mesmo caminho dos provedores atuais.

- Cenário: Dado o provedor OpenRouter, quando o admin informa chave e modelo e clica em Testar, então vê sucesso ou a causa.
- Cenário: Dado uma chave salva, quando a tela é exibida, então aparecem só os 4 últimos caracteres.

### Requisito: Provedor que falha leva a conversa para uma pessoa

Quando a chamada ao modelo do provedor de um agente falha (chave revogada, saldo zerado), o sistema DEVE não enviar resposta, mover a conversa para a fila humana e avisar o motivo na Central. Só a falha da chamada ao modelo conta; erro de ferramenta não transfere por este caminho.

- Cenário: Dado uma chave revogada, quando o agente tenta responder, então nada é enviado, a conversa vai à fila humana e a Central avisa.

### Requisito: Endereço base seguro e sem janela de troca de DNS

O sistema DEVE recusar, ao salvar ou testar, endereço base que resolva para loopback, rede local, link-local, metadata ou faixa reservada (inclusive IPv6 embutido), e endereço http fora do ambiente de teste local declarado. A conexão DEVE usar o IP resolvido na validação e NÃO DEVE seguir redirecionamento para destino não validado. A mesma proteção vale para o endereço de servidor MCP.

- Cenário: Dado um endereço que resolve para 169.254.169.254, quando o admin salva, então é recusado com a causa.
- Cenário: Dado um redirecionamento para endereço interno, quando recebido, então não é seguido.

### Requisito: Textos novos pelo dicionário

Todo texto novo desta mudança DEVE sair do dicionário em pt-BR, en e es, sem texto fixo de marca. Ressalva conhecida: o espanhol não teve revisão por falante nativo.

- Cenário: Dado o idioma en, quando a tela de uso por agente abre, então os textos vêm em inglês.
