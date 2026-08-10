const CACHE="skylog-v32";
const ASSETS=["./","./index.html","./css/style.css","./js/db.js","./js/app.js","./manifest.json"];

self.addEventListener("install",e=>{
  e.waitUntil(
    caches.open(CACHE)
      .then(c=>c.addAll(ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("message",e=>{
  if(e.data?.type==="SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;

  const url=new URL(e.request.url);
  const isAppAsset =
    url.origin===self.location.origin &&
    (url.pathname.endsWith(".html") ||
     url.pathname.endsWith(".js") ||
     url.pathname.endsWith(".css") ||
     url.pathname.endsWith(".json") ||
     url.pathname.endsWith("/"));

  if(isAppAsset){
    e.respondWith(
      fetch(e.request, {cache:"no-cache"})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE).then(c=>c.put(e.request,copy));
          return response;
        })
        .catch(()=>caches.match(e.request).then(c=>c||caches.match("./index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{
      const copy=r.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy));
      return r;
    }).catch(()=>caches.match("./index.html")))
  );
});
