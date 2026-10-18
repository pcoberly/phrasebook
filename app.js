"use strict";

const DAY = 86400000;
const INTERVALS = [0, 1, 3, 7, 14, 30]; // days per Leitner box
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode etc. */ } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* private mode etc. */ } },
};

const $ = (s) => document.querySelector(s);
const main = $("#main");
const state = {
  languages: [],  // languages.json: every language the app offers
  shared: [],     // phrases.json: the phrases every language shares (id, English, topic)
  lang: null,     // the language being studied
  phrases: [],    // shared phrases merged with the active language's text, say, tones, note
  mode: "list",
  progress: {},
  settings: { voice: store.get("phrasebook-voice", "f"), speed: store.get("phrasebook-speed", "1") },
  last: null,
  busy: {},       // language code -> message while it downloads
  note: "",       // temporary footer message
};

// ---------- speech ----------
let browserVoice = null;
function pickVoice() {
  browserVoice = null;
  if (!("speechSynthesis" in window) || !state.lang) return;
  const prefix = state.lang.ttsLang.slice(0, 2).toLowerCase();
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(prefix));
  browserVoice = vs.find((v) => /linh|kyoko|o-ren/i.test(v.name)) || vs[0] || null;
}
if ("speechSynthesis" in window) speechSynthesis.addEventListener("voiceschanged", pickVoice);

let currentAudio = null;
function speak(p) {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  const pref = state.settings.voice;
  const voice = pref === "mixed" ? (Math.random() < 0.5 ? "f" : "m") : pref;
  const a = new Audio(`audio/${state.lang.code}/${voice}/${p.id}.mp3`);
  a.playbackRate = parseFloat(state.settings.speed) || 1;
  a.onerror = () => speakWithBrowserVoice(p); // audio file missing: fall back to the phone's voice
  currentAudio = a;
  a.play().catch(() => {});
}
function speakWithBrowserVoice(p) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(p.text.replace(/\.\.\.|…/g, ""));
  u.lang = state.lang.ttsLang;
  if (browserVoice) u.voice = browserVoice;
  u.rate = 0.85;
  speechSynthesis.speak(u);
}

// ---------- scheduling ----------
const progressKey = (code) => "phrasebook-progress-" + code;
const keyOf = (p, dir) => p.id + ":" + dir;
function grade(key, ok) {
  const cur = state.progress[key] || { box: 0 };
  const box = ok ? Math.min(cur.box + 1, INTERVALS.length - 1) : 0;
  state.progress[key] = { box, due: Date.now() + INTERVALS[box] * DAY };
  store.set(progressKey(state.lang.code), state.progress);
}
// "to" = English prompt, answer in the language; "from" = the other way round
function candidates() {
  const cat = $("#cat").value, dirSel = $("#dir").value;
  const dirs = dirSel === "mixed" ? ["to", "from"] : [dirSel];
  const out = [];
  for (const p of state.phrases) {
    if (cat !== "all" && p.cat !== cat) continue;
    for (const dir of dirs) out.push({ p, dir, key: keyOf(p, dir) });
  }
  return out;
}
function next() {
  let items = candidates();
  if (items.length > 1 && state.last) items = items.filter((i) => i.key !== state.last);
  const now = Date.now();
  const due = items.filter((i) => !state.progress[i.key] || state.progress[i.key].due <= now);
  const pool = due.length ? due : items.sort((a, b) => state.progress[a.key].due - state.progress[b.key].due).slice(0, 3);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  state.last = pick.key;
  return pick;
}

// ---------- ui helpers ----------
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// text in the language being studied, tagged so the phone picks the right font
const nat = (s) => `<span lang="${state.lang.code}">${esc(s)}</span>`;
// topics are stored as slugs ("getting-around") and shown as names ("Getting Around")
const topicName = (c) => c.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// pronunciation block: "sounds like" spelling, tones when the language has them, and a usage note
function detail(p) {
  return `${p.say ? `<div class="say">${esc(p.say)}</div>` : ""}
    ${p.tones ? `<div class="tones">${esc(p.tones)}</div>` : ""}
    ${p.note ? `<div class="note">${esc(p.note)}</div>` : ""}`;
}
// languages marked "draft" in languages.json have not been checked by a native speaker
function draftBanner() {
  return state.lang.draft
    ? `<p class="draft">Draft ${esc(state.lang.name)}: not yet checked by a native speaker. Trust the audio over the spelling, and check anything important with a local.</p>`
    : "";
}
function updateStatus() {
  if (state.note) { $("#status").textContent = state.note; return; }
  const all = state.phrases.length * 2;
  const known = Object.values(state.progress).filter((v) => v.box >= 3).length;
  $("#status").textContent = `${known} of ${all} cards learned`;
}
function say(note, ms = 0) {
  state.note = note;
  updateStatus();
  if (ms) setTimeout(() => { if (state.note === note) { state.note = ""; updateStatus(); } }, ms);
}

