// Contrato da integração com IA (ainda NÃO implementada).
//
// Hoje os chatbots usam fluxos pré-configurados (src/services/chatbot.js).
// Para usar IA real, implemente reply() num backend (a chave da API nunca
// deve ficar no navegador) e troque config.chatbotProvider para 'ai'.
// O motor de chat continuará recebendo o mesmo formato:
//   { messages: [...texto do bot], options: [...botões sugeridos], actions: [...] }

export const aiProvider = {
  name: 'scripted',
  async reply(/* { bot, lead, history, userMessage } */) {
    throw new Error('IA real ainda não configurada — usando fluxos pré-configurados.');
  },
};
