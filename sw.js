const CACHE = "translation-v5";
const SHELL = ["./", "index.html", "style.css", "app.js", "phrases.json", "manifest.webmanifest", "icon-180.png"];

// Cache the app shell plus every phrase's audio up front so it all works offline.
async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);
  const phrases = await (await fetch("phrases.json", { cache: "no-cache" })).json();
  await cache.addAll(phrases.flatMap((p) => ["f", "m"].map((v) => `audio/${v}/${p.id}.mp3`)));
}

self.addEventListener("install", (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Audio never changes under the same name, so serve it from the cache.
// Everything else: take the network copy when online (so updates show up at once), fall back to the cache offline.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const isAudio = new URL(e.request.url).pathname.includes("/audio/");
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      if (isAudio && hit) return hit;
      try {
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      } catch {
        return hit || (await cache.match("index.html"));
      }
    })
  );
});
