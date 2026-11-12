// Service worker: guarda o "shell" do app (HTML/CSS/JS/ícones) para abrir sem conexão.
// NÃO guarda /api/ (dados sempre da rede) nem tiles do OpenStreetMap (política de uso do provedor).
const VERSION = "alagaviz-v3";
const SHELL = ["/", "/index.html", "/styles.css", "/app.js", "/map.js", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  // rede primeiro (para receber atualizações), cache como reserva offline
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((m) => m || (req.mode === "navigate" ? caches.match("/index.html") : Response.error())))
  );
});
