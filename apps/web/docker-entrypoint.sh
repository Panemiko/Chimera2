#!/bin/sh
# Gera /__config.js com o VITE_SERVER_URL do ambiente (compose) a cada
# subida do container. Assim o IP do server troca sem rebuild da web.
set -eu
CONFIG_FILE="/app/apps/web/build/client/__config.js"
if [ -d "$(dirname "$CONFIG_FILE")" ]; then
  VITE_SERVER_URL="${VITE_SERVER_URL:-http://localhost:3000}" node -e \
    "const fs=require('fs');const f=process.argv[1];const u=process.env.VITE_SERVER_URL;fs.writeFileSync(f,'window.__APP_CONFIG__='+JSON.stringify({serverUrl:u})+';\n');" \
    "$CONFIG_FILE"
fi
exec "$@"
