#!/usr/bin/env bash
set -euo pipefail
ROOT="/var/lib/docker/volumes/autoflow_epico_afepico_backups/_data"
PROJECT_DIR="/docker/autoflow_epico"
RETENTION_DAYS=20
DATE="$(date +%Y-%m-%d)"
DEST="$ROOT/$DATE"
LOG="$ROOT/backup.log"
log(){ echo "[$(date "+%Y-%m-%d %H:%M:%S")] $*" | tee -a "$LOG"; }
log "==== INICIO backup $DATE ===="
mkdir -p "$DEST"/{code,compose,mongo,volumes}
log "Copiando codigo dos containers..."
docker cp afepico_api:/app/src "$DEST/code/api_src" 2>>"$LOG" || log "WARN api_src"
docker cp afepico_worker:/app/src "$DEST/code/worker_src" 2>>"$LOG" || log "WARN worker_src"
docker cp afepico_gateway:/app/src "$DEST/code/gateway_src" 2>>"$LOG" || log "WARN gateway_src"
docker cp afepico_web:/usr/share/nginx/html "$DEST/code/web_html" 2>>"$LOG" || log "WARN web_html"
log "Copiando compose/Dockerfiles/.env..."
cp -a "$PROJECT_DIR/docker-compose.yml" "$DEST/compose/" 2>>"$LOG" || log "WARN compose"
for d in api worker wa-gateway; do
  [ -f "$PROJECT_DIR/backend/$d/Dockerfile" ] && mkdir -p "$DEST/compose/$d" && cp -a "$PROJECT_DIR/backend/$d/Dockerfile" "$DEST/compose/$d/" 2>>"$LOG" || true
done
[ -f "$PROJECT_DIR/web/Dockerfile" ] && mkdir -p "$DEST/compose/web" && cp -a "$PROJECT_DIR/web/Dockerfile" "$DEST/compose/web/" 2>>"$LOG" || true
[ -f "$PROJECT_DIR/.env" ] && cp -a "$PROJECT_DIR/.env" "$DEST/compose/" 2>>"$LOG" || true
log "Dump do MongoDB (wa_admin)..."
docker exec afepico_mongo sh -c "mongodump --db=wa_admin --archive --gzip" > "$DEST/mongo/wa_admin.archive.gz" 2>>"$LOG" || log "WARN mongodump"
log "Backup volume wa_auth (sessao do WhatsApp)..."
docker run --rm -v autoflow_epico_afepico_wa_auth:/data -v "$DEST/volumes":/backup alpine sh -c "tar czf /backup/wa_auth.tar.gz -C /data ." 2>>"$LOG" || log "WARN wa_auth"
{
  echo "AutoFlow backup $DATE"; echo "gerado_em: $(date -Is)"; echo
  echo "== docker containers =="; docker ps --format "{{.Names}} {{.Image}} {{.Status}}"
  echo; echo "== tamanhos =="; du -sh "$DEST"/* 2>/dev/null
} > "$DEST/MANIFEST.txt" 2>>"$LOG"
log "Aplicando retencao de $RETENTION_DAYS dias..."
find "$ROOT" -maxdepth 1 -type d -name "20*-*-*" -mtime +$RETENTION_DAYS -print -exec rm -rf {} \; >>"$LOG" 2>&1 || true
TOTAL=$(du -sh "$DEST" 2>/dev/null | cut -f1)
log "==== FIM backup $DATE (tamanho: $TOTAL) ===="
