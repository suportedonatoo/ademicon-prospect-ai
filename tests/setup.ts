// Executado antes de cada arquivo de teste: aponta para o banco de teste e força a fila inline.
try {
  process.loadEnvFile?.('.env');
} catch {
  /* CI define as variáveis diretamente */
}
const base = new URL(process.env.DATABASE_URL ?? 'postgresql://prospect:prospect_dev_password@localhost:5434/prospect');
base.pathname = '/prospect_test';
process.env.DATABASE_URL = base.toString();
process.env.QUEUE_DRIVER = 'inline';
process.env.AI_PROVIDER = 'mock';
process.env.APP_ENV = 'test';
