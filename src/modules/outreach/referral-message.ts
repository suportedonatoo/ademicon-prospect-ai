/**
 * Mensagem que o consultor manda para quem vai indicar. Fica fora do componente de cliente
 * porque é usada também na página (servidor) — função de módulo 'use client' não roda no servidor.
 */
export const referralMessage = (who: string, url: string) =>
  `Oi, ${who.split(/\s+/)[0]}! Obrigado pela confiança 😊\nSe alguém que você conhece pensa em comprar imóvel, carro ou moto, pode me indicar? É só mandar este link — a pessoa faz uma simulação grátis e eu cuido do atendimento:\n${url}`;
