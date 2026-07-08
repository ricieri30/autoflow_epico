#!/usr/bin/env bash
# AutoFlow EPICO - Restauracao MANUAL de um backup interno
# Uso: ./restore.sh <YYYY-MM-DD> [code|mongo|wa_auth|all]
set -euo pipefail
ROOT="/var/lib/docker/volumes/autoflow_epico_afepico_backups/_data"
DATE="${1:-}"
WHAT="${2:-all}"

if [ -z "$DATE" ]; then
  echo "Backups disponiveis:"; ls -1d "$ROOT"/20*-*-* 2>/dev/null | xargs -n1 basename
  echo; echo "Uso: $0 <YYYY-MM-DD> [code|mongo|wa_auth|all]"
  exit 1
fi

SRC="$ROOT/$DATE"

restore_code(){
  echo ">> Restaurando codigo (referencia via docker cp)..."
  [ -d "$SRC/code/api_src" ] && docker cp "$SRC/code/api_src/." afepico_api:/app/src 2>/dev/null || echo "  AVISO: sem snapshot de api_src"
  [ -d "$SRC/code/worker_src" ] && docker cp "$SRC/code/worker_src/." afepico_worker:/app/src 2>/dev/null || echo "  AVISO: sem snapshot de worker_src"
  [ -d "$SRC/code/gateway_src" ] && docker cp "$SRC/code/gateway_src/." afepico_gateway:/app/src 2>/dev/null || echo "  AVISO: sem snapshot de gateway_src"
  echo "  NOTA: codigo real e controlado pelo GitHub; isto e so referencia. Reinicie os containers para efeito completo."
}

restore_mongo(){
  echo ">> Restaurando MongoDB (wa_admin) - drop + restore..."
  cat "$SRC/mongo/wa_admin.archive.gz" | docker exec -i afepico_mongo sh -c "mongorestore --archive --gzip --drop --nsInclude=wa_admin.*"
}

restore_wa_auth(){
  echo ">> Restaurando sessao WhatsApp (wa_auth)..."
  docker run --rm -v autoflow_epico_afepico_wa_auth:/data -v "$SRC/volumes":/backup alpine sh -c "find /data -mindepth 1 -delete; tar xzf /backup/wa_auth.tar.gz -C /data"
  docker restart afepico_gateway >/dev/null
}

case "$WHAT" in
  code) restore_code ;;
  mongo) restore_mongo ;;
  wa_auth) restore_wa_auth ;;
  all) restore_code; restore_mongo; restore_wa_auth ;;
  *) echo "Alvo invalido: $WHAT"; exit 1 ;;
esac
echo "== Restauracao concluida ($DATE / $WHAT). Verifique a aplicacao. =="
