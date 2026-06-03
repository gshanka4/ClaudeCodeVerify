#!/usr/bin/env bash
# Local stack smoke (MVP-SMK-01 dev analogue). Requires API on :4000 with dev auth.
set -euo pipefail
API="${API_BASE_URL:-http://localhost:4000}"

echo "→ healthz"
curl -sf "$API/healthz" | head -c 200
echo ""

echo "→ provision dev user"
PROV=$(curl -sf -X POST "$API/__dev__/provision")
CLERK=$(echo "$PROV" | python3 -c "import sys,json; print(json.load(sys.stdin)['clerkId'])")
echo "  clerkId=$CLERK"

echo "→ start interrogation"
START=$(curl -sf -X POST "$API/api/interrogate/start" \
  -H "Authorization: Bearer $CLERK" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Build a payment gateway handling 10k RPS with PCI compliance and multi-region AWS deployment.","importType":"text"}')
SESSION=$(echo "$START" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['sessionId'])")
QID=$(echo "$START" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['firstQuestion']['id'])")
echo "  sessionId=$SESSION"

for i in 1 2 3; do
  ANS=$(curl -sf -X POST "$API/api/interrogate/$SESSION/answer" \
    -H "Authorization: Bearer $CLERK" \
    -H "Content-Type: application/json" \
    -d "{\"questionId\":\"$QID\",\"selectedOptionId\":\"scale-a\"}")
  NEXT=$(echo "$ANS" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d.get('nextQuestion',{}).get('id',''))")
  if [ -z "$NEXT" ] || [ "$NEXT" = "None" ]; then break; fi
  QID=$NEXT
done

echo "→ generate"
GEN=$(curl -sf -X POST "$API/api/generate/start" \
  -H "Authorization: Bearer $CLERK" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION\"}")
ARCH=$(echo "$GEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['architectureId'])")
echo "  architectureId=$ARCH"

echo "→ wait for ready (poll)"
for _ in $(seq 1 60); do
  DET=$(curl -sf "$API/api/architectures/$ARCH" -H "Authorization: Bearer $CLERK")
  STATUS=$(echo "$DET" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])")
  if [ "$STATUS" = "ready" ]; then break; fi
  sleep 0.5
done
echo "  status=$STATUS"

echo "→ lock + export + workspace"
curl -sf -X POST "$API/api/architectures/$ARCH/lock" -H "Authorization: Bearer $CLERK" >/dev/null
curl -sf -X POST "$API/api/architectures/$ARCH/export" \
  -H "Authorization: Bearer $CLERK" \
  -H "Content-Type: application/json" \
  -d '{"format":"cursor-config"}' >/dev/null
REG=$(curl -sf -X POST "$API/api/cursor/workspaces" \
  -H "Authorization: Bearer $CLERK" \
  -H "Content-Type: application/json" \
  -d "{\"architectureId\":\"$ARCH\",\"workspacePath\":\"/tmp/local-smoke\"}")
TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['apiToken'])")

echo "→ drift check"
DRIFT=$(curl -sf -X POST "$API/api/drift/check" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"architectureId\":\"$ARCH\",\"filePath\":\"src/smoke.ts\",\"fileContent\":\"import pool from '../user-db/client';\\n\"}")
COUNT=$(echo "$DRIFT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['drifts']))")
echo "  drifts=$COUNT"

echo "✓ Local full-loop smoke passed"
