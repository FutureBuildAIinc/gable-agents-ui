#!/usr/bin/env bash
# Deploys the gable-agents-ui event backbone into an Appwrite project.
# Idempotent: safe to re-run. Requires a project API key with scopes:
#   databases.(read|write), collections.(read|write), documents.(read|write)
#   (functions.* optional — Phase 2 only)
#
# Usage:
#   APPWRITE_ENDPOINT=https://api.futurebuild.ai \
#   APPWRITE_PROJECT_ID=<project id> \
#   APPWRITE_API_KEY=<standard_... key with scopes above> \
#   ./deploy-appwrite.sh
#
# NOTE 2026-09-17: this instance's open-runtimes executor fails every function
# build with "Build produced no output artifact" (source-independent; even a
# cache-miss hello-world failed). The events-ingest/events-fanout functions
# (kept in platform/functions/) are parked as Phase 2 webhook fanout until an
# operator fixes the executor. The backbone runs WITHOUT functions: gable's
# eventpub writes documents directly; Realtime and cursor-polling work
# natively on the collection.
set -euo pipefail

ENDPOINT="${APPWRITE_ENDPOINT:-https://api.futurebuild.ai}"
PROJECT="${APPWRITE_PROJECT_ID:?set APPWRITE_PROJECT_ID}"
KEY="${APPWRITE_API_KEY:?set APPWRITE_API_KEY}"
DB=platform
COLL=events

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

echo "==> probing key scopes"
probe=$(api GET /v1/databases | head -c 200)
case "$probe" in *user_unauthorized*|*unauthorized_scope*|*401*)
  echo "FATAL: key rejected for project $PROJECT (unauthorized). The key lacks database scopes." >&2
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
  set -- $attr; akey=$1; atype=$2; asize=$3; areq=$4
  api POST "/v1/databases/$DB/collections/$COLL/attributes/$atype" \
    "{\"key\":\"$akey\",\"size\":$asize,\"required\":$areq}" >/dev/null 2>&1 || true
done
echo "    waiting for attributes to process"
sleep 8

echo "==> indexes"
api POST "/v1/databases/$DB/collections/$COLL/indexes" \
  '{"key":"cursor","type":"key","attributes":["$createdAt"],"orders":["ASC"]}' >/dev/null 2>&1 || true
api POST "/v1/databases/$DB/collections/$COLL/indexes" \
  '{"key":"org_type","type":"key","attributes":["org","type"],"orders":["ASC","ASC"]}' >/dev/null 2>&1 || true

echo "==> smoke test: direct document write (the gable eventpub contract)"
EV_ID=$(python3 -c "import uuid;print(uuid.uuid4())")
AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PROBE_BODY=$(python3 -c "import json,sys;print(json.dumps({'documentId':'unique()','data':{'eventId':sys.argv[1],'type':'probe.pinged','org':'experiments','branchId':'','entityKind':'probe','entityId':'0','data':'{}','at':sys.argv[2]}}))" "$EV_ID" "$AT")
code=$(curl -sS -o /tmp/probe-resp.json -w "%{http_code}" -X POST \
  -H "X-Appwrite-Key: $KEY" -H "X-Appwrite-Project: $PROJECT" -H "Content-Type: application/json" \
  -d "$PROBE_BODY" "$ENDPOINT/v1/databases/$DB/collections/$COLL/documents")
echo "    create: HTTP $code"
if [ "$code" != "201" ]; then
  echo "    $(head -c 250 /tmp/probe-resp.json)"
  echo "FATAL: document write failed — the key needs documents.write scope" >&2
  exit 1
fi
rm -f /tmp/probe-resp.json

echo "==> documents in $DB.$COLL (the consumer poll shape):"
api GET "/v1/databases/$DB/collections/$COLL/documents?limit(5)" | python3 -c "
import json,sys
d=json.load(sys.stdin)
docs=d.get('documents',[])
print('    total=%s' % d.get('total', len(docs)))
for doc in docs[:5]: print('   ', doc.get('type'), doc.get('org'), doc.get('at'))"

echo "==> done. gable env: APPWRITE_EVENTS_KEY=<Appwrite key w/ documents.write>,"
echo "    APPWRITE_PROJECT_ID=$PROJECT, APPWRITE_ORG=<org slug>"
echo "    (APPWRITE_EVENTS_URL optional — defaults to the platform collection endpoint)"
