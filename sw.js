/* zcmu阶段考 · Service Worker（离线优先） */
const VER = 'zcmu-stage-exam-v2';
const ASSETS = [
  "./app.css",
  "./app.js",
  "./data/index.js",
  "./data/q_clin_1_A1.js",
  "./data/q_clin_1_A2.js",
  "./data/q_clin_1_B1.js",
  "./data/q_clin_2_A1.js",
  "./data/q_clin_2_A2.js",
  "./data/q_clin_2_B1.js",
  "./data/q_clin_3_A1.js",
  "./data/q_clin_3_A2.js",
  "./data/q_clin_3_B1.js",
  "./data/q_clin_4_A1.js",
  "./data/q_clin_4_A2.js",
  "./data/q_clin_4_B1.js",
  "./data/q_clin_5_A1.js",
  "./data/q_clin_5_A2.js",
  "./data/q_clin_5_B1.js",
  "./data/q_clin_6_A1.js",
  "./data/q_clin_6_A2.js",
  "./data/q_clin_6_B1.js",
  "./data/q_clin_7_A1.js",
  "./data/q_clin_7_A2.js",
  "./data/q_clin_7_B1.js",
  "./data/q_prev_1_A1.js",
  "./data/q_prev_1_A2.js",
  "./data/q_prev_1_B1.js",
  "./data/q_prev_2_A1.js",
  "./data/q_prev_2_A2.js",
  "./data/q_prev_2_B1.js",
  "./data/q_prev_3_A1.js",
  "./data/q_prev_3_A2.js",
  "./data/q_prev_3_B1.js",
  "./data/q_prev_4_A1.js",
  "./data/q_prev_4_A2.js",
  "./data/q_prev_4_B1.js",
  "./data/q_prev_5_A1.js",
  "./data/q_prev_5_A2.js",
  "./data/q_prev_5_B1.js",
  "./data/q_prev_6_A1.js",
  "./data/q_prev_6_A2.js",
  "./data/q_prev_6_B1.js",
  "./data/q_prev_7_A1.js",
  "./data/q_prev_7_A2.js",
  "./data/q_prev_7_B1.js",
  "./data/q_prev_8_A1.js",
  "./data/q_prev_8_A2.js",
  "./data/q_prev_8_B1.js",
  "./data/q_tcm_1_A1.js",
  "./data/q_tcm_1_A2.js",
  "./data/q_tcm_1_B1.js",
  "./data/q_tcm_2_A1.js",
  "./data/q_tcm_2_A2.js",
  "./data/q_tcm_2_B1.js",
  "./data/q_tcm_3_A1.js",
  "./data/q_tcm_3_A2.js",
  "./data/q_tcm_3_B1.js",
  "./data/q_tcm_4_A1.js",
  "./data/q_tcm_4_A2.js",
  "./data/q_tcm_4_B1.js",
  "./data/q_tcm_5_A1.js",
  "./data/q_tcm_5_A2.js",
  "./data/q_tcm_5_B1.js",
  "./data/q_tcm_6_A1.js",
  "./data/q_tcm_6_A2.js",
  "./data/q_tcm_6_B1.js",
  "./data/q_tcm_7_A1.js",
  "./data/q_tcm_7_A2.js",
  "./data/q_tcm_7_B1.js",
  "./data/q_tcm_8_A1.js",
  "./data/q_tcm_8_A2.js",
  "./data/q_tcm_8_B1.js",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512-maskable.png",
  "./icons/icon-512.png",
  "./index.html",
  "./manifest.webmanifest"
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VER).then(function (c) {
    return Promise.all(ASSETS.map(function (u) {
      return c.add(new Request(u, { cache: 'reload' })).catch(function () { /* 单个失败不阻塞 */ });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VER; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      const copy = res.clone();
      caches.open(VER).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () { return caches.match('./index.html'); });
  }));
});