// ---------- cards ----------
function renderCard() {
  const { p, dir, key } = next();
  const name = state.lang.name;
  const listenOnly = $("#listen").checked;
  const fromLang = dir === "from";
  const showFront = !(fromLang && listenOnly);
  const front = fromLang ? nat(p.text) : esc(p.en);
  main.innerHTML = `
    <div class="card" id="face">
      <div class="label">${fromLang ? name : "English"}</div>
      <div class="big">${showFront ? front : "🎧"}</div>
      ${fromLang ? `<button class="speak" id="say" aria-label="Play">🔊</button>` : ""}
      <div class="hint">Tap the card to reveal</div>
    </div>
    <div class="row hidden" id="grades">
      <button class="act bad" id="again">✗ Didn't know it</button>
      <button class="act good" id="got">✓ Knew it</button>
    </div>`;
  if (fromLang) { $("#say").onclick = (e) => { e.stopPropagation(); speak(p); }; speak(p); }
  $("#face").onclick = () => {
    if ($("#grades").classList.contains("hidden") === false) return;
    $("#face").innerHTML = `
      <div class="label">${fromLang ? "English" : name}</div>
      <div class="big">${fromLang ? esc(p.en) : nat(p.text)}</div>
      <button class="speak" id="say2" aria-label="Play">🔊</button>
      <div class="orig">${fromLang ? name : "English"}: <b>${front}</b></div>
      ${detail(p)}`;
    $("#say2").onclick = (e) => { e.stopPropagation(); speak(p); };
    if (!fromLang) speak(p);
    $("#grades").classList.remove("hidden");
  };
  $("#again").onclick = () => { grade(key, false); render(); };
  $("#got").onclick = () => { grade(key, true); render(); };
  updateStatus();
}

// ---------- quiz ----------
function distractors(p, dir) {
  const field = dir === "to" ? "text" : "en";
  const others = state.phrases.filter((o) => o.id !== p.id && o[field] !== p[field]);
  const same = shuffle(others.filter((o) => o.cat === p.cat));
  const rest = shuffle(others.filter((o) => o.cat !== p.cat));
  return [...same, ...rest].slice(0, 2);
}
function renderQuiz() {
  if (state.phrases.length < 4) { main.innerHTML = `<div class="card">Need at least 4 phrases.</div>`; return; }
  const { p, dir, key } = next();
  const name = state.lang.name;
  const listenOnly = $("#listen").checked;
  const toLang = dir === "to";
  const opts = shuffle([p, ...distractors(p, dir)]);
  main.innerHTML = `
    <div class="card">
      <div class="label">${toLang ? `Pick the ${name}` : "Pick the English"}</div>
      <div class="big">${toLang ? esc(p.en) : (listenOnly ? "🎧" : nat(p.text))}</div>
      ${toLang ? "" : `<button class="speak" id="say" aria-label="Play">🔊</button>`}
    </div>
    <div id="choices"></div>
    <div class="card reveal" id="reveal"></div>
    <div class="row hidden" id="nextrow"><button class="act" id="next">Next</button></div>`;
  if (!toLang) { $("#say").onclick = () => speak(p); speak(p); }
  const box = $("#choices");
  let answered = false;
  opts.forEach((o, i) => {
    const div = document.createElement("div");
    div.className = "choice";
    const label = toLang ? (listenOnly ? `Option ${i + 1}` : nat(o.text)) : esc(o.en);
    div.innerHTML = `<button class="pick">${label}</button>${toLang ? `<button class="speak" aria-label="Play">🔊</button>` : ""}`;
    const pick = div.querySelector(".pick");
    if (toLang) div.querySelector(".speak").onclick = () => speak(o);
    pick.onclick = () => {
      if (answered) return;
      answered = true;
      const ok = o.id === p.id;
      grade(key, ok);
      pick.classList.add(ok ? "right" : "wrong");
      [...box.children].forEach((c, j) => {
        if (opts[j].id === p.id) c.querySelector(".pick").classList.add("right");
        if (toLang) c.querySelector(".pick").innerHTML = nat(opts[j].text);
      });
      speak(p);
      $("#reveal").innerHTML = `<div class="big">${nat(p.text)}</div><div class="orig">${esc(p.en)}</div>${detail(p)}`;
      $("#nextrow").classList.remove("hidden");
      updateStatus();
    };
    box.appendChild(div);
  });
  $("#next").onclick = render;
  updateStatus();
}

