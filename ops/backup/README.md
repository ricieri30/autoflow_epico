# Backup e Restauracao - AutoFlow EPICO

Sistema de backup manual, completo e externo (baixavel), para desastres ou migracao de servidor.

## O que e capturado
- Codigo em execucao nos containers (referencia; a fonte real e o GitHub)
- docker-compose.yml, Dockerfiles e .env
- Dump completo do MongoDB (banco wa_admin)
- Sessao do WhatsApp (volume wa_auth) - necessaria para nao precisar reconectar via QR Code

## Como usar (interface)
1. Acesse o menu "Backup" no AutoFlow (pagina /backup.html, exige admin).
2. Clique em "Fazer backup agora". Executa em ate ~1 min (via cron).
3. Clique em "Baixar" na linha do backup para salvar o arquivo .tar.gz no seu computador (ou onde preferir - Google Drive, pendrive, etc). Este passo e o que garante que o backup fica fora do servidor, protegendo contra perda total da VPS.

## Restauracao a partir do zero (novo servidor)
1. Suba o docker-compose.yml normal (mongo, redis, api, worker, gateway, web) no servidor novo.
2. Copie o .tar.gz baixado para dentro da pasta apontada por BACKUP_DIR (ver scripts) e extraia.
3. Rode manualmente: bash restore.sh <YYYY-MM-DD> all
4. Reinicie o container do gateway (WhatsApp) apos restaurar a sessao.

## Seguranca da sessao do WhatsApp
Copiar/restaurar os arquivos de sessao (wa_auth) NAO tem contato com os servidores do WhatsApp e nao gera risco de bloqueio - e apenas copia de arquivo. O risco de bloqueio existe ao ESCANEAR um novo QR Code (novo aparelho vinculado) ou padroes de bot agressivos. Restaurar a sessao antiga e mais seguro que reconectar do zero.

## Arquivos
- backup.sh - gera o backup completo (roda no host via cron as 05:00 BRT ou sob demanda).
- restore.sh - restaura codigo/mongo/wa_auth de uma data especifica.
- watch_requests.sh - observa pedidos vindos da tela (roda a cada minuto via cron), conecta a UI aos scripts acima.

## Historico da correcao (2026-07-07)
Os 3 scripts estavam copiados de um projeto antigo (nomes de containers/volumes/paths diferentes) e nunca funcionaram de fato neste stack. Foram corrigidos para: containers afepico_api/worker/gateway/web/mongo, volume autoflow_epico_afepico_wa_auth, pasta /docker/autoflow_epico. Tambem foi adicionado o endpoint GET /api/backup/download e o botao "Baixar" na tela, que antes nao existiam - sem eles o backup ficava preso dentro da propria VPS.
