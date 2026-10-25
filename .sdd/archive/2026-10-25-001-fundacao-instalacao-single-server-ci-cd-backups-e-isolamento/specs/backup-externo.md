# Delta: backup-externo

> Comportamento entregue pela mudança 001.

## ADICIONADOS

### Requisito: Backup diário com cópia externa criptografada

O sistema DEVE gerar diariamente backup do banco, das sessões do WhatsApp e do Storage, criptografá-los com age antes de sair da VPS e enviá-los a um bucket privado do Cloudflare R2, verificando o envio.

- Cenário: Dado o horário diário, quando o agendador dispara, então os três backups são gerados, cifrados e enviados.
- Cenário: Dado um objeto no bucket, quando lido sem credencial, então o acesso é negado.
- Cenário: Dado um backup externo, quando restaurado em banco vazio com a chave guardada pelo dono, então os dados voltam idênticos (provado para o banco; a subida do app inteiro fica para o ensaio do runbook).

### Requisito: Retenção e teto de espaço

O sistema DEVE manter localmente os 14 backups mais recentes, apagar objetos externos com mais de 14 dias por ciclo de vida, recusar o envio quando o bucket passar de 7 GB e nunca gerar cobrança do provedor.

- Cenário: Dado o bucket acima de 7 GB, quando um envio é tentado, então é recusado e o dono é alertado.

### Requisito: Alerta de falha de backup

O sistema DEVE alertar o dono (Sentry ou e-mail) no mesmo dia em que um backup ou envio falhar, sem incluir segredos na mensagem.

- Cenário: Dado um envio que falha, quando o script termina, então o alerta é emitido e a saída é de erro.
