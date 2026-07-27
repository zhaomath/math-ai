/* =========================================================
 * sw.js —— Service Worker：让 PWA 可离线使用
 * ========================================================= */
const CACHE_NAME = 'mathai-v9';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './vendor/cloudbase.min.js',
  './js/cloudbase.js',
  './js/db.js',
  './js/ai.js',
  './js/ui.js',
  './js/auth.js',
  './js/teacher.js',
  './js/student.js',
  './js/parent.js',
  './js/main.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png'
];

// 安装时缓存核心资源
self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(ASSETS).catch(function(err){
        console.warn('[SW] cache addAll failed:', err);
      });
    })
  );
});

// 激活时清理旧缓存
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// 请求策略：网络优先，失败回退缓存（保证更新及时生效，同时支持离线）
self.addEventListener('fetch', function(e){
  // 非 GET 请求直接走网络
  if(e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function(res){
      // 同源成功响应写入缓存，供离线使用
      if(res && res.status===200 && res.type==='basic'){
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(c){ c.put(e.request, clone); });
      }
      return res;
    }).catch(function(){
      return caches.match(e.request).then(function(cached){
        if(cached) return cached;
        // 离线且无缓存时返回 index.html（单页应用兜底）
        return caches.match('./index.html');
      });
    })
  );
});
