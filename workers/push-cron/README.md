# 养成提醒 Cron Worker

这个 Worker 每 2 分钟扫描一次 D1：

1. 找出 `raising_records` 中已经到点、还没对当前 `next_feed_at` 通知过的记录
2. 找到对应设备的 `push_subscriptions`
3. 发送 Web Push
4. 成功后把 `notified_next_feed_at` 标记为当前 `next_feed_at`

## 部署前配置

编辑 `workers/push-cron/wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "你的 D1 数据库名"
database_id = "你的 D1 database_id"
```

`database_id` 在 Cloudflare Dashboard 的 D1 数据库详情页可以看到。

## 配置密钥

在 `workers/push-cron` 目录执行：

```bash
npx wrangler secret put VAPID_PRIVATE_KEY
```

输入之前生成的 private key。

然后配置 public key：

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
```

输入 Pages 环境变量里同一组 public key。

可选：配置 VAPID subject，建议用你的邮箱：

```bash
npx wrangler secret put VAPID_SUBJECT
```

输入形如：

```text
mailto:your-email@example.com
```

## 部署

在 `workers/push-cron` 目录执行：

```bash
npx wrangler deploy
```

## 测试

部署后可以先等 2 分钟让 Cron 自动跑。也可以临时手动访问 Worker 地址：

```text
https://pigfarmmix-push-cron.<你的 workers.dev 子域>/run
```

如果要保护 `/run`，配置：

```bash
npx wrangler secret put CRON_TEST_TOKEN
```

之后请求时带：

```text
Authorization: Bearer 你的token
```
