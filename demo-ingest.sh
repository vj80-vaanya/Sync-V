#!/bin/bash
# =============================================================
#  Sync-V Live Log Ingestion Demo
#  Simulates Drive → Mobile → Cloud pipeline via API
# =============================================================

API="http://localhost:3000"
SEP="─────────────────────────────────────────────────────"

# Helper: extract JSON field without jq
json_field() {
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);process.stdout.write(String(j.$1||''))}catch(e){process.stdout.write(d)}})"
}
json_pretty() {
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.stringify(JSON.parse(d),null,2))}catch(e){console.log(d)}})"
}

echo ""
echo "$SEP"
echo "  SYNC-V LIVE INGESTION DEMO"
echo "$SEP"
echo ""

# ── Phase 1: Authenticate ──────────────────────────────────
echo "[Phase 1] Authenticating as admin..."
LOGIN_RESP=$(curl -s -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo "$LOGIN_RESP" | json_field token)
if [ -z "$TOKEN" ]; then
  echo "  FAILED to login!"
  echo "$LOGIN_RESP"
  exit 1
fi
echo "  OK - JWT token acquired (${TOKEN:0:20}...)"
echo ""

# ── Phase 2: Fetch device inventory ────────────────────────
echo "[Phase 2] Fetching fleet inventory..."
DEVICES=$(curl -s "$API/api/devices" -H "Authorization: Bearer $TOKEN")
echo "$DEVICES" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    const devs=JSON.parse(d);
    console.log('  Found '+devs.length+' devices:');
    devs.forEach(d=>console.log('    '+d.name.padEnd(12)+' | '+d.status.padEnd(8)+' | fw '+d.firmware_version));
  })"
echo ""

# Get first device ID for ingestion
PUMP1_ID=$(echo "$DEVICES" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).find(d=>d.name==='PUMP-001').id))")
MOTOR1_ID=$(echo "$DEVICES" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).find(d=>d.name==='MOTOR-001').id))")

# ── Phase 3: Simulate Drive log collection ─────────────────
echo "[Phase 3] Simulating Drive-side log collection..."
echo ""

# Log 1: PUMP-001 pressure readings
LOG1_CONTENT="[2026-02-24T08:00:00Z] PUMP-001 pressure=43.2psi temp=64.8F flow=130.1gpm
[2026-02-24T08:05:00Z] PUMP-001 pressure=43.5psi temp=65.0F flow=129.8gpm
[2026-02-24T08:10:00Z] PUMP-001 pressure=42.9psi temp=65.1F flow=130.5gpm
[2026-02-24T08:15:00Z] PUMP-001 pressure=44.1psi temp=65.3F flow=128.7gpm
[2026-02-24T08:20:00Z] PUMP-001 WARN: pressure spike +1.2psi in 5min"
LOG1_FILE="pump001-pressure-live-$(date +%s).log"

# Log 2: PUMP-001 vibration alert
LOG2_CONTENT="[2026-02-24T09:00:00Z] PUMP-001 vibration_x=0.05mm vibration_y=0.03mm rpm=1480
[2026-02-24T09:01:00Z] PUMP-001 vibration_x=0.12mm vibration_y=0.08mm rpm=1475
[2026-02-24T09:01:30Z] PUMP-001 ALERT: vibration threshold exceeded x=0.12mm (max=0.10mm)
[2026-02-24T09:02:00Z] PUMP-001 vibration_x=0.07mm vibration_y=0.04mm rpm=1470
[2026-02-24T09:02:30Z] PUMP-001 vibration stabilized - returning to normal"
LOG2_FILE="pump001-vibration-alert-$(date +%s).log"

# Log 3: MOTOR-001 thermal snapshot
LOG3_CONTENT="[2026-02-24T08:30:00Z] MOTOR-001 bearing_temp=76.2C winding_temp=89.5C ambient=23.8C
[2026-02-24T08:35:00Z] MOTOR-001 bearing_temp=77.1C winding_temp=90.8C ambient=23.9C
[2026-02-24T08:40:00Z] MOTOR-001 bearing_temp=78.8C winding_temp=93.2C ambient=24.0C
[2026-02-24T08:45:00Z] MOTOR-001 WARN: winding temp approaching limit (max=100C)"
LOG3_FILE="motor001-thermal-live-$(date +%s).log"

