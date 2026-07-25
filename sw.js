/* =========================================================
 * sw.js —— Service Worker：让 PWA 可离线使用
 * ========================================================= */
const CACHE_NAME = 'mathai-v2';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
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

// 请求策略：缓存优先，网络回退并更新缓存
self.addEventListener('fetch', function(e){
  // 非 GET 请求直接走网络
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function(cached){
      if(cached){
        // 后台尝试更新缓存
        fetch(e.request).then(function(res){
          if(res && res.status===200) caches.open(CACHE_NAME).then(function(c){ c.put(e.request, res.clone()); });
        }).catch(function(){});
        return cached;
      }
      return fetch(e.request).then(function(res){
        if(!res || res.status!==200 || res.type!=='basic') return res;
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(c){ c.put(e.request, clone); });
        return res;
      }).catch(function(){
        // 离线且无缓存时返回 index.html（单页应用兜底）
        return caches.match('./index.html');
      });
    })
  );
});
