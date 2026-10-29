# Prova da 006 na homologacao (T-040 / AC-009.3)

Alvo: https://hml.corretora.io. Gerado pelo spec tests/journeys/agente-006-na-homologacao.spec.ts.

| Passo | Resultado | Observacao |
|---|---|---|
| 1 login | PASSOU | entrou em /app sem pedir segundo fator |
| 2 chave OpenRouter | PASSOU | validada=true; "Testar"/aviso de modelo fraco: ver achado (a tela so valida em segundo plano) |
| 2b teste da chave + aviso de modelo fraco (AC-001.6) | NÃO PÔDE SER EXERCITADO | o botao Testar so existe para o provedor personalizado; o aviso 'aviso_modelo_fraco' sai da API e nenhuma tela o mostra |
| 3 criar agente (AC-003.1/003.2) | PASSOU | nasceu no modo assistido (revisar antes de enviar) e sem versao publicada, na tela e no banco |
| 4 automatico (AC-003.4/003.5) | PASSOU | dialogo com aviso; Esc e Cancelar nao gravam; Confirmar grava e audita com ator; voltou ao assistido |
| 5 uso/teto (AC-004.4/004.6) | PASSOU | Teto do mês: US$ 50,00; "estimado" so aparece quando ha gasto com preco desconhecido (sem gasto na hml); o aviso de teto exige gasto real: nao provado (dialogo aberto e cancelado, nada gravado) |
| 6 servidor MCP externo | PASSOU | pagina abriu (conta e dona da instalacao); http recusado; ferramentas nascem desligadas; ligar e atualizar exercitados (ver medidas) |
| 7 Central | PASSOU | carregou sem erro; o cartao Aprovar/Recusar nao foi exercitado (exige acao pendente real, logo WhatsApp) |
| 8a tema claro/escuro (contraste) | FALHOU | contraste abaixo de AA: dark/agente: "Teste" 4.44; "Capacidades" 4.44; "Execuções" 4.44; "Histórico" 4.44; "Propostas" 4.44; "×" 4.44; "×" 4.44; "×" 4.44 // dark/central: "Resolvidos" 4.44 |
| 8b espanhol | PASSOU | textos novos aparecem em espanhol (usage, MCP, operacao do agente, dialogo); idioma devolvido ao portugues |
| 9 papel menor | NÃO PÔDE SER EXERCITADO | existe(m) 1 usuario(s) com papel(is) admin; nao criei usuarios; telas como papel menor nao exercitadas |

## Medidas por ferramenta

- login: URL final /app/inbox; organizacoes visiveis ao servico: 1
- credencial: a tela nunca exibe a chave inteira; mostra os 4 ultimos caracteres: true
- credencial no banco (leitura): provider=openrouter; validada=true; erro=nenhum
- tela de credenciais: botao "Testar" presente=false; botao "Revalidar" presente=true
- aviso de modelo fraco visivel na tela de credenciais apos revalidar: false
- agente novo: tela mostra modo "assisted" (Assistido: revisar antes de enviar); banco: operation_mode=assisted, published_version_id=null
- Esc no dialogo do automatico: dialogo fechou; banco continua assisted
- Cancelar no dialogo do automatico: banco continua assisted
- Confirmar: banco operation_mode=automatic
- auditoria ai_agent.automatic_confirmed: 1 linha para o agente; com ator (user id presente)=true; previous_mode=assisted
- voltou para assisted: banco operation_mode=assisted
- uso: frase "sem teto/sem limite" presente=true; Teto do mês: US$ 50,00; palavra "estimado" presente=false
- uso: cartao de orcamento mostra "US$ 0,00 gastos de US$ 50,00"
- campo "Chave de acesso" obrigatorio na tela: true (o servidor publico do DeepWiki nao tem credencial)
- reexecucao: 1 interruptor(es) ja ligado(s) por corrida anterior; desligando antes de medir
- ferramentas listadas: 6 interruptores; ligados no inicio: 0 (esperado: nascem desligadas)
- classificacao das ferramentas do DeepWiki na tela: com tipo Leitura=false; todas como Escrita=true
- apos ligar: interruptor da ferramenta aria-checked=true
- ligar uma ferramenta de leitura -> toast ""; aviso "so vale quando voce publicar" visivel=true
- Atualizar ferramentas: interruptores ligados antes=1, depois=0; quadro: "(sem quadro de mudancas)"
- OBS: o servidor publico nao mudou entre as chamadas; se o quadro lista ferramentas como Alteradas, e falso positivo
- Central: carregou; botoes Aprovar visiveis=0 (so existem com acao MCP pendente real)
- contraste [light] uso: tema escuro aplicado=false; textos medidos=55; menor razao=6.63; abaixo do minimo AA=0
- contraste [light] mcp: tema escuro aplicado=false; textos medidos=26; menor razao=5.8; abaixo do minimo AA=0
- contraste [light] agente: tema escuro aplicado=false; textos medidos=162; menor razao=5.63; abaixo do minimo AA=0
- contraste [light] central: tema escuro aplicado=false; textos medidos=24; menor razao=5.51; abaixo do minimo AA=0
- contraste [dark] uso: tema escuro aplicado=true; textos medidos=55; menor razao=5; abaixo do minimo AA=0
- contraste [dark] mcp: tema escuro aplicado=true; textos medidos=26; menor razao=5; abaixo do minimo AA=0
- contraste [dark] agente: tema escuro aplicado=true; textos medidos=162; menor razao=4.44; abaixo do minimo AA=8
- contraste [dark] central: tema escuro aplicado=true; textos medidos=24; menor razao=4.44; abaixo do minimo AA=1
- textos abaixo do contraste minimo: dark/agente: "Teste" 4.44; "Capacidades" 4.44; "Execuções" 4.44; "Histórico" 4.44; "Propostas" 4.44; "×" 4.44; "×" 4.44; "×" 4.44 || dark/central: "Resolvidos" 4.44
- espanhol /app/ai/usage: "Presupuesto mensual de IA" presente=true
- espanhol /app/settings/servidor-mcp-externo: "Registrar servidor" presente=true
- espanhol /app/settings/servidor-mcp-externo: "Registrar y probar" presente=true
- espanhol /app/settings/servidor-mcp-externo: "Clave de acceso" presente=true
- espanhol /app/ai/agents/<agente>: "Operación del agente" presente=true
- espanhol /app/ai/agents/<agente>: "Asistido: revisar antes de enviar" presente=true
- espanhol: dialogo do automatico em espanhol=true
- membros da organizacao (so papeis): admin

## Criado na homologacao (nao apagado)

