// Legacy worker disabled in V46 to prevent stale application bundles from being served.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  try { const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); } catch(_) {}
  await self.registration.unregister();
  const clients=await self.clients.matchAll(); clients.forEach(c=>c.navigate(c.url));
})()));
