# 飞牛 NAS + `frontend.youtvs.com`

Postgres、Redis、MP3 缓存都写在 Compose 项目目录下的 `data/`，也就是飞牛给这个应用选的**软件存储**，不会只存在容器里。

外网走 Cloudflare Tunnel：`https://frontend.youtvs.com` → 容器 `web:4000`。

## 1. 在飞牛上部署

1. 把本仓库放到飞牛能访问的目录（或在 Docker Compose 里选本文件夹）
2. 复制环境文件（NAS 专用，不是本机那份 localhost 配置）：

```bash
cp docker/env.example .env
```

3. 改 `.env` 里的 `DOWNLOAD_HMAC_SECRET`（至少 16 位）。YouTube / SMTP 密钥从你原来的本机 `.env` 拷过来即可，不要改 `DATABASE_URL`、`LOCAL_STORAGE_DIR`、`CORS_ORIGIN`。
4. 启动应用（先不带隧道也可以局域网测）：

```bash
docker compose up -d postgres redis api worker web
```

局域网：`http://飞牛IP:4000`

数据目录：

| 路径 | 内容 |
|------|------|
| `data/postgres` | 数据库 |
| `data/redis` | Redis |
| `data/storage` | MP3 / 上传文件 |

## 2. 绑 `frontend.youtvs.com`（单独一条隧道）

不要和飞牛后台（5666）共用「host 网络」那条隧道，否则 `http://web:4000` 和 `http://127.0.0.1:5666` 会互相打到错误的连接器。

1. Cloudflare Zero Trust → **连接网络** → **通过 Tunnel 连接** / **隧道**
2. **创建隧道** → **Cloudflared**，名称填 `file-service`
3. 安装方式选 Docker，复制 `--token` 到 NAS 上 `.env` 的 `CLOUDFLARE_TUNNEL_TOKEN`
4. **添加公共主机名**（两条）：
   - `frontend` + `youtvs.com` → HTTP → `http://web:4000`
   - `api` + `youtvs.com` → HTTP → `http://api:3000`
5. 启动隧道容器：

```bash
docker compose --profile tunnel up -d tunnel
```

6. 隧道状态变绿后打开：`https://frontend.youtvs.com`

若这个域名以前指向你电脑上的 `:4000`，把旧隧道里 `frontend.youtvs.com` 那条主机名删掉或改掉，只留 NAS 这条。

## 3. 访问控制（建议）

Zero Trust → **访问控制** → 添加应用程序 → **自托管**

- 域名：`frontend.youtvs.com`
- 只允许你的邮箱
