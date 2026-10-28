# Jornada da 007 com WhatsApp real (T-024) — 2026-10-27

Ambiente: **produção** (`app.corretora.io`), organização "Minha Empresa", com autorização escrita do dono.
Os registros de teste (tipo, 3 compromissos, 2 avisos) foram criados pelo banco e **apagados ao fim**;
a conversa do contato de teste voltou a `open`, sem silêncio do agente. A auditoria não foi tocada.

| Parte | Resultado | Prova |
| :-- | :-- | :-- |
| 3. "1" confirma | OK | `client_confirmed_at` 23:16:24, menos de 1 s após a mensagem; auditoria `agenda.client_confirmed`; status segue `pending`; dono viu o selo "Confirmado pelo cliente" |
| 3. "1" repetido | OK | nada mudou, nenhuma mensagem nova, 1 só registro de auditoria |
| 4. "2" pede remarcar | OK | `client_reschedule_requested_at` gravado; nada cancelado; conversa `pending` com agente em silêncio (`agenda_cliente_pediu_remarcar`); 1 aviso na Central; dono viu o selo na Agenda |
| 4. "2" repetido | OK (com ressalva) | com dois horários abertos o 2º "2" vale para o outro horário (regra desenhada: o mais próximo ainda não tratado); com todos tratados o 3º "2" não fez nada |
| 5. equipe remarca | OK | pedido do horário remarcado limpo e só o aviso dele resolvido; o outro seguiu aberto |
| 6. chave desligada | OK | "1" não confirmou nada e não gerou resposta automática; ficou no inbox |
| 1 e 2. tela de criar tipo | NÃO EXECUTADO | o tipo foi criado pelo banco; a tela de criação e o texto padrão não foram percorridos pelo dono |

## Achados
1. As respostas automáticas ("Obrigado pela confirmação..." e "Entendido...") foram criadas e **barradas pelo
   modo de teste do canal** (`error_code = pre_go_live`). O dono não as recebeu no celular. Só serão
   vistas com o canal fora do modo de teste.
2. O roteiro dizia "Configurações › Agenda"; o menu se chama **Tipos de agendamento** (grupo "Sua empresa").
   O roteiro também previa que repetir "2" nada muda, o que só vale com todos os horários já tratados.
3. Compromisso sem responsável não pode ser remarcado ("ainda não publicou horários"): pré-requisito da
   Agenda, não da 007.
