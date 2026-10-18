"use strict";

const DAY = 86400000;
const INTERVALS = [0, 1, 3, 7, 14, 30]; // days per Leitner box
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode etc. */ } },
};

// One-time move of settings and progress saved under the app's old name ("viet-").
try {
  for (const k of ["progress", "cat", "dir", "voice", "speed", "listen"]) {
    const old = localStorage.getItem("viet-" + k);
    if (old !== null && localStorage.getItem("translation-" + k) === null) localStorage.setItem("translation-" + k, old);
  }
} catch { /* storage unavailable */ }

const $ = (s) => document.querySelector(s);
const main = $("#main");
const state = {
  phrases: [],
  mode: "list",
  progress: store.get("translation-progress", {}),
  settings: { voice: store.get("translation-voice", "f"), speed: store.get("translation-speed", "1") },
  last: null,
};

// ---------- speech ----------
let viVoice = null;
function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("vi"));
  viVoice = vs.find((v) => /linh/i.test(v.name)) || vs[0] || null;
}
if ("speechSynthesis" in window) {
  pickVoice();
  speechSynthesis.addEventListener("voiceschanged", pickVoice);
}
let currentAudio = null;
function speak(p) {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  const pref = state.settings.voice;
  const voice = pref === "mixed" ? (Math.random() < 0.5 ? "f" : "m") : pref;
  const a = new Audio(`audio/${voice}/${p.id}.mp3`);
  a.playbackRate = parseFloat(state.settings.speed) || 1;
  a.onerror = () => speakWithBrowserVoice(p); // audio file missing: fall back to the phone's voice
  currentAudio = a;
  a.play().catch(() => {});
}
function speakWithBrowserVoice(p) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(p.vi.replace(/\.\.\./g, ""));
  u.lang = "vi-VN";
  if (viVoice) u.voice = viVoice;
  u.rate = 0.85;
  speechSynthesis.speak(u);
}

