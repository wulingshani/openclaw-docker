# openclaw-docker

[English](../README.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md)

使用 Docker Compose 部署 [OpenClaw](https://openclaw.ai/)，集成 Nginx 反向代理、自定义登录页面和 Cookie 会话认证。

![login](https://img.shields.io/badge/认证-登录页面-blue) ![docker](https://img.shields.io/badge/docker-compose-2496ED)

## 特性

- **一条命令部署** — `setup.sh` 自动完成所有配置
- **自定义登录页面** — 告别丑陋的浏览器弹窗
- **Cookie 会话** — 7 天自动过期，HttpOnly + SameSite 防护
- **Gateway Token 自动注入** — 登录即用，无需手动粘贴 Token
- **开箱即用** — 跳过设备配对，部署完成直接使用

## 架构

```
浏览器 → Nginx（登录 + 会话管理）→ OpenClaw Gateway（内部）
```

## 快速开始

```bash
git clone https://github.com/wulingshani/openclaw-docker.git
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

## 配置

### AI 服务密钥

部署后编辑 `.env`：

```env
CLAUDE_AI_SESSION_KEY=your_key_here
```

重启生效：

```bash
docker compose restart openclaw-gateway
```

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
├── Dockerfile                 # 内置登录页面的 Nginx 镜像
├── docker-compose.yml         # 服务编排
├── setup.sh                   # 一键部署脚本
├── .env.example               # 环境变量模板
├── nginx/
│   ├── default.conf.template  # Nginx 配置模板（envsubst 处理）
│   └── login.html             # 自定义登录页面
└── data/
    ├── config/                # Gateway 配置（持久化）
    └── workspace/             # 工作区文件（持久化）
```

## 安全机制

| 层级 | 机制 |
|------|------|
| 登录 | Nginx Basic Auth（bcrypt 加密） |
| 会话 | HttpOnly Cookie，SameSite=Strict，7 天过期 |
| 网关 | 基于 Token 的 WebSocket 认证（自动注入） |
| 网络 | Gateway 不直接暴露，仅 Nginx 端口对外 |

公网部署建议通过 Cloudflare Tunnel、Caddy 或 Traefik 添加 HTTPS。

## 许可证

MIT
