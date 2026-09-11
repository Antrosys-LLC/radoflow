#!/usr/bin/env bash
#
# Configures the RadoFlow ADMS relay on the VPS so the three factory terminals
# can push to it — and nothing else can.
#
# Run on the VPS as root, from wherever rado-relay.mjs was copied:
#
#   scp scripts/rado-relay.mjs scripts/configure-relay.sh root@148.230.66.172:/opt/radoflow/
#   ssh root@148.230.66.172 "bash /opt/radoflow/configure-relay.sh"
#
# Safe to run more than once. It changes three things and reports on each:
# the relay's settings file, the systemd service, and the firewall.
#
# The shared secret is deliberately NOT set here. It must be byte-identical to
# DEVICE_INGEST_SECRET on Railway, so the one already in the settings file is
# kept. A fresh one would make every push return 401.

set -euo pipefail

# The factory's public static IP — what the VPS sees a terminal's connection
# arriving from. Not a 192.168.1.x address: those never leave the factory LAN.
FACTORY_IP="182.191.119.76"
UPSTREAM="https://radoflow-production.up.railway.app"
PORT="8080"

ENV_FILE="/etc/radoflow-relay.env"
UNIT_FILE="/etc/systemd/system/rado-relay.service"
RELAY_JS="/opt/radoflow/rado-relay.mjs"

step() { printf '\n== %s\n' "$1"; }
ok()   { printf '   ok  %s\n' "$1"; }
die()  { printf '   FAIL %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root"

step "Prerequisites"
NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || die "node is not installed (see MB460-PUSH-VPS.md, step 2)"
ok "node $($NODE_BIN -v) at $NODE_BIN"
[ -f "$RELAY_JS" ] || die "$RELAY_JS is missing — copy scripts/rado-relay.mjs there first"
ok "relay script present"

step "Settings ($ENV_FILE)"
EXISTING_SECRET=""
if [ -f "$ENV_FILE" ]; then
  EXISTING_SECRET="$(grep -E '^RELAY_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
  ok "backed up the previous file"
fi
# Refuse rather than invent one. A made-up secret here does not fail loudly on
# this box; it fails as a 401 on every punch, visible only in the relay log.
[ -n "$EXISTING_SECRET" ] || die "no RELAY_SECRET in $ENV_FILE — add RELAY_SECRET=<DEVICE_INGEST_SECRET from Railway> and re-run"

umask 077
cat > "$ENV_FILE" <<EOF
RELAY_UPSTREAM=$UPSTREAM
RELAY_SECRET=$EXISTING_SECRET
RELAY_PORT=$PORT
RELAY_ALLOWED_IPS=$FACTORY_IP
EOF
chmod 600 "$ENV_FILE"
ok "upstream  $UPSTREAM"
ok "port      $PORT"
ok "allowlist $FACTORY_IP"
ok "secret    kept from the previous file (${#EXISTING_SECRET} characters)"

step "Service ($UNIT_FILE)"
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=RadoFlow ADMS relay
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=$NODE_BIN $RELAY_JS
Restart=always
RestartSec=5
EnvironmentFile=$ENV_FILE

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable rado-relay >/dev/null 2>&1
systemctl restart rado-relay
sleep 2
systemctl is-active --quiet rado-relay || { journalctl -u rado-relay -n 20 --no-pager; die "relay did not start"; }
ok "rado-relay is running"

step "Firewall (ufw)"
command -v ufw >/dev/null || apt-get install -y ufw >/dev/null
# SSH first, so enabling the firewall can never lock this session out.
ufw allow 22/tcp >/dev/null
# nginx serves radofactory.online on these. Enabling ufw without them would
# take the site down the moment this script finishes.
ufw allow 80/tcp  >/dev/null
ufw allow 443/tcp >/dev/null
# Any rule opening 8080 to everyone defeats the allowlist, so remove it.
while ufw status | grep -qE "^$PORT(/tcp)?\s+ALLOW\s+Anywhere"; do
  ufw delete allow "$PORT/tcp" >/dev/null 2>&1 || ufw delete allow "$PORT" >/dev/null 2>&1 || break
done
# So does a rule for any other single address. A factory that has changed ISP
# or IP leaves its old address behind, and that address is reassigned to a
# stranger — who then reaches the relay through a hole nobody remembers
# opening. The relay's own allowlist would still refuse them, but the firewall
# is the layer that holds if that file is ever edited wrong.
ufw status | awk -v port="$PORT" '$1 ~ "^"port"(/tcp)?$" && $2 == "ALLOW" && $3 != "Anywhere" { print $3 }' \
  | sort -u | while read -r stale; do
    [ "$stale" = "$FACTORY_IP" ] && continue
    ufw delete allow from "$stale" to any port "$PORT" proto tcp >/dev/null 2>&1 \
      && ok "removed stale $PORT rule for $stale"
  done
ufw allow from "$FACTORY_IP" to any port "$PORT" proto tcp >/dev/null
ufw --force enable >/dev/null
ok "22, 80, 443 open; $PORT open only to $FACTORY_IP"

step "Checks"
HEALTH="$(curl -s --max-time 5 "http://127.0.0.1:$PORT/health" || true)"
[ "$HEALTH" = "relay ok" ] && ok "relay answers /health" || die "relay /health returned: ${HEALTH:-nothing}"
UP="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$UPSTREAM/api/health" || true)"
[ "$UP" = "200" ] && ok "VPS can reach Railway ($UP)" || die "VPS cannot reach $UPSTREAM (got ${UP:-no answer})"

printf '\nPort %s rules:\n' "$PORT"; ufw status | grep -E "^$PORT" || true
printf '\nDone. Watch terminals arrive with:\n  journalctl -u rado-relay -f\n'
