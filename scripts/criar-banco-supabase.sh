#!/bin/bash
# Cria as tabelas e o banco do piloto no Supabase, lendo .env.supabase.
# Uso: bash scripts/criar-banco-supabase.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env.supabase; set +a

case "$DATABASE_URL" in
  *SEU_ID*|*SUA_SENHA*) echo "Preencha a DATABASE_URL em .env.supabase antes de rodar."; exit 1 ;;
  *supabase.com*) ;;
  *) echo "A DATABASE_URL não aponta para o Supabase; nada foi feito."; exit 1 ;;
esac
case "$PILOTO_SUPERADMINS$PILOTO_ADMIN$PILOTO_UNIDADE" in
  *voce@empresa.com*|*gestor@unidade.com*|*"Nome da unidade"*) echo "Preencha os campos PILOTO_* em .env.supabase antes de rodar."; exit 1 ;;
esac

echo "1/2 Criando as tabelas…"
npx prisma migrate deploy
echo "2/2 Criando a estrutura do piloto…"
# As variáveis exportadas acima têm prioridade sobre as do .env local.
out=$(mktemp)
trap 'rm -f "$out"' EXIT
npx tsx --env-file=.env scripts/preparar-piloto.ts | tee "$out"
echo
if grep -q "Banco do piloto pronto" "$out"; then
  echo "Pronto. Guarde agora as senhas provisórias e a LANDING_SERVICE_API_KEY mostradas acima: elas não aparecem de novo."
else
  echo "Nada foi alterado: o banco do piloto já existia. As senhas e a chave só apareceram na primeira execução."
fi