// ---------- scheduling ----------
const keyOf = (p, dir) => p.id + ":" + dir;
function grade(key, ok) {
  const cur = state.progress[key] || { box: 0 };
  const box = ok ? Math.min(cur.box + 1, INTERVALS.length - 1) : 0;
  state.progress[key] = { box, due: Date.now() + INTERVALS[box] * DAY };
  store.set("translation-progress", state.progress);
}
function candidates() {
  const cat = $("#cat").value, dirSel = $("#dir").value;
  const dirs = dirSel === "mixed" ? ["en2vi", "vi2en"] : [dirSel];
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
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// pronunciation block: "sounds like" spelling, tone per syllable, and a usage note
function detail(p) {
  return `${p.say ? `<div class="say">${esc(p.say)}</div>` : ""}
    ${p.tones ? `<div class="tones">${esc(p.tones)}</div>` : ""}
    ${p.note ? `<div class="note">${esc(p.note)}</div>` : ""}`;
}
function updateStatus() {
  const all = state.phrases.length * 2;
  const known = Object.values(state.progress).filter((v) => v.box >= 3).length;
  $("#status").textContent = `${known} of ${all} cards learned`;
}

// ---------- cards ----------
function renderCard() {
  const { p, dir, key } = next();
  const listenOnly = $("#listen").checked;
  const frontVi = dir === "vi2en";
  const frontText = frontVi ? p.vi : p.en;
  const showFront = !(frontVi && listenOnly);
  main.innerHTML = `
    <div class="card" id="face">
      <div class="label">${frontVi ? "Vietnamese" : "English"}</div>
      <div class="big">${showFront ? esc(frontText) : "🎧"}</div>
      ${frontVi ? `<button class="speak" id="say" aria-label="Play">🔊</button>` : ""}
      <div class="hint">Tap the card to reveal</div>
    </div>
    <div class="row hidden" id="grades">
      <button class="act bad" id="again">✗ Didn't know it</button>
      <button class="act good" id="got">✓ Knew it</button>
    </div>`;
  if (frontVi) { $("#say").onclick = (e) => { e.stopPropagation(); speak(p); }; speak(p); }
  $("#face").onclick = () => {
    if ($("#grades").classList.contains("hidden") === false) return;
    const backVi = !frontVi;
    $("#face").innerHTML = `
      <div class="label">${frontVi ? "English" : "Vietnamese"}</div>
      <div class="big">${esc(backVi ? p.vi : p.en)}</div>
      <button class="speak" id="say2" aria-label="Play">🔊</button>
      <div class="orig">${frontVi ? "Vietnamese" : "English"}: <b>${esc(frontText)}</b></div>
      ${detail(p)}`;
    $("#say2").onclick = (e) => { e.stopPropagation(); speak(p); };
    if (backVi) speak(p);
    $("#grades").classList.remove("hidden");
  };
  $("#again").onclick = () => { grade(key, false); render(); };
  $("#got").onclick = () => { grade(key, true); render(); };
  updateStatus();
}

// ---------- quiz ----------
function distractors(p, dir) {
  const field = dir === "en2vi" ? "vi" : "en";
  const others = state.phrases.filter((o) => o.id !== p.id && o[field] !== p[field]);
  const same = shuffle(others.filter((o) => o.cat === p.cat));
  const rest = shuffle(others.filter((o) => o.cat !== p.cat));
  return [...same, ...rest].slice(0, 2);
}
function renderQuiz() {
  if (state.phrases.length < 4) { main.innerHTML = `<div class="card">Need at least 4 phrases.</div>`; return; }
  const { p, dir, key } = next();
  const listenOnly = $("#listen").checked;
  const toVi = dir === "en2vi";
  const opts = shuffle([p, ...distractors(p, dir)]);
  main.innerHTML = `
    <div class="card">
      <div class="label">${toVi ? "Pick the Vietnamese" : "Pick the English"}</div>
      <div class="big">${toVi ? esc(p.en) : (listenOnly ? "🎧" : esc(p.vi))}</div>
      ${toVi ? "" : `<button class="speak" id="say" aria-label="Play">🔊</button>`}
    </div>
    <div id="choices"></div>
    <div class="card reveal" id="reveal"></div>
    <div class="row hidden" id="nextrow"><button class="act" id="next">Next</button></div>`;
  if (!toVi) { $("#say").onclick = () => speak(p); speak(p); }
  const box = $("#choices");
  let answered = false;
  opts.forEach((o, i) => {
    const div = document.createElement("div");
    div.className = "choice";
    const label = toVi ? (listenOnly ? `Option ${i + 1}` : esc(o.vi)) : esc(o.en);
    div.innerHTML = `<button class="pick">${label}</button>${toVi ? `<button class="speak" aria-label="Play">🔊</button>` : ""}`;
    const pick = div.querySelector(".pick");
    if (toVi) div.querySelector(".speak").onclick = () => speak(o);
    pick.onclick = () => {
      if (answered) return;
      answered = true;
      const ok = o.id === p.id;
      grade(key, ok);
      pick.classList.add(ok ? "right" : "wrong");
      [...box.children].forEach((c, j) => {
        if (opts[j].id === p.id) c.querySelector(".pick").classList.add("right");
        if (toVi) c.querySelector(".pick").textContent = opts[j].vi;
      });
      speak(p);
      $("#reveal").innerHTML = `<div class="big">${esc(p.vi)}</div><div class="orig">${esc(p.en)}</div>${detail(p)}`;
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
  const viFirst = $("#dir").value === "vi2en"; // English first unless studying Vietnamese → English
  const groups = {};
  for (const p of state.phrases) if (cat === "all" || p.cat === cat) (groups[p.cat] ||= []).push(p);
  main.innerHTML = Object.entries(groups).map(([c, ps]) => `
    <h2 class="group">${esc(c.replace("-", " "))}</h2>
    ${ps.map((p) => `
      <div class="entry">
        <div>
          ${viFirst ? "" : `<div class="en">${esc(p.en)}</div>`}
          <div class="vi">${esc(p.vi)}</div>
          ${p.say ? `<div class="say">${esc(p.say)}</div>` : ""}
          ${viFirst ? `<div class="en">${esc(p.en)}</div>` : ""}
          ${p.tones ? `<div class="tones">${esc(p.tones)}</div>` : ""}
          ${p.note ? `<div class="note">${esc(p.note)}</div>` : ""}
        </div>
        <button class="speak" data-id="${p.id}" aria-label="Play">🔊</button>
      </div>`).join("")}`).join("");
  main.querySelectorAll(".speak").forEach((b) => b.onclick = () => speak(state.phrases.find((p) => p.id === b.dataset.id)));
  $("#status").textContent = "Tap 🔊 to hear a phrase";
}

// ---------- guide (from the cheat sheet) ----------
const GUIDE = `
  <h2 class="group">The six tones</h2>
  <p class="note">Every syllable carries a tone, marked on the vowel. The tone is part of the word: say it wrong and you may say a different word. "Sounds like" spellings are rough English approximations of Hanoi pronunciation.</p>
  <table>
    <tr><th>Tone</th><th>Mark</th><th>How to say it</th><th>Example</th></tr>
    <tr><td>Flat (ngang)</td><td>none: a</td><td>Level and mid-high, like holding a note</td><td>ma (ghost)</td></tr>
    <tr><td>Falling (huyền)</td><td>à</td><td>Low and sliding down, like a sigh</td><td>mà (but)</td></tr>
    <tr><td>Rising (sắc)</td><td>á</td><td>Sharp rise, like "what?"</td><td>má (cheek)</td></tr>
    <tr><td>Dipping (hỏi)</td><td>ả</td><td>Drops, then comes back up</td><td>mả (tomb)</td></tr>
    <tr><td>Broken (ngã)</td><td>ã</td><td>Rises with a catch in the throat midway</td><td>mã (code)</td></tr>
    <tr><td>Heavy (nặng)</td><td>ạ</td><td>Low, short, cut off abruptly</td><td>mạ (rice seedling)</td></tr>
  </table>
  <h2 class="group">Letters that surprise</h2>
  <table>
    <tr><th>Letter</th><th>Sounds like</th></tr>
    <tr><td>x</td><td>s</td></tr>
    <tr><td>đ</td><td>d</td></tr>
    <tr><td>d, gi</td><td>z</td></tr>
    <tr><td>c, k</td><td>A soft k with no puff of air, close to g</td></tr>
    <tr><td>kh</td><td>A breathy k, like the ch in "loch"</td></tr>
    <tr><td>nh</td><td>ny, as in "canyon"</td></tr>
    <tr><td>ng</td><td>As in "sing", including at the start of a word</td></tr>
    <tr><td>ơ, â</td><td>uh</td></tr>
    <tr><td>ô / o</td><td>oh / aw</td></tr>
    <tr><td>ê / e</td><td>ay / eh</td></tr>
  </table>
  <h2 class="group">You and I</h2>
  <p class="note">Tôi (I) and bạn (you) are neutral and safe for a visitor. Locals usually swap in age-based words such as anh (older man), chị (older woman) and em (younger person).</p>
  <h2 class="group">North vs South</h2>
  <p class="note">Every phrase here is understood nationwide; what shifts between Hanoi and Ho Chi Minh City is the accent and a few word choices.</p>
  <table>
    <tr><th>What changes</th><th>Hanoi</th><th>Ho Chi Minh City</th></tr>
    <tr><td>Polite yes</td><td>Vâng (vuhng)</td><td>Dạ (yah)</td></tr>
    <tr><td>Thank you</td><td>Cảm ơn, dipping tone</td><td>Often Cám ơn, rising tone</td></tr>
    <tr><td>d and gi</td><td>z</td><td>y</td></tr>
    <tr><td>v</td><td>v</td><td>Often y, so vệ sinh is close to "yay shin"</td></tr>
    <tr><td>Final -nh (Anh, sinh)</td><td>aing, sing</td><td>an, shin</td></tr>
    <tr><td>Broken tone (ã)</td><td>Rise with a catch in the throat</td><td>Said like the dipping tone</td></tr>
  </table>`;
function renderGuide() {
  main.innerHTML = GUIDE;
  $("#status").textContent = "Pronunciation guide";
}

function render() {
  if (state.mode === "cards") renderCard();
  else if (state.mode === "quiz") renderQuiz();
  else if (state.mode === "list") renderList();
  else if (state.mode === "guide") renderGuide();
  else renderSettings();
}

// ---------- settings ----------
function renderSettings() {
  const opt = (v, label, cur) => `<option value="${v}"${v === cur ? " selected" : ""}>${label}</option>`;
  main.innerHTML = `
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
  for (const id of ["voice", "speed"]) {
    $("#" + id).onchange = () => {
      state.settings[id] = $("#" + id).value;
      store.set("translation-" + id, state.settings[id]);
      speak(state.phrases.find((p) => p.id === "hello") || state.phrases[0]);
    };
  }
  $("#sample").onclick = () => speak(state.phrases.find((p) => p.id === "hello") || state.phrases[0]);
  $("#status").textContent = "Settings are saved on this device";
}

// ---------- boot ----------
async function boot() {
  try {
    const r = await fetch("phrases.json", { cache: "no-cache" });
    state.phrases = await r.json();
  } catch {
    try { state.phrases = await (await fetch("phrases.json")).json(); } catch { main.textContent = "Could not load phrases."; return; }
  }
  const cats = [...new Set(state.phrases.map((p) => p.cat))];
  $("#cat").innerHTML = `<option value="all">All</option>` + cats.map((c) => `<option>${c}</option>`).join("");
  for (const [id, key] of [["cat", "translation-cat"], ["dir", "translation-dir"]]) {
    const saved = store.get(key, null);
    if (saved && [...$("#" + id).options].some((o) => o.value === saved)) $("#" + id).value = saved;
    $("#" + id).onchange = () => { store.set(key, $("#" + id).value); state.last = null; render(); };
  }
  if (!["f", "m", "mixed"].includes(state.settings.voice)) state.settings.voice = "f";
  if (!["1", "0.85", "0.7"].includes(state.settings.speed)) state.settings.speed = "1";
  $("#listen").checked = store.get("translation-listen", false);
  $("#listen").onchange = () => { store.set("translation-listen", $("#listen").checked); render(); };
  document.querySelectorAll(".tab").forEach((b) => b.onclick = () => {
    state.mode = b.dataset.mode;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === b));
    // topic/direction/listening-only mean nothing on the guide and settings pages
    $(".opts").hidden = state.mode === "guide" || state.mode === "settings";
    render();
  });
  render();
}
boot();

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
