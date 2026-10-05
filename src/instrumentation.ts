// Hook de inicialização do Next.js. O código Node fica em arquivo separado
// (padrão recomendado para não ser empacotado no runtime Edge).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
