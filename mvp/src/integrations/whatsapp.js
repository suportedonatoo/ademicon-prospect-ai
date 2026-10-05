// Contrato da integração com WhatsApp (ainda NÃO implementada).
//
// Quando for usar a WhatsApp Business Cloud API (ou um provedor como Z-API,
// Twilio, 360dialog), implemente esta interface num backend — nunca no navegador,
// pois exige tokens secretos:
//
//   connect(numberId)                 -> retorna QR code / status do pareamento
//   sendMessage(numberId, to, text)   -> envia mensagem
//   onMessage(handler)                -> webhook de mensagens recebidas
//   status(numberId)                  -> conectado / desconectado / erro
//
// O Gerenciador de WhatsApp (src/services/whatsapp.js) chamará estes métodos
// quando config.whatsappProvider deixar de ser 'mock'.

export const whatsappProvider = {
  name: 'mock',
  async connect() {
    return { status: 'simulado' };
  },
  async sendMessage(numberId, to, text) {
    console.info('[WhatsApp mock]', { numberId, to, text });
    return { ok: true, simulated: true };
  },
};
