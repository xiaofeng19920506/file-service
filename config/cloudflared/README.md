# Cloudflare 命名隧道

固定 API 地址（例如 `https://api.example.com`），重启隧道后**不变**。

## 快速开始

```bash
# 1. 在 .env 填写（把 example.com 换成你的域名）
CLOUDFLARE_TUNNEL_HOSTNAME=api.example.com
# 可选
# CLOUDFLARE_TUNNEL_NAME=file-service-api
# TUNNEL_TARGET=http://127.0.0.1:3000

# 2. 登录 Cloudflare（浏览器选 zone，只需一次）
npm run tunnel:login

# 3. 创建隧道 + 绑定 DNS
npm run tunnel:setup

# 4. 启动 API 后启动隧道
npm run dev:api-audio    # 或你的 API 进程
npm run tunnel:run

# 5. 同步 URL 到 App
npm run tunnel:sync-env
cd ../worship-player && npm run ios
```

## 控制台 Token 模式（可选）

在 [Zero Trust → Tunnels](https://one.dash.cloudflare.com/) 创建隧道并配置 Public Hostname 后：

```env
CLOUDFLARE_TUNNEL_TOKEN=eyJ...
CLOUDFLARE_TUNNEL_HOSTNAME=api.example.com
```

然后 `npm run tunnel:run` 即可，无需 `tunnel:login`。

## Mac 开机自启（LaunchAgent → bash 脚本）

| 服务 | bash 脚本 |
|------|-----------|
| API + Worker + Docker | `scripts/autostart/api-stack.sh` |
| Cloudflare 隧道 | `scripts/autostart/tunnel.sh` |

```bash
npm run tunnel:install-launchagent      # 安装 API + 隧道（推荐）
npm run tunnel:launchagent-status       # 查看状态
npm run api:autostart                   # 手动启动 API 栈
npm run tunnel:autostart                # 手动启动隧道
npm run tunnel:uninstall-launchagent    # 全部卸载
```

安装后文件在 `~/Library/Application Support/com.fileservice/`。

**前置条件：**
1. Docker Desktop → 设置 → 勾选 **登录时打开**
2. 仓库在 Desktop 时若自启失败，将项目移到 `~/Projects` 或给 `/bin/bash` **完全磁盘访问权限**

## 与 Quick Tunnel 区别

| 命令 | 地址 | 稳定 |
|------|------|------|
| `npm run tunnel:start` | `*.trycloudflare.com` | ❌ |
| `npm run tunnel:run` | `api.你的域名.com` | ✅ |

生成文件在 `data/cloudflared/`（已 gitignore）。
