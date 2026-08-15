"use strict";
/**
 * 养猪场mix图鉴助手 service worker — 纯静态缓存 (TS 编译版)
 *
 * 注意: 本文件在 Service Worker 全局作用域运行。TS 编译时用最小化的
 * 类型断言 (ServiceWorkerGlobalScope 不可用), 运行时行为与手写 JS 一致。
 */
const swScope = globalThis;
const swSelf = swScope;
const CACHE = "pigfarm-v98";
// 暴露版本号给主线程
swSelf.addEventListener("message", (e) => {
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
    "/js/types.js",
    "/js/runtime.js",
    "/render/cards.js",
    "/render/atlas.js",
    "/render/drawer.js",
    "/render/raising.js",
    "/render/auction.js",
    "/render/import-export.js",
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
swSelf.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE)
        .then((c) => c.addAll(SHELL))
        .catch((err) => console.warn("[sw] precache failed:", err)));
    swSelf.skipWaiting();
});
swSelf.addEventListener("activate", (e) => {
    e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => swSelf.clients.claim()));
});
swSelf.addEventListener("fetch", (e) => {
    const url = new URL(e.request.url);
    if (e.request.method !== "GET")
        return;
    // pigs JSON: stale-while-revalidate
    if (url.pathname === "/data/pigs_full.json" || url.pathname === "/data/pigs_full_zhs.json") {
        e.respondWith(caches.open(CACHE).then(async (cache) => {
            const hit = await cache.match(e.request);
            const fetchPromise = fetch(e.request)
                .then((r) => {
                if (r.ok)
                    cache.put(e.request, r.clone());
                return r;
            })
                .catch(() => hit);
            return hit || fetchPromise;
        }));
        return;
    }
    // local pig portraits: cache-first
    if (url.pathname.startsWith("/img/pigs/")) {
        e.respondWith(caches.open(CACHE).then(async (cache) => {
            const hit = await cache.match(e.request);
            if (hit)
                return hit;
            try {
                const r = await fetch(e.request);
                if (r.ok)
                    cache.put(e.request, r.clone());
                return r;
            }
            catch {
                return new Response("", { status: 504 });
            }
        }));
        return;
    }
    // same-origin shell: cache-first
    e.respondWith(caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit)
            return hit;
        try {
            const res = await fetch(e.request);
            if (res.ok &&
                url.origin === swSelf.location.origin &&
                !url.pathname.startsWith("/api/")) {
                cache.put(e.request, res.clone());
            }
            return res;
        }
        catch {
            if (e.request.mode === "navigate")
                return caches.match("/index.html");
            return new Response("", { status: 504 });
        }
    }));
});
swSelf.addEventListener("notificationclick", (e) => {
    e.notification.close();
    const tab = (e.notification.data && e.notification.data.tab) || "raising";
    e.waitUntil((async () => {
        const list = await swSelf.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of list) {
            if ("focus" in client) {
                client.postMessage({ type: "open-tab", tab });
                return client.focus();
            }
        }
        if (swSelf.clients.openWindow)
            return swSelf.clients.openWindow(`/?tab=${encodeURIComponent(tab)}`);
    })());
});
swSelf.addEventListener("push", (e) => {
    let payload = {};
    try {
        payload = e.data ? e.data.json() : {};
    }
    catch {
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
    e.waitUntil(swSelf.registration.showNotification(title, options));
});
