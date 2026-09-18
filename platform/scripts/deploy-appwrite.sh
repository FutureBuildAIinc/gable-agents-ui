#!/usr/bin/env bash
# Deploys the gable-agents-ui event backbone into an Appwrite project.
# Idempotent: safe to re-run. Requires a project API key with scopes:
#   databases.(read|write), collections.(read|write), documents.(read|write),
#   functions.(read|write), executions.(read|write)
#
# Usage:
#   APPWRITE_ENDPOINT=https://api.futurebuild.ai \
#   APPWRITE_PROJECT_ID=<project id> \
#   APPWRITE_API_KEY=<standard_... key with scopes above> \
#   EVENTS_INGEST_KEY=<shared secret gable will send> \
#   ./deploy-appwrite.sh
set -euo pipefail

ENDPOINT="${APPWRITE_ENDPOINT:-https://api.futurebuild.ai}"
PROJECT="${APPWRITE_PROJECT_ID:?set APPWRITE_PROJECT_ID}"
KEY="${APPWRITE_API_KEY:?set APPWRITE_API_KEY}"
INGEST_KEY="${EVENTS_INGEST_KEY:?set EVENTS_INGEST_KEY (the X-Events-Key gable will send)}"
DB=platform
COLL=events
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

api() { # api METHOD PATH [JSON_BODY]
  local method=$1 path=$2 body=${3:-}
  if [ -n "$body" ]; then
    curl -sS -X "$method" -H "X-Appwrite-Key: $KEY" -H "X-Appwrite-Project: $PROJECT" \
      -H "Content-Type: application/json" -d "$body" "$ENDPOINT$path"
  else
    curl -sS -X "$method" -H "X-Appwrite-Key: $KEY" -H "X-Appwrite-Project: $PROJECT" \
      "$ENDPOINT$path"
  fi
}

jget() { python3 -c "import json,sys;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }

echo "==> probing key scopes"
probe=$(api GET /v1/databases | head -c 200)
case "$probe" in *user_unauthorized*|*401*)
  echo "FATAL: key rejected for project $PROJECT (unauthorized). The key likely has no scopes." >&2
  exit 1;; esac
echo "    key OK"

echo "==> database $DB"
api POST /v1/databases "{\"databaseId\":\"$DB\",\"name\":\"platform\"}" >/dev/null 2>&1 || true

echo "==> collection $COLL"
api POST "/v1/databases/$DB/collections" "{\"collectionId\":\"$COLL\",\"name\":\"events\",\"documentSecurity\":false,\"enabled\":true}" >/dev/null 2>&1 || true

echo "==> attributes"
for attr in \
  'eventId string 64 true' 'type string 64 true' 'org string 128 true' \
  'branchId string 64 false' 'entityKind string 32 true' 'entityId string 64 true' \
  'data string 8192 false' 'at string 40 true'; do
  set -- $attr; key=$1; type=$2; size=$3; req=$4
  api POST "/v1/databases/$DB/collections/$COLL/attributes/$type" \
    "{\"key\":\"$key\",\"size\":$size,\"required\":$req}" >/dev/null 2>&1 || true
done
echo "    waiting for attributes to process"
sleep 8

echo "==> indexes"
api POST "/v1/databases/$DB/collections/$COLL/indexes" \
  '{"key":"cursor","type":"key","attributes":["$createdAt"],"orders":["ASC"]}' >/dev/null 2>&1 || true
api POST "/v1/databases/$DB/collections/$COLL/indexes" \
  '{"key":"org_type","type":"key","attributes":["org","type"],"orders":["ASC","ASC"]}' >/dev/null 2>&1 || true

runtime=$(api GET /v1/functions/runtimes | python3 -c "
import json,sys
rts=json.load(sys.stdin).get('runtimes',[])
go=[r for r in rts if r['\$id'].startswith('go')]
print(go[0]['\$id'] if go else '')")
[ -n "$runtime" ] || { echo "FATAL: could not resolve Go runtime (functions.read scope needed)" >&2; exit 1; }
echo "==> runtime: $runtime"

deploy_function() { # deploy_function DIR FUNCTION_ID NAME [EVENTS_JSON]
  local dir=$1 fid=$2 name=$3 events=${4:-}
  echo "==> function $fid"
  api POST /v1/functions "{\"functionId\":\"$fid\",\"name\":\"$name\",\"runtime\":\"$runtime\",\"execute\":[\"any\"]${events:+,\"events\":$events}}" >/dev/null 2>&1 || \
    api PATCH "/v1/functions/$fid" "{\"execute\":[\"any\"]${events:+,\"events\":$events}}" >/dev/null 2>&1 || true
  # env vars
  while IFS='=' read -r k v; do
    [ -n "$k" ] || continue
    api POST "/v1/functions/$fid/variables" "{\"key\":\"$k\",\"value\":\"$v\"}" >/dev/null 2>&1 || true
  done < "${dir}/.env.deploy"
  # tarball + upload
  tar -czf /tmp/$fid.tar.gz -C "$dir" .
  curl -sS -X POST -H "X-Appwrite-Key: $KEY" -H "X-Appwrite-Project: $PROJECT" \
    -F "code=@/tmp/$fid.tar.gz" -F "activate=true" -F "entrypoint=src/main.go" \
    "$ENDPOINT/v1/functions/$fid/deployments" >/dev/null
  rm -f /tmp/$fid.tar.gz
  echo "    deployed"
}

ING_DIR="$REPO_ROOT/platform/functions/events-ingest"
FAN_DIR="$REPO_ROOT/platform/functions/events-fanout"

cat > "$ING_DIR/.env.deploy" <<EOF
EVENTS_INGEST_KEY=$INGEST_KEY
APPWRITE_ENDPOINT=$ENDPOINT
APPWRITE_PROJECT_ID=$PROJECT
APPWRITE_API_KEY=$KEY
APPWRITE_DATABASE=$DB
APPWRITE_COLLECTION=$COLL
EOF
cat > "$FAN_DIR/.env.deploy" <<EOF
SUBSCRIBER_WEBHOOKS=[]
EOF

deploy_function "$ING_DIR" events-ingest "events-ingest" ""
deploy_function "$FAN_DIR" events-fanout "events-fanout" '["databases.platform.collections.events.documents.*.create"]'

rm -f "$ING_DIR/.env.deploy" "$FAN_DIR/.env.deploy"

echo "==> smoke test: POST a probe event"
fid=$(api GET /v1/functions | jget "['functions'][0]['\$id']")
exec_res=$(api POST "/v1/functions/events-ingest/executions" \
  "{\"data\":\"{\\\"type\\\":\\\"probe.pinged\\\",\\\"org\\\":\\\"experiments\\\",\\\"entity\\\":{\\\"kind\\\":\\\"probe\\\",\\\"id\\\":\\\"0\\\"}}\"}")
echo "    execution: $(echo "$exec_res" | head -c 200)"
sleep 6
echo "==> documents in $DB.$COLL:"
api GET "/v1/databases/$DB/collections/$COLL/documents?limit(5)" | python3 -c "
import json,sys
d=json.load(sys.stdin)
docs=d.get('documents',[])
print(f'    total={d.get(\"total\",len(docs))}')
for doc in docs[:5]: print('   ', doc.get('type'), doc.get('org'), doc.get('at'))"
echo "==> done. gable env: APPWRITE_EVENTS_URL=<function domain or executions endpoint>, APPWRITE_EVENTS_KEY=<X-Events-Key>, APPWRITE_ORG=<org slug>"
