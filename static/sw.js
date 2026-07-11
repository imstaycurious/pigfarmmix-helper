// 养猪场mix图鉴助手 service worker — 纯静态缓存
//
// 首次加载:
//   - 立即预缓存 shell (HTML/CSS/JS/icons)
//   - 加载 pigs.json 后也进入缓存 (stale-while-revalidate 上次成功的版本)
//   - /img/pigs/*.png 惰性缓存 (同源 cache-first)
// 之后用户离线:
//   - shell 从缓存读取
//   - pigs.json 从缓存读取
//   - 已浏览过的猪头像从缓存读取
//
// 更新数据: 重新部署时把 CACHE 版本号递增，强制重新获取。
const CACHE = "pigfarm-v85";

// 暴露版本号给主线程（用于更新提示）
self.addEventListener("message", e => {
  if (e.data && e.data.type === "GET_VERSION") {
    e.ports[0].postMessage({ version: CACHE });
  }
});
const SHELL = [
  "/",
  "/index.html",
  "/app.js",
  "/js/constants.js",
  "/js/storage.js",
  "/js/state.js",
  "/js/utils.js",
  "/js/data.js",
  "/js/filters.js",
  "/js/auth.js",
  "/js/sync.js",
  "/js/account-ui.js",
  "/js/modal.js",
  "/js/version.js",
  "/css/app.css",
  "/css/account.css",
  "/css/modal.css",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable.png",
  "/img/small.png",
  "/img/big.png",
  "/data/pigs_full.json",
  "/data/pigs_full_zhs.json",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .catch(err => console.warn("[sw] precache failed:", err))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // pigs_full(_zhs).json: stale-while-revalidate (fast, but fetch fresh in background)
  if (url.pathname === "/data/pigs_full.json" || url.pathname === "/data/pigs_full_zhs.json") {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const hit = await cache.match(e.request);
        const fetchPromise = fetch(e.request)
          .then(r => {
            if (r.ok) cache.put(e.request, r.clone());
            return r;
          })
          .catch(() => hit);
        return hit || fetchPromise;
      })
    );
    return;
  }

  // local pig portraits /img/pigs/*.png: cache-first, lazy-populated
  if (url.pathname.startsWith("/img/pigs/")) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        try {
          const r = await fetch(e.request);
          if (r.ok) cache.put(e.request, r.clone());
          return r;
        } catch {
          return new Response("", { status: 504 });
        }
      })
    );
    return;
  }

  // same-origin shell: cache-first + 运行时回填缓存
  // 命中即用；未命中则 fetch 并写回缓存（排除 /api/ 动态接口），
  // 这样未列进 SHELL 的模块/样式首次在线加载后也能离线用，新增文件自动覆盖。
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      try {
        const res = await fetch(e.request);
        if (
          res.ok &&
          url.origin === self.location.origin &&
          !url.pathname.startsWith("/api/")
        ) {
          cache.put(e.request, res.clone());
        }
        return res;
      } catch {
        // 完全离线时的兜底：导航请求回退到首页
        if (e.request.mode === "navigate") return caches.match("/index.html");
        return new Response("", { status: 504 });
      }
    })
  );
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const tab = (e.notification.data && e.notification.data.tab) || "raising";
  e.waitUntil((async () => {
    const list = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of list) {
      if ("focus" in client) {
        client.postMessage({ type: "open-tab", tab });
        return client.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(`/?tab=${encodeURIComponent(tab)}`);
  })());
});

self.addEventListener("push", e => {
  let payload = {};
  try {
    payload = e.data ? e.data.json() : {};
  } catch {
    payload = { body: e.data ? e.data.text() : "" };
  }
  const title = payload.title || "又到了喂猪的时候了";
  const options = {
    body: payload.body || "有猪可以喂食了",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    tag: payload.tag,
    data: payload.data || { tab: "raising" },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});
