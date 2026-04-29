#!/bin/sh
# Inject environment variables into index.html at container startup

HTML=/usr/share/nginx/html/index.html

# Warn if the required Emby URL is missing
if [ -z "${EMBY_SERVER_URL}" ]; then
  echo "WARNING: EMBY_SERVER_URL is not set — the app will load with an empty server URL." >&2
fi

# Replace placeholders with env var values (empty string if not set)
sed -i "s|__EMBY_SERVER_URL__|${EMBY_SERVER_URL:-}|g"   "$HTML"
sed -i "s|__EMBY_API_KEY__|${EMBY_API_KEY:-}|g"         "$HTML"
sed -i "s|__EMBY_USERNAME__|${EMBY_USERNAME:-}|g"        "$HTML"
sed -i "s|__EMBY_PASSWORD__|${EMBY_PASSWORD:-}|g"        "$HTML"
sed -i "s|__RADARR_URL__|${RADARR_URL:-}|g"             "$HTML"
sed -i "s|__RADARR_API_KEY__|${RADARR_API_KEY:-}|g"     "$HTML"
sed -i "s|__SONARR_URL__|${SONARR_URL:-}|g"             "$HTML"
sed -i "s|__SONARR_API_KEY__|${SONARR_API_KEY:-}|g"     "$HTML"

# Start nginx
exec nginx -g "daemon off;"
