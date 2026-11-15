// This app has no service worker/offline cache of its own; this only clears
// any that a previous version may have installed in the browser. Moved out of
// an inline <script> tag so the page's Content-Security-Policy does not need
// 'unsafe-inline' for script-src (a real security improvement: it means an
// injected/XSS <script> tag in the page can no longer execute at all).
(async () => {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (_) {}
})();
