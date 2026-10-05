// Configuração central do MVP.
// Quando as integrações reais chegarem, basta trocar os "providers" aqui:
//   dataProvider: 'local'  -> 'api'   (banco de dados real via backend)
//   whatsappProvider: 'mock' -> 'cloud-api' (WhatsApp Business API)
//   chatbotProvider: 'scripted' -> 'ai' (IA real)
export const config = {
  appName: 'Vela Inbound',
  companyName: 'Vela Crédito & Consórcio',
  dataProvider: 'local',
  whatsappProvider: 'mock',
  chatbotProvider: 'scripted',
  creditApiProvider: 'mock',
  apiBaseUrl: '/api', // usado quando dataProvider = 'api'
  storagePrefix: 'vela:v1:',
  maxWhatsappNumbers: 10,
  // Distribuição: 'round-robin' agora; no futuro 'weighted', 'by-region', 'by-product'...
  distributionStrategy: 'round-robin',
};
