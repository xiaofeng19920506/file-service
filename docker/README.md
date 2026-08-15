# 飞牛 NAS + frontend.youtvs.com / api.youtvs.com

把桌面上的 **file-service-nas** 文件夹拷到飞牛，用该文件夹创建 Compose。`.env` 已经按 NAS 改好，不要再拷本机 localhost 那份。

```bash
docker compose up -d --build
```

第一次构建要等较久。局域网：`http://飞牛IP:4000`

数据在软件存储的 `data/`：postgres、redis、storage。

Cloudflare 隧道 `file-service-api` 的公共主机名改成：

- `frontend.youtvs.com` → HTTP → `http://web:4000`
- `api.youtvs.com` → HTTP → `http://api:3000`

不要再用 `http://127.0.0.1:3000` / `:4000`。
