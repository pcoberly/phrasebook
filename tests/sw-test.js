// Runs sw.js against a fake cache store and a fake network, and checks what it does.
// Usage: node tests/sw-test.js   (Node 18 or newer)
const fs = require("fs");
const path = require("path");
const SW = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
const BASE = "https://example.test/phrasebook/";
const store = new Map(); // cache name -> Map(url -> Response)
let online = true;
let delay = 0; // how long the fake network takes to answer, in ms
const networkCalls = [];
const cacheModes = {};
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

// in a service worker a relative URL is resolved against the worker's address
const NodeRequest = Request;
global.Request = class extends NodeRequest {
  constructor(input, init) { super(typeof input === "string" ? new URL(input, BASE).href : input, init); }
};

const norm = (req, ignoreSearch) => {
  const u = new URL(typeof req === "string" ? new URL(req, BASE).href : req.url);
  if (ignoreSearch) u.search = "";
  return u.href;
};
const makeCache = (name) => ({
  async addAll(list) { for (const p of list) store.get(name).set(norm(p), await fakeFetch(typeof p === "string" ? new Request(p) : p)); },
  async put(req, res) { store.get(name).set(norm(req), res); },
  async match(req, opts = {}) {
    for (const [k, v] of store.get(name)) if (norm(k, opts.ignoreSearch) === norm(req, opts.ignoreSearch)) return v.clone();
    return undefined;
  },
  async delete(req) { return store.get(name).delete(norm(req)); },
});
global.caches = {
  async open(name) { if (!store.has(name)) store.set(name, new Map()); return makeCache(name); },
  async keys() { return [...store.keys()]; },
  async delete(name) { return store.delete(name); },
  async match(req, opts) { for (const n of store.keys()) { const r = await makeCache(n).match(req, opts); if (r) return r; } },
};
const CACHE_NAME = /CACHE = "([^"]+)"/.exec(SW)[1];
async function fakeFetch(req) {
  const url = typeof req === "string" ? req : req.url;
  if (typeof req !== "string") cacheModes[url] = req.cache;
  networkCalls.push(url);
  if (delay) await wait(delay);
  if (!online) throw new TypeError("offline");
  return new Response("net:" + url, { status: 200 });
}
global.fetch = fakeFetch;

const listeners = {};
global.self = { addEventListener: (t, f) => (listeners[t] = f), skipWaiting: async () => {}, clients: { claim: async () => {} }, location: new URL(BASE) };
eval(SW.replace(/^const /gm, "var "));
SLOW_MS = 50; // so the slow-connection tests run quickly

