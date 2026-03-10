# openclaw-docker

[简体中文](docs/README.zh-CN.md) | [繁體中文](docs/README.zh-TW.md) | [日本語](docs/README.ja.md)

Docker Compose deployment for [OpenClaw](https://openclaw.ai/) with Nginx reverse proxy, custom login page, and cookie-based authentication.

![login](https://img.shields.io/badge/auth-login_page-blue) ![docker](https://img.shields.io/badge/docker-compose-2496ED)

## Features

- **One-command deploy** — `setup.sh` handles everything
- **Custom login page** — no ugly browser popups
- **Cookie session** — 7-day auto-expiry, HttpOnly + SameSite protection
- **Gateway token auto-inject** — login and go, no manual token pasting
- **Pre-configured** — skips device pairing, works out of the box

## Architecture

```
Browser → Nginx (login + session) → OpenClaw Gateway (internal)
```

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

## Configuration

### AI Provider Keys

Edit `.env` after setup:

```env
CLAUDE_AI_SESSION_KEY=your_key_here
```

Then restart:

```bash
docker compose restart openclaw-gateway
```

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
├── Dockerfile                 # Nginx image with login page baked in
├── docker-compose.yml         # Service orchestration
├── setup.sh                   # One-command setup script
├── .env.example               # Environment template
├── nginx/
│   ├── default.conf.template  # Nginx config (envsubst processed)
│   └── login.html             # Custom login page
└── data/
    ├── config/                # Gateway config (persistent)
    └── workspace/             # Agent workspace (persistent)
```

## Security

| Layer | Mechanism |
|-------|-----------|
| Login | Nginx Basic Auth (bcrypt) |
| Session | HttpOnly cookie, SameSite=Strict, 7-day expiry |
| Gateway | Token-based WebSocket auth (auto-injected) |
| Network | Gateway not exposed; only Nginx port published |

For public deployment, add HTTPS via Cloudflare Tunnel, Caddy, or Traefik.

## License

MIT
