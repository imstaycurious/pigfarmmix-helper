# 后台提醒配置

当前代码已经支持把浏览器 Push 订阅和「养成中」记录写入 D1。真正按时推送通知还需要下一步的 Cron Worker 扫描 D1 并发送 Web Push。

## Cloudflare Pages 配置

Pages 需要有一个 D1 binding：

- Binding name: `DB`
- Database: 你已经创建并建好表的 D1 数据库

Pages 还需要一个环境变量：

- `VAPID_PUBLIC_KEY`: Web Push 的 public key

前端会通过 `/api/push-config` 读取 `VAPID_PUBLIC_KEY`。也可以把 public key 写到 `static/js/constants.js` 的 `VAPID_PUBLIC_KEY`，但推荐放 Cloudflare 环境变量。

## 生成 VAPID keys

任选一种方式生成。生成后：

- public key 放到 Pages 环境变量 `VAPID_PUBLIC_KEY`
- private key 留给下一步 Cron Worker 使用，不要写进前端代码

常用命令：

```bash
npx web-push generate-vapid-keys
```

## 已新增接口

- `GET /api/push-config`: 返回前端订阅需要的 VAPID public key
- `POST /api/push-subscribe`: 保存当前设备的 Push subscription
- `POST /api/raising-sync`: 同步当前设备的养成记录到 D1
