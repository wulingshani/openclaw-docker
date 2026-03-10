#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

AUTH_USER="${1:-admin}"
AUTH_PASS="${2:-openclaw2026}"
PORT="${3:-18789}"

echo ""
echo "  🦞 OpenClaw Docker Setup"
echo "  ────────────────────────"

# Generate secrets
GATEWAY_TOKEN=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)

# Write .env
cat > .env <<EOF
NGINX_AUTH_USER=${AUTH_USER}
NGINX_AUTH_PASS=${AUTH_PASS}
OPENCLAW_PORT=${PORT}
OPENCLAW_GATEWAY_TOKEN=${GATEWAY_TOKEN}
SESSION_SECRET=${SESSION_SECRET}
CLAUDE_AI_SESSION_KEY=
CLAUDE_WEB_SESSION_KEY=
CLAUDE_WEB_COOKIE=
EOF

# Create directories
mkdir -p data/config data/workspace

# Write gateway config
cat > data/config/openclaw.json <<'JSON'
{
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "controlUi": {
      "allowedOrigins": ["*"],
      "allowInsecureAuth": true,
      "dangerouslyDisableDeviceAuth": true
    }
  }
}
JSON

# Generate .htpasswd
docker run --rm httpd:alpine htpasswd -nbB "$AUTH_USER" "$AUTH_PASS" > nginx/.htpasswd

# Start
docker compose up -d

echo ""
echo "  ✅ Ready!  http://127.0.0.1:${PORT}/"
echo "  👤 User: ${AUTH_USER}  🔑 Pass: ${AUTH_PASS}"
echo ""