// ---------- study list ----------
function renderList() {
  const cat = $("#cat").value;
  const fromFirst = $("#dir").value === "from"; // English first unless studying the language → English
  const groups = {};
  for (const p of state.phrases) if (cat === "all" || p.cat === cat) (groups[p.cat] ||= []).push(p);
  main.innerHTML = draftBanner() + Object.entries(groups).map(([c, ps]) => `
    <h2 class="group">${esc(topicName(c))}</h2>
    ${ps.map((p) => `
      <div class="entry">
        <div>
          ${fromFirst ? "" : `<div class="en">${esc(p.en)}</div>`}
          <div class="vi">${nat(p.text)}</div>
          ${p.say ? `<div class="say">${esc(p.say)}</div>` : ""}
          ${fromFirst ? `<div class="en">${esc(p.en)}</div>` : ""}
          ${p.tones ? `<div class="tones">${esc(p.tones)}</div>` : ""}
          ${p.note ? `<div class="note">${esc(p.note)}</div>` : ""}
        </div>
        <button class="speak" data-id="${p.id}" aria-label="Play">🔊</button>
      </div>`).join("")}`).join("");
  main.querySelectorAll(".speak").forEach((b) => b.onclick = () => speak(state.phrases.find((p) => p.id === b.dataset.id)));
  $("#status").textContent = "Tap 🔊 to hear a phrase";
}

// ---------- guide: one page per language ----------
async function renderGuide() {
  const code = state.lang.code;
  main.innerHTML = `<p class="note">Loading…</p>`;
  $("#status").textContent = `${state.lang.name} pronunciation guide`;
  try {
    const res = await fetch(`lang/${code}/guide.html`);
    if (!res.ok) throw new Error(res.status);
    const html = await res.text();
    if (state.mode === "guide" && state.lang.code === code) main.innerHTML = html;
  } catch {
    if (state.mode === "guide") main.innerHTML = `<p class="note">The guide isn't available offline until ${esc(state.lang.name)} has finished downloading.</p>`;
  }
}

function render() {
  if (state.mode === "cards") renderCard();
  else if (state.mode === "quiz") renderQuiz();
  else if (state.mode === "list") renderList();
  else if (state.mode === "guide") renderGuide();
  else renderSettings();
}