LOGS=("$LOG1_CONTENT" "$LOG2_CONTENT" "$LOG3_CONTENT")
FILES=("$LOG1_FILE" "$LOG2_FILE" "$LOG3_FILE")
DEVIDS=("$PUMP1_ID" "$PUMP1_ID" "$MOTOR1_ID")
DEVNAMES=("PUMP-001" "PUMP-001" "MOTOR-001")

echo "  Collected 3 log files from Drive simulator"
echo ""

# ── Phase 4: Upload logs (Mobile → Cloud) ──────────────────
echo "[Phase 4] Uploading logs to Cloud (simulating Mobile relay)..."
echo ""

UPLOADED_IDS=()

for i in 0 1 2; do
  CONTENT="${LOGS[$i]}"
  FNAME="${FILES[$i]}"
  DEVID="${DEVIDS[$i]}"
  DEVNAME="${DEVNAMES[$i]}"

  # Compute checksum and size
  CHECKSUM=$(echo -n "$CONTENT" | sha256sum | cut -d' ' -f1)
  SIZE=${#CONTENT}

  # Escape content for JSON
  RAW_JSON=$(echo -n "$CONTENT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(d)))")

  echo "  [$((i+1))/3] Uploading: $FNAME"
  echo "        Device:   $DEVNAME ($DEVID)"
  echo "        Size:     $SIZE bytes"
  echo "        SHA256:   ${CHECKSUM:0:16}..."

  RESP=$(curl -s -X POST "$API/api/logs" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"deviceId\": \"$DEVID\",
      \"filename\": \"$FNAME\",
      \"size\": $SIZE,
      \"checksum\": \"$CHECKSUM\",
      \"rawData\": $RAW_JSON,
      \"metadata\": {\"source\":\"drive-simulator\",\"format\":\"text\",\"demo\":true}
    }")

  LOG_ID=$(echo "$RESP" | json_field logId)
  if [ -n "$LOG_ID" ]; then
    echo "        Result:   OK (logId: ${LOG_ID:0:8}...)"
    UPLOADED_IDS+=("$LOG_ID|$CHECKSUM")
  else
    echo "        Result:   $RESP"
  fi
  echo ""
done

# ── Phase 5: Verify integrity ──────────────────────────────
echo "[Phase 5] Verifying log integrity (checksum validation)..."
echo ""

for entry in "${UPLOADED_IDS[@]}"; do
  IFS='|' read -r LID LCHECK <<< "$entry"
  VERIFY=$(curl -s "$API/api/logs/verify/$LID?checksum=$LCHECK" \
    -H "Authorization: Bearer $TOKEN")
  VALID=$(echo "$VERIFY" | json_field valid)
  echo "  Log ${LID:0:8}... integrity: $VALID"
done
echo ""

# ── Phase 6: Query ingested data ───────────────────────────
echo "[Phase 6] Querying ingested logs from Cloud..."
echo ""

echo "  All logs for PUMP-001:"
curl -s "$API/api/logs/device/$PUMP1_ID" \
  -H "Authorization: Bearer $TOKEN" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    const logs=JSON.parse(d);
    logs.forEach(l=>console.log('    '+l.filename.padEnd(45)+' | '+l.size+'B | '+l.uploaded_at));
  })"

echo ""
echo "  All logs for MOTOR-001:"
curl -s "$API/api/logs/device/$MOTOR1_ID" \
  -H "Authorization: Bearer $TOKEN" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    const logs=JSON.parse(d);
    logs.forEach(l=>console.log('    '+l.filename.padEnd(45)+' | '+l.size+'B | '+l.uploaded_at));
  })"

echo ""
echo "$SEP"
echo "  DEMO COMPLETE - 3 logs ingested and verified"
echo "$SEP"
echo ""
