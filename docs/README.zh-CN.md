# openclaw-docker

[English](../README.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md)

使用 Docker Compose 部署 [OpenClaw](https://openclaw.ai/)，集成 Nginx 反向代理、Web 管理面板和 Cookie 会话认证。

![login](https://img.shields.io/badge/认证-登录页面-blue) ![docker](https://img.shields.io/badge/docker-compose-2496ED)

## 特性

- **一条命令部署** — `setup.sh` 自动完成所有配置
- **自定义登录页面** — 告别丑陋的浏览器弹窗
- **Web 管理面板** — 在浏览器中管理 API 密钥（`/admin`），无需手动编辑文件
- **Cookie 会话** — 7 天自动过期，HttpOnly + SameSite 防护
- **Gateway Token 自动注入** — 登录即用，无需手动粘贴 Token
- **多语言界面** — 简体中文、繁体中文、英文、日文
- **配置自动生成** — `openclaw.json` 首次启动时自动创建

## 架构

```
浏览器 → Nginx（登录 + 会话管理）→ OpenClaw Gateway（内部）
     → /admin                   → Admin API（密钥管理）
```

**启动顺序：** Admin → Gateway → Nginx（每个服务等待前一个健康后再启动）

## 下载

| 来源 | 地址 |
|------|------|
| GitHub | `git clone https://github.com/wulingshani/openclaw-docker.git` |
| Gitee | `git clone https://gitee.com/luoyile_1/openclaw-docker.git` |

## 快速开始

```bash
cd openclaw-docker
chmod +x setup.sh
./setup.sh
```

打开 **http://127.0.0.1:18789/** — 默认账号：`admin` / `openclaw2026`

自定义账号密码：

```bash
./setup.sh <用户名> <密码> <端口>
./setup.sh admin MyPass123 8080
```

## API 密钥管理

登录后访问 **`/admin`**，通过 Web 界面管理 API 密钥：

- 添加 / 编辑 / 删除服务商（Anthropic、OpenAI、Google、SiliconFlow、自定义）
- 可视化模型配置 — 无需编写 JSON
- 修改后 Gateway 自动重启
- 实时 Gateway 状态指示

## 配置

### 修改登录密码

```bash
# 生成新的密码哈希
docker run --rm httpd:alpine htpasswd -nbB 新用户名 新密码 > nginx/.htpasswd

# 编辑 .env（修改 NGINX_AUTH_USER 和 NGINX_AUTH_PASS）

# 重启 Nginx
docker compose restart nginx
```

### 退出登录

访问 `/auth/logout` 清除会话。

## 常用命令

```bash
docker compose logs -f                  # 查看日志
docker compose restart                  # 重启所有服务
docker compose down                     # 停止所有服务
docker compose pull && docker compose up -d  # 更新镜像

# CLI 工具（按需运行）
docker compose --profile cli run --rm openclaw-cli dashboard --no-open
docker compose --profile cli run --rm openclaw-cli devices list
```

## 项目结构

```
├── Dockerfile                 # 内置登录页和管理页的 Nginx 镜像
├── docker-compose.yml         # 服务编排（4 个服务）
├── setup.sh                   # 一键部署脚本
├── .env.example               # 环境变量模板
├── admin/
│   └── server.js              # 管理 API 服务（Node.js，零依赖）
├── nginx/
│   ├── default.conf.template  # Nginx 配置模板（envsubst 处理）
│   ├── login.html             # 自定义登录页面
│   └── admin.html             # API 密钥管理页面
└── data/
    ├── config/                # Gateway 配置（自动生成，持久化）
    └── workspace/             # 工作区文件（持久化）
```

## 安全机制

| 层级 | 机制 |
|------|------|
| 登录 | Nginx Basic Auth（bcrypt 加密） |
| 会话 | HttpOnly Cookie，SameSite=Strict，7 天过期 |
| 管理 | 会话保护，与主应用使用相同的 Cookie 认证 |
| 网关 | 基于 Token 的 WebSocket 认证（自动注入） |
| 网络 | Gateway 和 Admin 不直接暴露，仅 Nginx 端口对外 |

公网部署建议通过 Cloudflare Tunnel、Caddy 或 Traefik 添加 HTTPS。

## 许可证

MIT
