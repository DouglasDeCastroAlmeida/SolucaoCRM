/** Textos do canal de e-mail (mudança 005): assistente de conexão, aba de Conexões e respostas da API. */
export const TEXTOS_EMAIL_CANAL = {
  // Respostas da API para canal que só responde a quem escreveu
  "Este canal só responde a quem escreveu: não dá para usá-lo em campanhas.": {
    es: "Este canal solo responde a quien escribió: no se puede usar en campañas.",
  },
  "Este canal só responde a quem escreveu: não dá para iniciar uma conversa nova por ele.": {
    es: "Este canal solo responde a quien escribió: no se puede iniciar una conversación nueva por él.",
  },
  // Aba e lista de caixas
  "Conectar outra caixa": { es: "Conectar otro buzón" },
  "Limite por dia": { es: "Límite por día" },
  "Envio": { es: "Envío" },
  "Não foi possível carregar as caixas de e-mail.": { es: "No fue posible cargar los buzones de correo." },
  // Assistente
  "Conectar uma caixa de e-mail": { es: "Conectar un buzón de correo" },
  "Escolha o seu provedor. Você vai testar a caixa antes de conectar, e nada do passado é importado.": {
    es: "Elige tu proveedor. Probarás el buzón antes de conectar, y no se importa nada del pasado.",
  },
  "Gmail": { es: "Gmail" },
  "Outro provedor": { es: "Otro proveedor" },
  "Como criar a senha de app": { es: "Cómo crear la contraseña de aplicación" },
  "Ligue a verificação em duas etapas na sua conta Google (Conta Google, Segurança).": {
    es: "Activa la verificación en dos pasos en tu cuenta de Google (Cuenta de Google, Seguridad).",
  },
  "Ainda em Segurança, abra Senhas de app e crie uma senha de app para o CRM.": {
    es: "Aún en Seguridad, abre Contraseñas de aplicaciones y crea una contraseña de aplicación para el CRM.",
  },
  "Copie a senha de 16 letras e cole no campo abaixo, no lugar da sua senha normal.": {
    es: "Copia la contraseña de 16 letras y pégala en el campo de abajo, en lugar de tu contraseña normal.",
  },
  "Leitura: imap.gmail.com, porta 993": { es: "Lectura: imap.gmail.com, puerto 993" },
  "Envio: smtp.gmail.com, porta 465": { es: "Envío: smtp.gmail.com, puerto 465" },
  "Endereço de e-mail": { es: "Dirección de correo" },
  "Se vazio, usa o endereço de e-mail": { es: "Si está vacío, usa la dirección de correo" },
  "Senha de app": { es: "Contraseña de aplicación" },
  "Guardada cifrada. Depois de gravar ela não é mostrada de novo.": {
    es: "Se guarda cifrada. Después de guardarla no se muestra de nuevo.",
  },
  "Endereço informado pelo seu provedor": { es: "Dirección indicada por tu proveedor" },
  "Leitura (IMAP)": { es: "Lectura (IMAP)" },
  "Envio (SMTP)": { es: "Envío (SMTP)" },
  "Servidor de leitura": { es: "Servidor de lectura" },
  "Porta de leitura": { es: "Puerto de lectura" },
  "Segurança da leitura": { es: "Seguridad de la lectura" },
  "Servidor de envio": { es: "Servidor de envío" },
  "Porta de envio": { es: "Puerto de envío" },
  "Segurança do envio": { es: "Seguridad del envío" },
  "SSL/TLS (porta 993)": { es: "SSL/TLS (puerto 993)" },
  "STARTTLS (porta 143)": { es: "STARTTLS (puerto 143)" },
  "SSL/TLS (porta 465)": { es: "SSL/TLS (puerto 465)" },
  "STARTTLS (porta 587)": { es: "STARTTLS (puerto 587)" },
  "Assinatura (opcional)": { es: "Firma (opcional)" },
  "Entra no fim de toda resposta enviada por esta caixa.": {
    es: "Se agrega al final de cada respuesta enviada por este buzón.",
  },
  "Deu certo. Entramos na caixa e enviamos um e-mail de teste para ela. Clique em Conectar para terminar.": {
    es: "Funcionó. Entramos al buzón y le enviamos un correo de prueba. Haz clic en Conectar para terminar.",
  },
  "Conectando…": { es: "Conectando…" },
  "Caixa de e-mail conectada.": { es: "Buzón de correo conectado." },
  "Não foi possível testar a caixa agora. Tente de novo.": {
    es: "No fue posible probar el buzón ahora. Inténtalo de nuevo.",
  },
  "Não foi possível conectar a caixa agora. Tente de novo.": {
    es: "No fue posible conectar el buzón ahora. Inténtalo de nuevo.",
  },
  // Respostas da API (a rota traduz pelo idioma de quem pediu)
  "Confira os dados da caixa de e-mail.": { es: "Revisa los datos del buzón de correo." },
  "Aguarde um minuto antes de tentar de novo.": { es: "Espera un minuto antes de intentarlo de nuevo." },
  "Essa caixa de e-mail já está conectada.": { es: "Ese buzón de correo ya está conectado." },
  "Caixa de e-mail não encontrada.": { es: "Buzón de correo no encontrado." },
  "Não foi possível salvar a caixa agora. Tente de novo.": {
    es: "No fue posible guardar el buzón ahora. Inténtalo de nuevo.",
  },
  // Causas de falha da conexão (lib/channels/email/conexao.ts)
  "O servidor recusou o usuário ou a senha. Confira os dois e tente de novo. Em provedores como o Gmail, use a senha de app, não a senha normal da conta.": {
    es: "El servidor rechazó el usuario o la contraseña. Revisa ambos e inténtalo de nuevo. En proveedores como Gmail, usa la contraseña de aplicación, no la contraseña normal de la cuenta.",
  },
  "O provedor exige uma senha de app. Ligue a verificação em duas etapas na sua conta, crie uma senha de app e cole-a aqui no lugar da senha normal.": {
    es: "El proveedor exige una contraseña de aplicación. Activa la verificación en dos pasos en tu cuenta, crea una contraseña de aplicación y pégala aquí en lugar de la contraseña normal.",
  },
  "Não encontramos esse servidor. Confira o endereço do servidor (por exemplo, imap.seudominio.com) e tente de novo.": {
    es: "No encontramos ese servidor. Revisa la dirección del servidor (por ejemplo, imap.sudominio.com) e inténtalo de nuevo.",
  },
  "O endereço do servidor parece inválido. Informe só o nome do servidor, por exemplo imap.seudominio.com.": {
    es: "La dirección del servidor parece inválida. Indica solo el nombre del servidor, por ejemplo imap.sudominio.com.",
  },
  "O servidor foi encontrado, mas não aceitou a conexão nessa porta. Confira a porta e o tipo de segurança (normalmente 993 para leitura e 465 ou 587 para envio).": {
    es: "El servidor fue encontrado, pero no aceptó la conexión en ese puerto. Revisa el puerto y el tipo de seguridad (normalmente 993 para lectura y 465 o 587 para envío).",
  },
  "Essa porta não é de e-mail. Use 993 ou 143 para leitura e 465 ou 587 para envio.": {
    es: "Ese puerto no es de correo. Usa 993 o 143 para lectura y 465 o 587 para envío.",
  },
  "Não conseguimos chegar até o servidor. Ele pode estar desligado ou bloqueado por um firewall.": {
    es: "No logramos llegar al servidor. Puede estar apagado o bloqueado por un firewall.",
  },
  "O servidor demorou demais para responder. Tente de novo em alguns minutos.": {
    es: "El servidor tardó demasiado en responder. Inténtalo de nuevo en unos minutos.",
  },
  "O certificado de segurança do servidor não é válido para esse endereço. Confira se o endereço do servidor está certo.": {
    es: "El certificado de seguridad del servidor no es válido para esa dirección. Revisa que la dirección del servidor sea correcta.",
  },
  "Esse endereço de servidor não é permitido, porque aponta para uma rede interna. Use o servidor de e-mail do seu provedor.": {
    es: "Esa dirección de servidor no está permitida, porque apunta a una red interna. Usa el servidor de correo de tu proveedor.",
  },
  "Entramos na caixa, mas o servidor recusou o e-mail de teste. Confira se esse usuário pode enviar mensagens por esse servidor de envio.": {
    es: "Entramos al buzón, pero el servidor rechazó el correo de prueba. Revisa si ese usuario puede enviar mensajes por ese servidor de envío.",
  },
  "Não foi possível concluir a conexão e não identificamos a causa. Confira os dados e tente de novo.": {
    es: "No fue posible completar la conexión y no identificamos la causa. Revisa los datos e inténtalo de nuevo.",
  },
  "primeira mensagem recebida por e-mail": { es: "primer mensaje recibido por correo" },
  // Aviso de senha recusada (Central e e-mail aos administradores) e lista de ignorados
  "A senha da caixa de e-mail foi recusada": { es: "La contraseña del buzón de correo fue rechazada" },
  "O servidor recusou a senha da caixa": { es: "El servidor rechazó la contraseña del buzón" },
  "Pausamos a leitura e o envio dessa caixa para não bloquear a sua conta. Em Conexões, atualize a senha para retomar de onde parou.": {
    es: "Pausamos la lectura y el envío de ese buzón para no bloquear tu cuenta. En Conexiones, actualiza la contraseña para retomar donde se quedó.",
  },
  "Informe uma caixa de e-mail válida.": { es: "Indica un buzón de correo válido." },
  "E-mail ignorado não encontrado.": { es: "Correo ignorado no encontrado." },
  "Não foi possível ler esse e-mail agora. Tente de novo em alguns minutos.": {
    es: "No fue posible leer ese correo ahora. Inténtalo de nuevo en unos minutos.",
  },
  "Informe o endereço de e-mail do remetente.": { es: "Indica la dirección de correo del remitente." },
  "Conversa de e-mail não encontrada.": { es: "Conversación de correo no encontrada." },
  "O canal de e-mail está desligado nesta instalação.": { es: "El canal de correo está apagado en esta instalación." },
  // Várias caixas, pausa e configuração por caixa (Fatia 6)
  "Caixa atualizada.": { es: "Buzón actualizado." },
  "Caixa pausada.": { es: "Buzón en pausa." },
  "Caixa retomada.": { es: "Buzón reanudado." },
  "Senha recusada": { es: "Contraseña rechazada" },
  "Intervalo entre envios": { es: "Intervalo entre envíos" },
  "Intervalo entre envios (segundos)": { es: "Intervalo entre envíos (segundos)" },
  "Assinatura": { es: "Firma" },
  "nenhuma": { es: "ninguna" },
  "Senha nova (deixe vazio para manter)": { es: "Contraseña nueva (déjalo vacío para mantener)" },
  "A leitura e o envio estão parados porque a senha foi recusada. Informe a senha nova em Configurar para voltar.": {
    es: "La lectura y el envío están detenidos porque la contraseña fue rechazada. Indica la contraseña nueva en Configurar para volver.",
  },
  "A leitura e o envio estão parados e as conversas ficam como estão. Ao retomar, a caixa continua de onde parou.": {
    es: "La lectura y el envío están detenidos y las conversaciones quedan como están. Al reanudar, el buzón continúa donde se quedó.",
  },
  "Retomar": { es: "Reanudar" },
  "A senha desta caixa foi recusada. Informe a senha nova para retomar.": {
    es: "La contraseña de este buzón fue rechazada. Indica la contraseña nueva para reanudar.",
  },
  // Conversa de e-mail no inbox (Fatia 6)
  "Ver com formatação": { es: "Ver con formato" },
  "Ocultar formatação": { es: "Ocultar formato" },
  "E-mail com formatação": { es: "Correo con formato" },
  "Baixar": { es: "Descargar" },
  "não foi guardado": { es: "no se guardó" },
  "1 anexo ficou de fora por ser grande demais.": { es: "1 adjunto quedó fuera por ser demasiado grande." },
  "{n} anexos ficaram de fora por serem grandes demais.": { es: "{n} adjuntos quedaron fuera por ser demasiado grandes." },
  "O anexo é grande demais para este canal: o limite é de {n} MB. Envie um arquivo menor.": {
    es: "El adjunto es demasiado grande para este canal: el límite es de {n} MB. Envía un archivo más pequeño.",
  },
  // Telas que faltam (Fatia 7)
  "Não foi possível guardar a senha com segurança neste servidor. Peça a quem instalou o sistema para conferir a chave de segurança e tente de novo.": { es: "No fue posible guardar la contraseña de forma segura en este servidor. Pide a quien instaló el sistema que revise la clave de seguridad e inténtalo de nuevo." },
  "Não foi possível remover a caixa agora. Tente de novo.": { es: "No fue posible quitar el buzón ahora. Inténtalo de nuevo." },
  "Caixa removida.": { es: "Buzón quitado." },
  "Remover caixa": { es: "Quitar buzón" },
  "Remover esta caixa de e-mail?": { es: "¿Quitar este buzón de correo?" },
  "O sistema para de ler e de enviar e-mails por esta caixa.": { es: "El sistema deja de leer y de enviar correos por este buzón." },
  "As conversas e as mensagens continuam no sistema.": { es: "Las conversaciones y los mensajes siguen en el sistema." },
  "A senha guardada é apagada.": { es: "La contraseña guardada se borra." },
  "Para voltar, conecte a caixa de novo com a senha.": { es: "Para volver, conecta el buzón de nuevo con la contraseña." },
  "Remover a caixa": { es: "Quitar el buzón" },
  "Parece uma lista de inscrição ou newsletter.": { es: "Parece una lista de suscripción o un boletín." },
  "Parece um envio em massa, como propaganda.": { es: "Parece un envío masivo, como publicidad." },
  "É uma resposta automática (por exemplo, de férias).": { es: "Es una respuesta automática (por ejemplo, de vacaciones)." },
  "Vem de um endereço que não recebe resposta (no-reply).": { es: "Viene de una dirección que no recibe respuestas (no-reply)." },
  "É um aviso de que um e-mail não foi entregue.": { es: "Es un aviso de que un correo no fue entregado." },
  "Foi enviado pela própria caixa.": { es: "Fue enviado por el propio buzón." },
  "Você marcou como não é cliente.": { es: "Lo marcaste como no es cliente." },
  "Não foi possível ler este e-mail.": { es: "No fue posible leer este correo." },
  "Não virou conversa.": { es: "No se convirtió en conversación." },
  "E-mail aberto como conversa.": { es: "Correo abierto como conversación." },
  "Não foi possível abrir este e-mail como conversa agora. Tente de novo.": { es: "No fue posible abrir este correo como conversación ahora. Inténtalo de nuevo." },
  "Pronto. Os próximos e-mails dessa pessoa serão deixados de fora.": { es: "Listo. Los próximos correos de esta persona se dejarán fuera." },
  "Não foi possível salvar agora. Tente de novo.": { es: "No fue posible guardar ahora. Inténtalo de nuevo." },
  "E-mails que não viraram conversa": { es: "Correos que no se convirtieron en conversación" },
  "Propaganda, respostas automáticas e avisos ficam aqui por 30 dias, só com remetente, assunto e data. Se algum for de um cliente de verdade, abra como conversa.": { es: "La publicidad, las respuestas automáticas y los avisos quedan aquí por 30 días, solo con remitente, asunto y fecha. Si alguno es de un cliente de verdad, ábrelo como conversación." },
  "Não foi possível carregar os e-mails deixados de fora.": { es: "No fue posible cargar los correos dejados fuera." },
  "Nenhum e-mail foi deixado de fora nos últimos 30 dias.": { es: "Ningún correo fue dejado fuera en los últimos 30 días." },
  "(sem assunto)": { es: "(sin asunto)" },
  "Abrir como conversa": { es: "Abrir como conversación" },
  "Não é cliente": { es: "No es cliente" },
  "Marcar esta pessoa como não é cliente?": { es: "¿Marcar a esta persona como no es cliente?" },
  "Os próximos e-mails dessa pessoa serão deixados de fora e não viram conversa. As conversas de e-mail dela serão arquivadas. Nada é apagado.": { es: "Los próximos correos de esta persona se dejarán fuera y no se vuelven conversación. Sus conversaciones de correo se archivarán. No se borra nada." },
  "Para desfazer, use Abrir como conversa em um e-mail dela nesta lista.": { es: "Para deshacer, usa Abrir como conversación en un correo suyo de esta lista." },
  "Marcar como não é cliente": { es: "Marcar como no es cliente" },
} as const;