async function run(type) { let p; await listeners[type]({ waitUntil: (x) => (p = x) }); await p; }
const background = []; // work the worker carries on with after answering (e.waitUntil)
async function doFetch(p, { method = "GET", headers = {}, navigate = false } = {}) {
  let req = new Request(BASE + p, { method, headers });
  // a page load; Node won't make a Request with mode "navigate", so this stands in for one
  if (navigate) req = { url: req.url, method, headers: req.headers, mode: "navigate", cache: "default" };
  let responded = null;
  listeners.fetch({ request: req, respondWith: (x) => (responded = x), waitUntil: (x) => background.push(x) });
  if (!responded) return { passedThrough: true };
  const res = await responded;
  return { body: res.type === "error" ? null : await res.text(), status: res.status, type: res.type, range: res.headers.get("content-range") };
}
const settle = () => Promise.allSettled(background.splice(0));
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`);

(async () => {
  // old caches from earlier releases, plus a downloaded language pack
  await caches.open("phrasebook-v1"); await caches.open("lang-ja");
  await (await caches.open("lang-ja")).put(BASE + "audio/ja/f/hello.mp3", new Response("JA-AUDIO"));
  await (await caches.open("lang-ja")).put(BASE + "lang/ja/phrases.json", new Response("JA-TEXT"));

  await run("install");
  const shell = await caches.open(CACHE_NAME);
  check("install caches the app shell", (await shell.match("app.js")) !== undefined);
  check("install skips the browser's own (up to 10-minute-old) copies", cacheModes[BASE + "app.js"] === "reload", String(cacheModes[BASE + "app.js"]));
  // language files sit in a folder per language (lang/ja/, audio/ja/f/); audio/silence.mp3, for Play all's pauses, is the app's own
  check("install does not fetch any language files", !networkCalls.some((u) => /\/(lang|audio)\/[^/]+\//.test(u)));
  check("install caches the silence Play all pauses with", (await shell.match("audio/silence.mp3")) !== undefined);

  await run("activate");
  const names = (await caches.keys()).sort().join(",");
  check("activate deletes the old shell cache, keeps lang-ja", names === ["lang-ja", CACHE_NAME].sort().join(","), names);

  let r = await doFetch("app.js");
  check("app file online comes from the network", r.body === "net:" + BASE + "app.js");
  check("app file is fetched with no-cache, so GitHub's 10-minute cache can't serve a stale copy", cacheModes[BASE + "app.js"] === "no-cache", String(cacheModes[BASE + "app.js"]));
  r = await doFetch("", { navigate: true });
  check("the page itself is fetched with no-cache too", cacheModes[BASE] === "no-cache", String(cacheModes[BASE]));
  await settle();

  // a slow connection: the stored copy is shown, and the network's copy replaces it when it arrives
  await shell.put(BASE + "style.css", new Response("OLD-CSS"));
  delay = 200;
  let started = Date.now();
  r = await doFetch("style.css");
  check("slow connection: the stored copy is used without waiting", r.body === "OLD-CSS" && Date.now() - started < 150, `${r.body} after ${Date.now() - started}ms`);
  await settle();
  check("…and the network copy is stored once it arrives", (await (await shell.match("style.css")).text()) === "net:" + BASE + "style.css");
  started = Date.now();
  r = await doFetch("not-stored-yet.png");
  check("slow connection with nothing stored waits for the network", r.body === "net:" + BASE + "not-stored-yet.png", `after ${Date.now() - started}ms`);
  delay = 0;
  await settle();

  r = await doFetch("?lang=ja", { navigate: true });
  await settle();
  check("a shared ?lang= link is stored as the page, not as a page of its own", store.get(CACHE_NAME).has(BASE) && !store.get(CACHE_NAME).has(BASE + "?lang=ja"));

  online = false;
  r = await doFetch("app.js");
  check("app file offline comes from the cache", r.body === "net:" + BASE + "app.js");
  r = await doFetch("", { navigate: true });
  check("page offline falls back to the cached shell", r.body !== null && r.body.startsWith("net:"));
  r = await doFetch("?analytics=off", { navigate: true });
  check("page with a ?query offline is still the cached shell", r.body !== null && r.body.startsWith("net:"));
  r = await doFetch("missing.png");
  check("a missing file offline is a failed load, not the app's page", r.type === "error", JSON.stringify(r));
  await settle();

  networkCalls.length = 0;
  r = await doFetch("audio/ja/f/hello.mp3");
  check("downloaded language audio is served offline", r.body === "JA-AUDIO" && networkCalls.length === 0);
  r = await doFetch("audio/ja/f/hello.mp3", { headers: { Range: "bytes=2-4" } });
  check("Range request gets the right slice as a 206", r.status === 206 && r.body === "-AU" && r.range === "bytes 2-4/8", JSON.stringify(r));
  r = await doFetch("audio/ja/f/hello.mp3", { headers: { Range: "bytes=0-" } });
  check("open-ended Range (Safari's first request) gets the whole file", r.status === 206 && r.body === "JA-AUDIO" && r.range === "bytes 0-7/8", JSON.stringify(r));
  r = await doFetch("audio/ja/f/hello.mp3", { headers: { Range: "bytes=-3" } });
  check("suffix Range gets the last bytes", r.status === 206 && r.body === "DIO", JSON.stringify(r));
  r = await doFetch("audio/ja/f/hello.mp3", { headers: { Range: "bytes=50-60" } });
  check("Range past the end is refused with 416", r.status === 416, JSON.stringify(r));
  r = await doFetch("lang/ja/phrases.json");
  check("downloaded language text is served offline", r.body === "JA-TEXT");
  let threw = false;
  try { await doFetch("audio/vi/f/hello.mp3"); } catch { threw = true; }
  check("language that is not downloaded fails cleanly offline", threw);

  online = true; networkCalls.length = 0;
  r = await doFetch("audio/vi/f/hello.mp3");
  check("language not downloaded loads from the network online", r.body === "net:" + BASE + "audio/vi/f/hello.mp3");
  const viCached = await caches.match(BASE + "audio/vi/f/hello.mp3");
  check("…and is not stored by the service worker", viCached === undefined);

  r = await doFetch("lang/ja/pack.json");
  check("pack.json passes straight to the network", r.passedThrough === true);
  r = await doFetch("audio/ja/f/hello.mp3?sync=abc123");
  check("?sync downloads pass straight to the network", r.passedThrough === true);
  r = await doFetch("sw.js");
  check("the version check (sw.js) passes straight to the network", r.passedThrough === true);
  { const req = new Request("https://static.cloudflareinsights.com/beacon.min.js"); let handled = false; listeners.fetch({ request: req, respondWith: () => (handled = true) });
    check("a request to another site (the analytics script) is left alone", handled === false); }
  r = await doFetch("anything", { method: "POST" });
  check("POST is left alone", r.passedThrough === true);

  console.log(results.join("\n"));
  process.exit(results.some((x) => x.startsWith("FAIL")) ? 1 : 0);
})();
