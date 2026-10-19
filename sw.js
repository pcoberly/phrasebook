const CACHE = "phrasebook-v8";
// The app itself. Languages are not here: each one is a "pack" (lang/<code>/ and audio/<code>/)
// that the page downloads into its own cache, "lang-<code>", only when you choose that language.
const SHELL = ["./", "index.html", "style.css", "app.js", "phrases.json", "languages.json", "manifest.webmanifest", "icon-v3-180.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && !k.startsWith("lang-")).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Language files never change under the same name once downloaded, so serve them from whichever
// pack cache holds them (or the network if that language isn't downloaded).
// Safari asks for audio in byte ranges and will not play a cached full response to such a request,
// so a Range request is answered with the matching slice and a 206.
async function packResponse(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (!hit) return fetch(req);
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
  if (!range) return hit;
  const buf = await hit.arrayBuffer();
  const size = buf.byteLength;
  let start = range[1] === "" ? size - Number(range[2]) : Number(range[1]);
  let end = range[1] === "" || range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1);
  if (!(start >= 0 && start <= end)) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": hit.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
    },
  });
}

// App files: take the network copy when online so updates show up at once, fall back to the cache offline.
async function appResponse(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("index.html"));
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // The page is downloading or checking a language pack: go straight to the network.
  if (url.pathname.endsWith("/pack.json") || url.searchParams.has("sync")) return;
  const isPack = /\/(lang|audio)\//.test(url.pathname);
  e.respondWith(isPack ? packResponse(req) : appResponse(req));
});
