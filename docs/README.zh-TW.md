# openclaw-docker

[English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

使用 Docker Compose 部署 [OpenClaw](https://openclaw.ai/)，整合 Nginx 反向代理、自訂登入頁面和 Cookie 會話認證。

![login](https://img.shields.io/badge/認證-登入頁面-blue) ![docker](https://img.shields.io/badge/docker-compose-2496ED)

## 特色

- **一條指令部署** — `setup.sh` 自動完成所有設定
- **自訂登入頁面** — 告別醜陋的瀏覽器彈窗
- **Cookie 會話** — 7 天自動過期，HttpOnly + SameSite 防護
- **Gateway Token 自動注入** — 登入即用，無需手動貼上 Token
- **開箱即用** — 跳過裝置配對，部署完成直接使用

## 架構

```
瀏覽器 → Nginx（登入 + 會話管理）→ OpenClaw Gateway（內部）
```

## 下載

| 來源 | 地址 |
|------|------|
| GitHub | `git clone https://github.com/wulingshani/openclaw-docker.git` |
| Gitee | `git clone https://gitee.com/luoyile_1/openclaw-docker.git` |

## 快速開始

```bash
cd openclaw-docker
chmod +x setup.sh
./setup.sh
```

開啟 **http://127.0.0.1:18789/** — 預設帳號：`admin` / `openclaw2026`

自訂帳號密碼：

```bash
./setup.sh <使用者名稱> <密碼> <連接埠>
./setup.sh admin MyPass123 8080
```

## 設定

### AI 服務金鑰

部署後編輯 `.env`：

```env
CLAUDE_AI_SESSION_KEY=your_key_here
```

重新啟動生效：

```bash
docker compose restart openclaw-gateway
```

### 變更登入密碼

```bash
# 產生新的密碼雜湊
docker run --rm httpd:alpine htpasswd -nbB 新使用者 新密碼 > nginx/.htpasswd

# 編輯 .env（修改 NGINX_AUTH_USER 和 NGINX_AUTH_PASS）

# 重新啟動 Nginx
docker compose restart nginx
```

### 登出

造訪 `/auth/logout` 清除會話。

## 常用指令

```bash
docker compose logs -f                  # 檢視日誌
docker compose restart                  # 重新啟動所有服務
docker compose down                     # 停止所有服務
docker compose pull && docker compose up -d  # 更新映像

# CLI 工具（按需執行）
docker compose --profile cli run --rm openclaw-cli dashboard --no-open
docker compose --profile cli run --rm openclaw-cli devices list
```

## 專案結構

```
├── Dockerfile                 # 內建登入頁面的 Nginx 映像
├── docker-compose.yml         # 服務編排
├── setup.sh                   # 一鍵部署腳本
├── .env.example               # 環境變數範本
├── nginx/
│   ├── default.conf.template  # Nginx 設定範本（envsubst 處理）
│   └── login.html             # 自訂登入頁面
└── data/
    ├── config/                # Gateway 設定（持久化）
    └── workspace/             # 工作區檔案（持久化）
```

## 安全機制

| 層級 | 機制 |
|------|------|
| 登入 | Nginx Basic Auth（bcrypt 加密） |
| 會話 | HttpOnly Cookie，SameSite=Strict，7 天過期 |
| 閘道 | 基於 Token 的 WebSocket 認證（自動注入） |
| 網路 | Gateway 不直接暴露，僅 Nginx 連接埠對外 |

公開部署建議透過 Cloudflare Tunnel、Caddy 或 Traefik 加入 HTTPS。

## 授權條款

MIT
