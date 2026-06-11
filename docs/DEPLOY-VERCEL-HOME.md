# 部署：Vercel 前端 + 家里服务器后端

```
Vercel（React 静态站）
    │  HTTPS  /v1/*
    ▼
家里服务器（Docker）
    ├── API（Fastify :3000）
    ├── Worker（LibreOffice + 合并）
    ├── Postgres
    └── Redis
```

前端与 API **不同源**，前端构建时必须设置 `VITE_API_URL` 指向家里暴露的 API 地址。

---

## 一、家里服务器

### 1. 准备 `.env`

在项目根目录复制并编辑：

```bash
cp .env.example .env
```

**生产必改项：**

```env
# 下载签名、用户登录 token 共用，至少 16 位随机字符
DOWNLOAD_HMAC_SECRET=换成长随机串

# Vercel 前端域名（CORS + 分享邮件链接）
CORS_ORIGIN=https://你的项目.vercel.app
WEB_APP_URL=https://你的项目.vercel.app

# 家里 API 对外 HTTPS 地址（Cloudflare Tunnel 或反代后的域名）
PUBLIC_BASE_URL=https://api.你的域名.com

# 可选：全局 API Key
# API_KEY=...
```

`docker-compose.backend.prod.yml` 已内置 Postgres / Redis 连接，**不要把 5432、6379 映射到公网**。

### 2. 启动后端栈

```bash
docker compose -f docker-compose.backend.prod.yml up --build -d
```

包含：`postgres`、`redis`、`api`、`worker`（含 LibreOffice）。

检查：

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
```

### 3. 暴露 API 到公网（推荐 Cloudflare Tunnel）

家里一般没有固定公网 IP，**不要用裸端口转发**，建议：

1. [Cloudflare](https://dash.cloudflare.com) 添加域名
2. 家里装 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
3. 创建 Tunnel，把 `api.你的域名.com` → `http://localhost:3000`

这样自动有 HTTPS，无需在家里的路由器开端口。

**备选：** 路由器端口转发 + 动态 DNS + Nginx/Caddy 配 TLS（维护成本更高）。

### 4. 家里服务器注意

| 项 | 说明 |
|----|------|
| 断电/休眠 | API 和合并会停；需要 24/7 可接 UPS 或接受间歇不可用 |
| 磁盘 | `file_storage` volume 存上传文件，定期备份 |
| 密码 | 改掉 compose 里默认的 `fileservice/fileservice`（改 `docker-compose.backend.prod.yml` + `DATABASE_URL`） |
| 内存 | Worker 限制约 1.5GB，合并时较吃内存 |

---

## 二、Vercel 前端

### 1. 导入项目

1. [vercel.com](https://vercel.com) → Import GitHub 仓库
2. **Root Directory**：`apps/web`
3. Framework：Vite（会读取 `vercel.json`）

### 2. 环境变量（Environment Variables）

| 变量 | 值 | 说明 |
|------|-----|------|
| `VITE_API_URL` | `https://api.你的域名.com` | **必填**，不要末尾 `/` |
| `VITE_API_KEY` | 与家里 `API_KEY` 相同 | 仅当后端启用了全局 API Key |

### 3. 部署

Deploy 后访问 `https://你的项目.vercel.app`，登录/上传应请求家里的 API。

### 4. 自定义域名（可选）

Vercel 项目 Settings → Domains 绑定 `app.你的域名.com`，然后回家里的 `.env` 更新：

```env
CORS_ORIGIN=https://app.你的域名.com
WEB_APP_URL=https://app.你的域名.com
```

重启 API 容器使 CORS 生效。

---

## 三、部署后自检

1. 浏览器打开 Vercel 站点 → 注册/登录
2. DevTools → Network：请求应发往 `https://api.你的域名.com/v1/...`
3. 若 CORS 报错：核对 `CORS_ORIGIN` 与浏览器地址栏**完全一致**（含 `https://`）
4. 上传 `.pptx`、创建合并任务 → 确认家里 Worker 日志有处理记录
5. 列表分享邮件：需配置 `SMTP_*` 和 `WEB_APP_URL`

---

## 四、常见问题

**登录成功但接口 401**  
检查 `DOWNLOAD_HMAC_SECRET` 家里是否固定；改 secret 会使已发 token 失效。

**合并一直 pending**  
家里 `worker` 容器是否在跑：`docker compose -f docker-compose.backend.prod.yml logs worker`

**Vercel 改了 `VITE_API_URL` 不生效**  
环境变量在**构建时**注入，改完后要在 Vercel 重新 Deploy。

**只想内网用、不暴露公网**  
前端也可不放 Vercel，家里用 `docker-compose.prod.yml` 一体部署；本方案适合「外网访问前端、后端放家里」。

---

## 五、相关文件

| 文件 | 用途 |
|------|------|
| `docker-compose.backend.prod.yml` | 家里只跑后端 |
| `apps/web/vercel.json` | Vercel SPA 路由 |
| `.env.example` | 环境变量说明 |
