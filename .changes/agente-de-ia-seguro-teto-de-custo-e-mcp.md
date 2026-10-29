---
impacto: capacidade_nova
secao: adicionado
titulo: Agente de IA mais seguro, com teto de custo, aprovação de ações e vários servidores MCP
---

O agente de IA passa a ser mais seguro de ligar. Um agente novo nasce no modo "aprovar antes de enviar": ele redige e uma pessoa aprova cada resposta. Para passar ao modo automático, o administrador vê um aviso dizendo que o agente passará a responder sozinho e que o custo vai na chave de IA da empresa, e só vale depois de confirmar (a confirmação fica na auditoria). Agentes que já existiam continuam como estavam.

Cada empresa passa a ter um teto de custo de IA. Ao chegar a 80% do teto, o administrador é avisado na Central e por e-mail, uma vez por mês; ao chegar a 100%, o agente para e as conversas vão para uma pessoa. A tela de uso mostra tokens, custo e teto por agente e no total, e a palavra "estimado" aparece quando o provedor não informa o custo. Se o provedor de IA falhar de forma que não se resolve com nova tentativa (chave revogada, saldo zerado), a conversa vai para uma pessoa e a Central avisa; dois erros seguidos de ferramenta na mesma conversa também passam o atendimento a uma pessoa.

Os provedores OpenRouter e de endereço próprio funcionam como os demais, com a chave guardada cifrada. O agente ganhou a ferramenta "criar tarefa" e a de mover etapa deixou de gravar movimento repetido. O cliente que pede "me passar para uma pessoa" ou "quero um atendente" também é reconhecido.

Em Configurações, o administrador pode cadastrar vários servidores MCP externos (a chave `MCP_EXTERNO_ADMIN_DA_ORG` decide se o administrador da organização pode, ou só o administrador da plataforma). As ferramentas de cada servidor nascem desligadas e são ligadas agente por agente. Ferramenta de escrita de um servidor externo pede a aprovação de uma pessoa antes de rodar, com botões Aprovar e Recusar na Central, a menos que o administrador marque "pode rodar sem aprovação" para aquela ferramenta (só no modo automático, com aviso).
