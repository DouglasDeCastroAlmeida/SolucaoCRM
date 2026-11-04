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
} as const;
