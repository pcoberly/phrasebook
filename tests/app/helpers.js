// Shared set-up for the app's browser tests: a small web server for the repository, one browser per test file,
// and a page opened with whatever this device has stored (progress, the language chosen...). Audio is faked:
// play() finishes at once and records what it would have played, so Play all runs through a list in moments.
//
// Run with the test runner (tests/run.js picks the files), or one file on its own: node --test tests/app/quiz.test.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const { after, before } = require("node:test");
let pw;
try { pw = require("playwright"); } catch { pw = require("playwright-core"); }

const ROOT = path.join(__dirname, "..", "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".mp3": "audio/mpeg", ".png": "image/png", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(data);
    });
  });
  return new Promise((ok) => server.listen(0, () => ok(server))); // every address, so "localhost" works whichever it means
}

const ctx = { browser: null, server: null, base: "" };
// call once at the top of a test file
function setup() {
  before(async () => {
    ctx.server = await serve();
    ctx.base = `http://localhost:${ctx.server.address().port}/`; // not 127.0.0.1: there Chromium closes a page with a service worker
    // in GitHub, the Chrome already on the runner (nothing to download); here, Playwright's own Chromium
    ctx.browser = await pw.chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  });
  after(async () => {
    await ctx.browser?.close();
    ctx.server?.close();
  });
  return ctx;
}

// Open the app as a device that has stored `storage` (keys without the "phrasebook-" prefix, values as stored).
// lang: the language being learned (skips the welcome page); null opens it as a brand-new person would.
// Returns the page, with page.errors collecting any error the app raised.
async function open({ lang = "ja", storage = {}, viewport = { width: 390, height: 844 }, locale = "en-US", serviceWorkers = "block", seenVersion = true, wait = true } = {}) {
  const context = await ctx.browser.newContext({ viewport, locale, serviceWorkers });
  const seed = { ...storage };
  if (lang) seed.lang = lang;
  if (seenVersion) seed["seen-version"] = await currentVersion(); // no "PhraseBook was updated" note
  await context.addInitScript((seed) => {
    // stored once, before the app's first load; a reload in the test keeps what the app has stored since
    if (!sessionStorage.getItem("__seeded")) {
      for (const [k, v] of Object.entries(seed)) localStorage.setItem("phrasebook-" + k, JSON.stringify(v));
      sessionStorage.setItem("__seeded", "1");
    }
    window.__played = [];
    HTMLMediaElement.prototype.play = function () {
      window.__played.push(this.src);
      setTimeout(() => this.dispatchEvent(new Event("ended")), 1);
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {};
  }, seed);
  const page = await context.newPage();
  page.setDefaultTimeout(8000); // fail in seconds, not half a minute
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(ctx.base);
  if (wait) await ready(page);
  return page;
}
// the app has drawn its first page and the splash is gone
async function ready(page) {
  await page.waitForFunction(() => !document.querySelector("#splash") && document.querySelector("#main").children.length);
}
let version;
async function currentVersion() {
  version ||= /const VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "app.js"), "utf8"))[1];
  return version;
}
const tab = (page, mode) => page.locator(`.tab[data-mode="${mode}"]`).click();
// a page from the More menu
async function more(page, id) {
  await tab(page, "more");
  await page.locator(`#${id}`).click();
}
// what is stored on the device, by key without the prefix
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem("phrasebook-" + k)), key);
// the phrases (phrases.json): id, English, topic
const phrases = () => JSON.parse(fs.readFileSync(path.join(ROOT, "phrases.json"), "utf8"));
// progress with these phrase ids learned both ways
function learned(ids) {
  const out = {};
  for (const id of ids) for (const dir of ["to", "from"]) out[`${id}:${dir}`] = { box: 3, due: Date.now() + 86400000 };
  return out;
}
// Answer the quiz question on screen, rightly or not, and go on
async function answer(page, right = true) {
  const i = await page.evaluate((right) => {
    const it = state.round.items[state.round.index];
    const want = it.dir === "to" ? it.p.text : it.p.known;
    const picks = [...document.querySelectorAll("#choices .pick")];
    const hit = picks.findIndex((b) => b.textContent === want);
    return right ? hit : (hit + 1) % picks.length;
  }, right);
  await page.locator("#choices .pick").nth(i).click();
  await page.locator("#next").click();
}

module.exports = { setup, open, ready, tab, more, stored, phrases, learned, answer, ROOT };
