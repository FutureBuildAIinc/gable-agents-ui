#!/usr/bin/env bash
# Generates the staging environment file for fb-console-staging from the
# production Coolify environment store. Run on fb-deploy-1 as root.
#
# The output contains fresh secrets and inherited production values; it stays
# on the droplet (chmod 600) and is never committed anywhere.
#
# Usage: generate-staging-env.sh [output-path]
#        PROD_ENV=/path/to/prod/.env generate-staging-env.sh [output-path]
set -euo pipefail

PROD_ENV="${PROD_ENV:-/data/coolify/services/u0puccybt42qso5amainq4ov/.env}"
OUT="${1:-/opt/fb-console-staging/.env}"

rand() { openssl rand -hex 32; }

# Keys the staging layer overrides, blanks, or regenerates. They are removed
# from the passthrough so the appended staging block is authoritative and no
# key ever appears twice.
OVERRIDE_KEYS=(
  _APP_DOMAIN _APP_CONSOLE_DOMAIN _APP_DOMAIN_FUNCTIONS _APP_DOMAIN_SITES
  _APP_ENV _APP_WORKER_PER_CORE
  _APP_USAGE_STATS _APP_EMBEDDING _APP_DOCUMENTSDB _APP_VECTORSDB
  _APP_DB_ADAPTER _APP_DB_HOST _APP_REDIS_HOST _APP_DB_USER _APP_REDIS_PASS
  _APP_SMTP_HOST _APP_SMTP_PORT _APP_SMTP_SECURE _APP_SMTP_USERNAME _APP_SMTP_PASSWORD
  _APP_EXECUTOR_HOST _APP_BROWSER_HOST _APP_COMPUTE_RUNTIMES_NETWORK _APP_BUILDS_VOLUME
  _APP_SYSTEM_EMAIL_NAME _APP_SYSTEM_EMAIL_ADDRESS
  _APP_OPENSSL_KEY_V1 _APP_DB_ROOT_PASS _APP_DB_PASS _APP_USAGE_PASS
  _APP_EXECUTOR_SECRET _APP_JOBS_SECRET _APP_GEO_SECRET _APP_NOTIFICATIONS_TRACKING_SECRET
  _APP_IMAGE _APP_VERSION _APP_CONSOLE_IMAGE _APP_CONSOLE_VERSION
)

FILTER=""
for key in "${OVERRIDE_KEYS[@]}"; do
  FILTER="$FILTER -e ^${key}="
done

[ -f "$PROD_ENV" ] || { echo "production env not found: $PROD_ENV" >&2; exit 1; }
mkdir -p "$(dirname "$OUT")"

# Pass through every production _APP_* key the staging stack still uses.
grep -E '^_APP_' "$PROD_ENV" | grep -v $FILTER > "$OUT"

cat >> "$OUT" <<'OVERRIDES'
# staging layer (generated; secrets below are fresh for this stack)
_APP_ENV='production'
_APP_DOMAIN='api-staging.futurebuild.ai'
_APP_CONSOLE_DOMAIN='console-staging.futurebuild.ai'
_APP_DOMAIN_FUNCTIONS='functions-staging.futurebuild.ai'
_APP_DOMAIN_SITES='sites-staging.futurebuild.ai'
_APP_WORKER_PER_CORE='1'
_APP_USAGE_STATS='disabled'
_APP_EMBEDDING='disabled'
_APP_DOCUMENTSDB='disabled'
_APP_VECTORSDB='disabled'
_APP_DB_ADAPTER='postgresql'
_APP_DB_HOST='postgresql'
_APP_REDIS_HOST='redis'
# the compose redis runs without requirepass; keep the client password empty
_APP_REDIS_PASS=''
_APP_DB_USER='fbconsole'
# staging never sends mail: empty SMTP disables it entirely
_APP_SMTP_HOST=''
_APP_SMTP_PORT=''
_APP_SMTP_SECURE=''
_APP_SMTP_USERNAME=''
_APP_SMTP_PASSWORD=''
# no executor, browser, or runtimes network in the trimmed staging stack
_APP_EXECUTOR_HOST=''
_APP_BROWSER_HOST=''
_APP_COMPUTE_RUNTIMES_NETWORK=''
# set to <service-uuid>_appwrite-builds after the first start, see README
_APP_BUILDS_VOLUME=''
_APP_SYSTEM_EMAIL_NAME='FB Console'
_APP_SYSTEM_EMAIL_ADDRESS='staging@futurebuild.ai'
_APP_IMAGE='registry.digitalocean.com/futurebuild/fb-console'
_APP_VERSION='2.1.0-fb.2'
_APP_CONSOLE_IMAGE='registry.digitalocean.com/futurebuild/fb-console-ui'
_APP_CONSOLE_VERSION='1.1.78-fb.4'
OVERRIDES

cat >> "$OUT" <<SECRETS
# fresh secrets for this stack only, never shared with production
_APP_OPENSSL_KEY_V1='$(rand)'
_APP_DB_ROOT_PASS='$(rand)'
_APP_DB_PASS='$(rand)'
_APP_USAGE_PASS='$(rand)'
_APP_EXECUTOR_SECRET='$(rand)'
_APP_JOBS_SECRET='$(rand)'
_APP_GEO_SECRET='$(rand)'
_APP_NOTIFICATIONS_TRACKING_SECRET='$(rand)'
SECRETS

chmod 600 "$OUT"
echo "wrote $OUT ($(grep -c . "$OUT") lines)"
