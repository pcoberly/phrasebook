const CACHE = "phrasebook-v30"; // keep in step with VERSION in app.js (check_data.py checks)
// The app itself. Languages are not here: each one is a "pack" (lang/<code>/ and audio/<code>/)
// that the page downloads into its own cache, "lang-<code>", only when you choose that language.
const SHELL = ["./", "index.html", "style.css", "app.js", "phrases.json", "languages.json", "manifest.webmanifest", "icon-v3-180.png", "favicon-32.png", "favicon-48.png", "audio/silence.mp3"];

self.addEventListener("install", (e) => {
  // "reload" skips the browser's own copies, which GitHub Pages lets be up to 10 minutes old
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
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
// "no-cache" makes the browser check with the server every time (a cheap not-modified answer when nothing
// changed), instead of trusting the 10 minutes GitHub Pages allows it to keep a copy.
// On a connection too slow to answer within SLOW_MS (hotel Wi-Fi) the stored copy is used, and the network
// copy still replaces it in the background when it arrives.
const SLOW_MS = 3000;
async function appResponse(e) {
  const req = e.request;
  const cache = await caches.open(CACHE);
  const key = new URL(req.url);
  key.search = ""; // ?lang=ja and ?analytics=off are the same page
  const network = fetch(new Request(req.url, { cache: "no-cache" })).then(async (res) => {
    if (res.ok) await cache.put(key.href, res.clone());
    return res;
  });
  e.waitUntil(network.catch(() => {}));
  const stored = await cache.match(key.href);
  try {
    const res = stored ? await Promise.race([network, new Promise((ok) => setTimeout(ok, SLOW_MS, null))]) : await network;
    return res || stored;
  } catch {
    // offline: the stored copy, or for the page itself the stored app
    return stored || (req.mode === "navigate" ? await cache.match("index.html") : Response.error());
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Only this app's own files are handled here. Anything from another site (such as the analytics script) goes straight through.
  if (url.origin !== self.location.origin) return;
  // The page is downloading or checking a language pack: go straight to the network.
  if (url.pathname.endsWith("/pack.json") || url.searchParams.has("sync")) return;
  // The page checks sw.js for a new version: that has to be the server's answer, never a stored copy.
  if (url.pathname.endsWith("/sw.js")) return;
  const isPack = /\/(lang|audio)\//.test(url.pathname);
  e.respondWith(isPack ? packResponse(req) : appResponse(e));
});
