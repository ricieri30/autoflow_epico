#!/usr/bin/env bash
# Observa pedidos da interface (flag-files) e executa no host.
set -euo pipefail
SCRIPT_DIR="/root/autoflow_backups"
DATA_ROOT="/var/lib/docker/volumes/autoflow_epico_afepico_backups/_data"
REQ="$DATA_ROOT/requests"
mkdir -p "$REQ"
log(){ echo "[$(date "+%F %T")] $*" >> "$SCRIPT_DIR/cron.log"; }

for f in "$REQ"/run_*.req; do
  [ -e "$f" ] || continue
  log "pedido de backup manual: $(basename "$f")"
  S="$REQ/$(basename "$f").status"; echo running > "$S"
  if /bin/bash "$SCRIPT_DIR/backup.sh" >> "$SCRIPT_DIR/cron.log" 2>&1; then echo done > "$S"; else echo error > "$S"; fi
  rm -f "$f"
done

for f in "$REQ"/restore_*.restore; do
  [ -e "$f" ] || continue
  DATE=$(grep -E "^date=" "$f" | head -1 | cut -d= -f2)
  TGT=$(grep -E "^target=" "$f" | head -1 | cut -d= -f2)
  log "pedido de RESTAURACAO: data=$DATE alvo=$TGT ($(basename "$f"))"
  S="$REQ/$(basename "$f").status"; echo running > "$S"
  log "  -> backup de seguranca do estado atual antes de restaurar..."
  /bin/bash "$SCRIPT_DIR/backup.sh" >> "$SCRIPT_DIR/cron.log" 2>&1 || log "  WARN backup de seguranca falhou"
  if printf "CONFIRMO\n" | /bin/bash "$SCRIPT_DIR/restore.sh" "$DATE" "$TGT" >> "$SCRIPT_DIR/cron.log" 2>&1; then
    echo done > "$S"; log "  -> restauracao concluida ($DATE/$TGT)"
  else
    echo error > "$S"; log "  -> restauracao FALHOU ($DATE/$TGT)"
  fi
  rm -f "$f"
done