// ---------- language packs: only the languages you choose are stored on the phone ----------
// A pack is everything for one language: its text, guide and audio. lang/<code>/pack.json
// lists every file with a hash, so a pack downloads once and later updates fetch only what changed.
const canCache = "caches" in window;
const packKey = (code) => "phrasebook-pack-" + code;
const cacheName = (code) => "lang-" + code;
function packState(code) {
  const rec = store.get(packKey(code), null);
  return rec ? (rec.complete ? "installed" : "partial") : "none";
}
async function syncPack(code, onProgress) {
  if (!canCache) throw new Error("This browser cannot keep languages offline");
  const res = await fetch(`lang/${code}/pack.json`, { cache: "no-store" });
  if (!res.ok) throw new Error("pack.json " + res.status);
  const manifest = await res.json();
  const rec = store.get(packKey(code), { complete: false, files: {} });
  const cache = await caches.open(cacheName(code));
  for (const path of Object.keys(rec.files)) {
    if (!(path in manifest.files)) { await cache.delete(path); delete rec.files[path]; }
  }
  const todo = [];
  for (const [path, hash] of Object.entries(manifest.files)) {
    if (rec.files[path] === hash && (await cache.match(path))) continue;
    todo.push(path);
  }
  if (!todo.length) { rec.complete = true; store.set(packKey(code), rec); return 0; }
  rec.complete = false;
  store.set(packKey(code), rec);
  const total = todo.length;
  let done = 0;
  onProgress?.(0, total);
  const worker = async () => {
    while (todo.length) {
      const path = todo.shift();
      const r = await fetch(`${path}?sync=${manifest.files[path]}`); // ?sync makes the service worker step aside
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      await cache.put(path, r);
      rec.files[path] = manifest.files[path];
      store.set(packKey(code), rec);
      onProgress?.(++done, total);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  rec.complete = true;
  store.set(packKey(code), rec);
  return done;
}
async function removePack(code) {
  if (canCache) await caches.delete(cacheName(code));
  store.remove(packKey(code));
}

async function loadLanguageData() {
  const code = state.lang.code;
  const res = await fetch(`lang/${code}/phrases.json`);
  if (!res.ok) throw new Error(`lang/${code}/phrases.json ${res.status}`);
  const texts = await res.json();
  state.phrases = state.shared.filter((p) => texts[p.id]).map((p) => ({ ...p, ...texts[p.id] }));
}
function rebuildDirOptions() {
  const n = esc(state.lang.name);
  const sel = $("#dir");
  const saved = store.get("phrasebook-dir", "mixed");
  sel.innerHTML = `<option value="mixed">Both ways</option><option value="to">English → ${n}</option><option value="from">${n} → English</option>`;
  sel.value = ["mixed", "to", "from"].includes(saved) ? saved : "mixed";
}
async function useLanguage(code) {
  const previous = state.lang;
  state.lang = state.languages.find((l) => l.code === code);
  try {
    await loadLanguageData();
  } catch (err) {
    state.lang = previous; // keep studying what we had
    throw err;
  }
  store.set("phrasebook-lang", code);
  state.progress = store.get(progressKey(code), {});
  state.last = null;
  rebuildDirOptions();
  pickVoice();
}
// Keep the language in use, and any other downloaded one, up to date. Runs quietly when online.
async function syncInstalled() {
  if (!canCache || !navigator.onLine) return;
  const codes = state.languages.map((l) => l.code).filter((c) => c === state.lang.code || packState(c) !== "none");
  for (const code of codes) {
    const label = state.languages.find((l) => l.code === code).name;
    try {
      const changed = await syncPack(code, (done, total) => {
        if (code === state.lang.code) say(`Downloading ${label}: ${done} of ${total}`);
      });
      if (changed && code === state.lang.code) say(`${label} is ready to use offline`, 4000);
      else if (code === state.lang.code && state.note) say("");
    } catch {
      if (code === state.lang.code) say("");
    }
  }
}

// ---------- settings ----------
function languageRows() {
  return state.languages.map((l) => {
    const ps = packState(l.code);
    const active = l.code === state.lang.code;
    const mb = `${(l.bytes / 1e6).toFixed(1)} MB`;
    const status = state.busy[l.code] || (active ? "In use" : ps === "installed" ? "Downloaded" : ps === "partial" ? "Partly downloaded" : "Not downloaded");
    const buttons = state.busy[l.code] || active ? ""
      : ps === "installed" ? `<button class="mini" data-act="use">Use</button><button class="mini ghost" data-act="remove">Remove</button>`
      : `<button class="mini" data-act="download">${canCache ? "Download &amp; use" : "Use"}</button>`;
    return `
      <div class="lang${active ? " current" : ""}" data-lang="${l.code}">
        <div><div class="lname">${esc(l.name)} <span class="note" lang="${l.code}">${esc(l.native)}</span></div>
          <div class="note"><span class="lstate">${esc(status)}</span> · ${mb}${l.draft ? " · Draft translations" : ""}</div></div>
        <div class="lbtn">${buttons}</div>
      </div>`;
  }).join("");
}
function renderSettings() {
  const opt = (v, label, cur) => `<option value="${v}"${v === cur ? " selected" : ""}>${label}</option>`;
  main.innerHTML = `
    <h2 class="group">Language</h2>
    <div id="langs">${languageRows()}</div>
    <p class="note">Each language is stored on this phone only once you download it. Removing one frees its space and keeps your progress.</p>
    <h2 class="group">Audio</h2>
    <div class="setting">
      <label for="voice">Voice</label>
      <select id="voice">
        ${opt("f", "Female", state.settings.voice)}
        ${opt("m", "Male", state.settings.voice)}
        ${opt("mixed", "Mixed (random each time)", state.settings.voice)}
      </select>
    </div>
    <div class="setting">
      <label for="speed">Speed</label>
      <select id="speed">
        ${opt("1", "Normal", state.settings.speed)}
        ${opt("0.85", "Slower", state.settings.speed)}
        ${opt("0.7", "Slowest", state.settings.speed)}
      </select>
    </div>
    <div class="row"><button class="act" id="sample">🔊 Hear a sample</button></div>`;
  const sample = () => speak(state.phrases.find((p) => p.id === "hello") || state.phrases[0]);
  for (const id of ["voice", "speed"]) {
    $("#" + id).onchange = () => {
      state.settings[id] = $("#" + id).value;
      store.set("phrasebook-" + id, state.settings[id]);
      sample();
    };
  }
  $("#sample").onclick = sample;
  $("#langs").onclick = async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const code = btn.closest("[data-lang]").dataset.lang;
    const lang = state.languages.find((l) => l.code === code);
    if (btn.dataset.act === "remove") {
      if (confirm(`Remove ${lang.name} from this phone? Your progress is kept.`)) { await removePack(code); renderSettings(); }
      return;
    }
    try {
      if (btn.dataset.act === "download" && canCache) {
        state.busy[code] = "Starting…";
        renderSettings();
        await syncPack(code, (done, total) => {
          state.busy[code] = `Downloading ${done} of ${total}`;
          const el = document.querySelector(`[data-lang="${code}"] .lstate`);
          if (el) el.textContent = state.busy[code];
        });
      }
      await useLanguage(code);
      delete state.busy[code];
    } catch {
      state.busy[code] = "Couldn't download. Check you're online and try again.";
      setTimeout(() => { delete state.busy[code]; if (state.mode === "settings") renderSettings(); }, 5000);
    }
    if (state.mode === "settings") renderSettings();
  };
  $("#status").textContent = "Settings are saved on this device";
}

// ---------- boot ----------
async function getJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}
async function boot() {
  try {
    [state.languages, state.shared] = await Promise.all([getJson("languages.json"), getJson("phrases.json")]);
    const saved = store.get("phrasebook-lang", "");
    const code = state.languages.some((l) => l.code === saved) ? saved : state.languages[0].code;
    state.lang = state.languages.find((l) => l.code === code);
    await loadLanguageData();
  } catch {
    main.innerHTML = `<p class="note">Couldn't load the phrases. Open the app once while online.</p>`;
    return;
  }
  state.progress = store.get(progressKey(state.lang.code), {});
  pickVoice();
  const cats = [...new Set(state.shared.map((p) => p.cat))];
  $("#cat").innerHTML = `<option value="all">All</option>` + cats.map((c) => `<option value="${c}">${esc(topicName(c))}</option>`).join("");
  const savedCat = store.get("phrasebook-cat", null);
  if (savedCat && [...$("#cat").options].some((o) => o.value === savedCat)) $("#cat").value = savedCat;
  $("#cat").onchange = () => { store.set("phrasebook-cat", $("#cat").value); state.last = null; render(); };
  rebuildDirOptions();
  $("#dir").onchange = () => { store.set("phrasebook-dir", $("#dir").value); state.last = null; render(); };
  if (!["f", "m", "mixed"].includes(state.settings.voice)) state.settings.voice = "f";
  if (!["1", "0.85", "0.7"].includes(state.settings.speed)) state.settings.speed = "1";
  $("#listen").checked = store.get("phrasebook-listen", false);
  $("#listen").onchange = () => { store.set("phrasebook-listen", $("#listen").checked); render(); };
  document.querySelectorAll(".tab").forEach((b) => b.onclick = () => {
    state.mode = b.dataset.mode;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === b));
    // topic/direction/listening-only mean nothing on the guide and settings pages
    $(".opts").hidden = state.mode === "guide" || state.mode === "settings";
    render();
  });
  render();
  syncInstalled();
}
boot();

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
