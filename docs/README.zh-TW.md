# openclaw-docker

[English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

使用 Docker Compose 部署 [OpenClaw](https://openclaw.ai/)，整合 Nginx 反向代理、Web 管理面板和 Cookie 會話認證。

![login](https://img.shields.io/badge/認證-登入頁面-blue) ![docker](https://img.shields.io/badge/docker-compose-2496ED)

## 截圖

| 登入頁 | 管理面板 - 服務商列表 | 管理面板 - 新增服務商 |
|:------:|:-------------------:|:-------------------:|
| ![登入](../image/login.png) | ![列表](../image/admin-list.png) | ![新增](../image/admin-add.png) |

## 特色

- **一條指令部署** — `setup.sh` 自動完成所有設定
- **自訂登入頁面** — 告別醜陋的瀏覽器彈窗
- **Web 管理面板** — 在瀏覽器中管理 API 金鑰（`/admin`），無需手動編輯檔案
- **訊息渠道** — 對接飛書、釘釘、微信、QQ、Telegram、Discord、Slack（`/channels`）
- **飛書 SDK 長連線** — 基於 WebSocket，內網環境無需公網 IP
- **Cookie 會話** — 7 天自動過期，HttpOnly + SameSite 防護
- **Gateway Token 自動注入** — 登入即用，無需手動貼上 Token
- **多語言介面** — 簡體中文、繁體中文、英文、日文
- **設定自動產生** — `openclaw.json` 首次啟動時自動建立

## 架構

```
瀏覽器 → Nginx（登入 + 會話管理）→ OpenClaw Gateway（內部）
     → /admin                   → Admin API（金鑰管理）
     → /channels                → Channels API（訊息渠道）

飛書 ←WSClient 長連線→ Channels 服務 → AI 服務商 API
```

**啟動順序：** Admin + Channels → Gateway → Nginx（每個服務等待前一個健康後再啟動）

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

## API 金鑰管理

登入後造訪 **`/admin`**，透過 Web 介面管理 API 金鑰：

- 新增 / 編輯 / 刪除服務商（Anthropic、OpenAI、Google、SiliconFlow、自訂）
- 視覺化模型設定 — 無需編寫 JSON
- 修改後 Gateway 自動重啟
- 即時 Gateway 狀態指示

## 訊息渠道

登入後造訪 **`/channels`**，連接訊息平台：

- **支援平台：** 飛書、釘釘、微信、企業微信、QQ、Telegram、Discord、Slack
- **飛書 SDK 長連線** — 基於 WebSocket，內網環境無需公網回呼 URL
- 每個渠道可設定獨立的系統提示詞 — 自訂 AI 人格
- 多輪對話 — 按使用者維護上下文（20 條訊息，30 分鐘逾時）
- 自動讀取 `/admin` 中的 AI 服務商設定 — 無需重複設定金鑰
- 可獨立啟用 / 停用各渠道

## 設定

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
├── Dockerfile                 # 內建登入頁、管理頁和渠道頁的 Nginx 映像
├── docker-compose.yml         # 服務編排（5 個服務）
├── setup.sh                   # 一鍵部署腳本
├── .env.example               # 環境變數範本
├── admin/
│   └── server.js              # 管理 API 服務（Node.js，零依賴）
├── channels/
│   ├── server.js              # 渠道 API + 飛書 SDK 橋接
│   └── package.json           # 依賴（飛書 SDK）
├── nginx/
│   ├── default.conf.template  # Nginx 設定範本（envsubst 處理）
│   ├── login.html             # 自訂登入頁面
│   ├── admin.html             # API 金鑰管理頁面
│   └── channels.html          # 訊息渠道管理頁面
└── data/
    ├── config/                # Gateway + 渠道設定（持久化）
    └── workspace/             # 工作區檔案（持久化）
```

## 安全機制

| 層級 | 機制 |
|------|------|
| 登入 | Nginx Basic Auth（bcrypt 加密） |
| 會話 | HttpOnly Cookie，SameSite=Strict，7 天過期 |
| 管理 | 會話保護，與主應用使用相同的 Cookie 認證 |
| 閘道 | 基於 Token 的 WebSocket 認證（自動注入） |
| 網路 | Gateway 和 Admin 不直接暴露，僅 Nginx 連接埠對外 |

公開部署建議透過 Cloudflare Tunnel、Caddy 或 Traefik 加入 HTTPS。

## 作者

**wulingshan** — [GitHub](https://github.com/wulingshani) | [Gitee](https://gitee.com/luoyile_1)

## 授權條款

MIT
