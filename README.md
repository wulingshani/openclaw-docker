# openclaw-docker

[简体中文](docs/README.zh-CN.md) | [繁體中文](docs/README.zh-TW.md) | [日本語](docs/README.ja.md)

Docker Compose deployment for [OpenClaw](https://openclaw.ai/) with Nginx reverse proxy, web admin panel, and cookie-based authentication.

![login](https://img.shields.io/badge/auth-login_page-blue) ![docker](https://img.shields.io/badge/docker-compose-2496ED)

## Features

- **One-command deploy** — `setup.sh` handles everything
- **Custom login page** — no ugly browser popups
- **Web admin panel** — manage API keys in browser at `/admin`, no manual file editing
- **Cookie session** — 7-day auto-expiry, HttpOnly + SameSite protection
- **Gateway token auto-inject** — login and go, no manual token pasting
- **Multi-language UI** — Chinese (Simplified/Traditional), English, Japanese
- **Auto config generation** — `openclaw.json` created automatically on first start

## Architecture

```
Browser → Nginx (login + session) → OpenClaw Gateway (internal)
       → /admin                   → Admin API (key management)
```

**Startup order:** Admin → Gateway → Nginx (each waits for the previous to be healthy)

## Download

| Source | URL |
|--------|-----|
| GitHub | `git clone https://github.com/wulingshani/openclaw-docker.git` |
| Gitee | `git clone https://gitee.com/luoyile_1/openclaw-docker.git` |

## Quick Start

```bash
cd openclaw-docker
chmod +x setup.sh
./setup.sh
```

Open **http://127.0.0.1:18789/** — default login: `admin` / `openclaw2026`

Custom credentials:

```bash
./setup.sh <username> <password> <port>
./setup.sh admin MyPass123 8080
```

## API Key Management

After login, visit **`/admin`** to manage API keys through the web interface:

- Add / edit / delete providers (Anthropic, OpenAI, Google, SiliconFlow, custom)
- Visual model configuration — no JSON editing needed
- Gateway auto-restarts after changes
- Real-time gateway status indicator

## Configuration

### Change Login Credentials

```bash
# Generate new password hash
docker run --rm httpd:alpine htpasswd -nbB newuser newpass > nginx/.htpasswd

# Update .env (change NGINX_AUTH_USER and NGINX_AUTH_PASS)

# Restart
docker compose restart nginx
```

### Logout

Visit `/auth/logout` to clear the session.

## Commands

```bash
docker compose logs -f                  # View logs
docker compose restart                  # Restart all
docker compose down                     # Stop all
docker compose pull && docker compose up -d  # Update

# CLI tool (on-demand)
docker compose --profile cli run --rm openclaw-cli dashboard --no-open
docker compose --profile cli run --rm openclaw-cli devices list
```

## Project Structure

```
├── Dockerfile                 # Nginx image with login + admin pages
├── docker-compose.yml         # Service orchestration (4 services)
├── setup.sh                   # One-command setup script
├── .env.example               # Environment template
├── admin/
│   └── server.js              # Admin API server (Node.js, zero dependencies)
├── nginx/
│   ├── default.conf.template  # Nginx config (envsubst processed)
│   ├── login.html             # Custom login page
│   └── admin.html             # API key management page
└── data/
    ├── config/                # Gateway config (auto-generated, persistent)
    └── workspace/             # Agent workspace (persistent)
```

## Security

| Layer | Mechanism |
|-------|-----------|
| Login | Nginx Basic Auth (bcrypt) |
| Session | HttpOnly cookie, SameSite=Strict, 7-day expiry |
| Admin | Session-protected, same cookie auth as main app |
| Gateway | Token-based WebSocket auth (auto-injected) |
| Network | Gateway & Admin not exposed; only Nginx port published |

For public deployment, add HTTPS via Cloudflare Tunnel, Caddy, or Traefik.

## License

MIT
