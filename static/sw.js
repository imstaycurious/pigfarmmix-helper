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
const CACHE = "pigfarm-v12";
const SHELL = [
  "/",
  "/index.html",
  "/app.js",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable.png",
  "/data/pigs.json",
  "/data/pigs_event.json",
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

  // pigs.json: stale-while-revalidate (fast, but fetch fresh in background)
  if (url.pathname === "/data/pigs.json") {
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

  // same-origin shell: cache-first, network fallback
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).catch(() => {
      // fallback for navigation requests when totally offline
      if (e.request.mode === "navigate") return caches.match("/index.html");
      return new Response("", { status: 504 });
    }))
  );
});
