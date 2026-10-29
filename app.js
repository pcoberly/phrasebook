"use strict";

// This copy of the app's version. It must match CACHE in sw.js; a newer CACHE on the server means an update.
const VERSION = "phrasebook-v40";
const DAY = 86400000;
const INTERVALS = [0, 1, 3, 7, 14, 30]; // days per Leitner box
const ROUND_CHOICES = ["10", "20", "50"]; // questions in one quiz round, chosen in Settings
const GAP_CHOICES = ["1", "2", "3", "5"]; // seconds between the two sides of a phrase in Play all
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode etc. */ } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* private mode etc. */ } },
};

// Anonymous usage counts, with no cookies and no personal data: visits with Cloudflare Web Analytics, and
// which features and languages are used with GoatCounter. Nothing is recorded about phrases, progress or scores.
// Counting is off on localhost, for anyone whose browser says Do Not Track, and on a device opened once with
// ?analytics=off (?analytics=on undoes it). It fails quietly when offline.
const ANALYTICS_TOKEN = "5720307f64814acea36e11d2a3b09d31"; // Cloudflare: a public site token, safe to publish
const GOATCOUNTER_URL = "https://phrasebook.goatcounter.com/count"; // GoatCounter: the public address of the counter
let analyticsOn = false;
const countQueue = []; // events that happen before GoatCounter's script has finished loading
(function loadAnalytics() {
  try {
    const choice = new URLSearchParams(location.search).get("analytics");
    if (choice === "off") localStorage.setItem("phrasebook-no-analytics", "1");
    if (choice === "on") localStorage.removeItem("phrasebook-no-analytics");
    if (["localhost", "127.0.0.1"].includes(location.hostname) || localStorage.getItem("phrasebook-no-analytics") || navigator.doNotTrack === "1") return;
    analyticsOn = true;
    if (ANALYTICS_TOKEN) {
      const cf = document.createElement("script");
      cf.type = "module"; // as in the snippet Cloudflare gives
      cf.src = "https://static.cloudflareinsights.com/beacon.min.js";
      cf.dataset.cfBeacon = JSON.stringify({ token: ANALYTICS_TOKEN });
      document.head.appendChild(cf);
    }
    const gc = document.createElement("script");
    gc.async = true;
    gc.dataset.goatcounter = GOATCOUNTER_URL;
    gc.src = "https://gc.zgo.at/count.js";
    gc.onload = () => { if (window.goatcounter && window.goatcounter.count) while (countQueue.length) track(...countQueue.shift()); };
    gc.onerror = () => { analyticsOn = false; countQueue.length = 0; }; // offline or blocked: stop trying
    document.head.appendChild(gc);
  } catch { /* storage or DOM unavailable: no analytics */ }
})();
// Count one thing that happened, such as "quiz/finished/ja". Names never contain a phrase or a person.
function track(name, title) {
  if (!analyticsOn) return;
  if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: name, title: title || name, event: true });
  else if (countQueue.length < 50) countQueue.push([name, title]);
}

const $ = (s) => document.querySelector(s);
const main = $("#main");
// ---------- the app's own words, in the language you know ----------
// Buttons, labels and messages are written here in English. A language you know can translate them in its pack's
// lang/<code>/for-<code>/ui.json (English text -> its own), which downloads only while it is the language you know.
// Anything not translated stays in English. {name} marks a value filled in.
let ui = {};
function t(s, vars) {
  const out = ui[s] ?? s;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : out;
}
// a language's name, in the language you know ("Vietnamese", or "vietnamita" for a Spanish speaker)
const langName = (l) => t(l.name);
// the words in index.html itself: data-t names the text, data-t-aria the label read out by a screen reader
function translatePage() {
  document.documentElement.lang = state.known.code;
  document.querySelectorAll("[data-t]").forEach((el) => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll("[data-t-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.tAria)));
}
// the interface text of the language you know (from its pack once downloaded, else straight from the server)
async function loadUi(code) {
  ui = {};
  if (code === "en") return;
  try {
    const res = await fetch(`lang/${code}/for-${code}/ui.json`);
    if (res.ok) ui = await res.json();
  } catch { /* offline and not downloaded: English */ }
}
// English, the language you know unless you choose another (its text is the "en" of phrases.json; its audio a pack of its own)
const ENGLISH = { code: "en", name: "English", native: "English", ttsLang: "en-US" };
const state = {
  languages: [],  // languages.json: every language the app offers
  shared: [],     // phrases.json: the phrases every language shares (id, English, topic)
  lang: null,     // the language being studied
  base: store.get("phrasebook-base", "en"), // the language you know, as chosen ("I speak" in Settings)
  known: ENGLISH, // the language you know, as in use: English when the chosen one is the one being studied, or can't load
  phrases: [],    // shared phrases merged with the active language's text, say, tones, note
  mode: "list",
  topics: [],     // the topics chosen, as slugs ("food"); none means all of them
  progress: {},
  skipped: new Set(), // ids of the phrases you chose not to practise in this language
  settings: {
    voice: store.get("phrasebook-voice", "f"), speed: store.get("phrasebook-speed", "1"), round: store.get("phrasebook-round", "20"),
    gap: store.get("phrasebook-gap", "2"), twice: store.get("phrasebook-twice", "no"), // Play all: seconds between, and say it twice
  },
  last: null,
  firstRun: false, // true until a brand-new person has chosen a language
  choosing: null,  // the language being downloaded from the welcome screen
  round: null,    // the quiz round in progress: its questions, where you are, your score and your misses
  busy: {},      // language code -> message while it downloads
  note: "",       // temporary footer message
  updateReady: false, // a newer version is waiting: the footer becomes a reload button
  version: VERSION,
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

// Wired headphones (and some Bluetooth gear) doze off while nothing plays and wake too late for a phrase's first
// syllable (see Play all). So a tap starts the faint hum at once, during the tap, the only moment iOS lets a page
// start sound, and the same player then plays the phrase, once loaded, with a short lead of hum in front.
const tapPlayer = new Audio();
const TAP_LEAD = 0.4; // seconds of hum before the phrase: the phrase usually loads before the hum has got going
let tapUrl = null;
let tapRun = 0; // a newer tap (or Play all) makes an older one's phrase, still loading, never play
function stopSpeaking() {
  tapRun++;
  tapPlayer.pause();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
// Muted (on a bus, say): cards and the quiz stop speaking by themselves. A tap on 🔊, or Play all, still plays.
let muted = store.get("phrasebook-mute", false);
const autoSpeak = (p) => { if (!muted) speak(p); };
function setMuted(on) {
  muted = on;
  store.set("phrasebook-mute", on);
  $("#mute").setAttribute("aria-pressed", on);
  $("#mute").textContent = on ? t("🔇 Muted") : t("🔊 Sound on");
  if (on) stopSpeaking();
}
function speak(p) {
  stopSpeaking();
  const run = tapRun;
  const pref = state.settings.voice;
  const voice = pref === "mixed" ? (Math.random() < 0.5 ? "f" : "m") : pref;
  const rate = parseFloat(state.settings.speed) || 1;
  tapPlayer.src = SILENCE;
  tapPlayer.playbackRate = 1;
  tapPlayer.play().catch(() => {});
  // the phrase plays at its speed, hum and all, so the lead is cut to TAP_LEAD × speed to last TAP_LEAD
  withLead(`audio/${state.lang.code}/${voice}/${p.id}.mp3`, TAP_LEAD * rate).then((parts) => {
    if (run !== tapRun) return;
    if (!parts) { tapPlayer.pause(); speakWithBrowserVoice(p); return; } // audio file missing: the device's voice
    if (tapUrl) URL.revokeObjectURL(tapUrl);
    tapUrl = URL.createObjectURL(new Blob(parts, { type: "audio/mpeg" }));
    tapPlayer.src = tapUrl;
    tapPlayer.playbackRate = rate;
    tapPlayer.play().catch(() => {});
  });
}
function speakWithBrowserVoice(p) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance((p.spoken || p.text).replace(/\.\.\.|…/g, ""));
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
// Phrases you don't want to practise (the beer phrase, if you don't drink), one list per language, shown as an empty
// circle where the others have a filled ✓. Cards, new quiz rounds and Play all leave them out; the List still shows
// them, faded. (Kept as "skipped" in storage, from when the control was a Skip link.)
const skipKey = (code) => "phrasebook-skip-" + code;
const isSkipped = (p) => state.skipped.has(p.id);
function loadSkipped() {
  const ids = store.get(skipKey(state.lang.code), []);
  state.skipped = new Set(Array.isArray(ids) ? ids : []);
}
function setSkipped(p, on) {
  if (on) state.skipped.add(p.id); else state.skipped.delete(p.id);
  store.set(skipKey(state.lang.code), [...state.skipped]);
  state.last = null;
}
// "to" = English prompt, answer in the language; "from" = the other way round
function candidates() {
  const dirSel = $("#dir").value;
  const dirs = dirSel === "mixed" ? ["to", "from"] : [dirSel];
  const out = [];
  for (const p of state.phrases) {
    if (!inTopics(p) || isSkipped(p)) continue;
    for (const dir of dirs) out.push({ p, dir, key: keyOf(p, dir) });
  }
  return out;
}
function next() {
  let items = candidates();
  if (!items.length) return null; // a topic this language has no phrases for yet
  if (items.length > 1 && state.last) items = items.filter((i) => i.key !== state.last);
  const now = Date.now();
  const due = items.filter((i) => !state.progress[i.key] || state.progress[i.key].due <= now);
  const pool = due.length ? due : items.sort((a, b) => state.progress[a.key].due - state.progress[b.key].due).slice(0, 3);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  state.last = pick.key;
  return pick;
}

// ---------- the language you know ----------
// Prompts, answers and Play all's other half are in the language you know: English, or a language marked "base" in
// languages.json, whose own pack gives its text and audio. Notes, "sounds like" spellings, guides and the app's
// buttons are written for English speakers, so they stay in English for now.
const knownLanguages = () => [ENGLISH, ...state.languages.filter((l) => l.base)];
// the one to use: the chosen one, unless it is the language being studied (French from French makes no sense)
function wantedKnown() {
  const k = knownLanguages().find((l) => l.code === state.base);
  return k && k.code !== state.lang.code ? k : ENGLISH;
}
// text in the language you know, tagged so the device reads and hyphenates it as that language
const own = (s) => `<span lang="${state.known.code}">${esc(s)}</span>`;

// ---------- ui helpers ----------
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// text in the language being studied, tagged so the device picks the right font, and marked right-to-left for
// Hebrew and the like ("rtl" in languages.json) so its punctuation lands on the correct side
const rtlAttr = () => (state.lang.rtl ? ' dir="rtl"' : "");
const nat = (s) => `<span lang="${state.lang.code}"${rtlAttr()}>${esc(s)}</span>`;
// an English note can quote right-to-left words: fence each run off so it doesn't scramble the sentence around it
const RTL_RUN = /[\u0590-\u08FF\uFB1D-\uFEFC]+(?:[\s.,…-]+[\u0590-\u08FF\uFB1D-\uFEFC]+)*[?!.…]*/g;
const noteText = (s) => esc(s).replace(RTL_RUN, "<bdi>$&</bdi>");
// topics are stored as slugs ("getting-around") and shown as names ("Getting Around")
const topicName = (c) => c.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// pronunciation block: "sounds like" spelling, tones when the language has them, and a usage note
function pron(p) {
  return `${p.say ? `<div class="say">${esc(p.say)}</div>` : ""}${p.tones ? `<div class="tones">${esc(p.tones)}</div>` : ""}${womanForm(p)}`;
}
// where a woman says the phrase differently (Hebrew "I don't understand": mevin / mevina), its "female" form;
// the female voice speaks that form, so both are shown
function womanForm(p) {
  const f = p.female;
  if (!f) return "";
  return `<div class="woman">${t("A woman says:")} ${f.text ? `<b>${nat(f.text)}</b> ` : ""}${f.say ? `<i>${esc(f.say)}</i>` : ""}</div>`;
}
const noteOf = (p) => (p.note ? `<div class="note">${noteText(p.note)}</div>` : "");
// languages marked "draft" in languages.json have not been checked by a native speaker
function draftBanner() {
  return state.lang.draft
    ? `<p class="draft">${t("Draft {name}: not yet checked by a native speaker. Trust the audio over the spelling, and check anything important with a local.", { name: esc(langName(state.lang)) })}</p>`
    : "";
}
function updateStatus() {
  $("#status").classList.toggle("ready", !!state.updateReady); // a pending app update turns the footer into a reload button
  if (state.note) { $("#status").textContent = state.note; return; }
  const active = new Set(state.phrases.filter((p) => !isSkipped(p)).map((p) => p.id));
  const known = Object.entries(state.progress).filter(([k, v]) => v.box >= 3 && active.has(k.split(":")[0])).length;
  const skipped = state.phrases.length - active.size;
  $("#status").textContent = t("{known} of {all} cards learned", { known, all: active.size * 2 }) + (skipped ? " · " + t("{n} left out", { n: skipped }) : "");
}
// a page's own line in the footer, such as "Tap 🔊 to hear a phrase"; it never covers the "new version" message
function hint(text) {
  if (state.updateReady) return;
  $("#status").textContent = text;
}
function say(note, ms = 0) {
  if (state.updateReady) return; // never hide the "new version" message
  state.note = note;
  updateStatus();
  if (ms) setTimeout(() => { if (state.note === note) { state.note = ""; updateStatus(); } }, ms);
}

// ---------- cards ----------
function emptyTopic() {
  const several = state.topics.length > 1;
  const chosen = state.phrases.filter(inTopics);
  if (chosen.length && chosen.every(isSkipped)) {
    return `<div class="card">${t(several ? "Every phrase in these topics is left out of practice. Tick some back in the List, or choose another topic." : "Every phrase in this topic is left out of practice. Tick some back in the List, or choose another topic.")}</div>`;
  }
  return `<div class="card">${t(several ? "{name} has no phrases in these topics yet. Choose another topic." : "{name} has no phrases in this topic yet. Choose another topic.", { name: esc(langName(state.lang)) })}</div>`;
}
// The ✓ circle: practise this phrase, or (empty) leave it out
function practiseButton(p) {
  const on = !isSkipped(p);
  return `<button class="practise${on ? " on" : ""}" data-skip="${p.id}" aria-pressed="${on}" aria-label="${t("Practise this phrase")}"></button>`;
}
// make every ✓ circle under root work; then(p, on) runs after each change
function wirePractise(root, then = () => {}) {
  root.querySelectorAll("button.practise").forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const p = state.phrases.find((x) => x.id === b.dataset.skip);
    const on = isSkipped(p); // tapping flips it
    setSkipped(p, !on);
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
    then(p, on);
  });
}
function renderCard() {
  const item = next();
  if (!item) { main.innerHTML = emptyTopic(); updateStatus(); return; }
  const { p, dir, key } = item;
  const name = esc(langName(state.lang));
  const yourName = esc(langName(state.known));
  const listenOnly = $("#listen").checked;
  const fromLang = dir === "from";
  const showFront = !(fromLang && listenOnly);
  const front = fromLang ? nat(p.text) : own(p.known);
  // Two faces share one spot, so the card keeps one height and turns over like a real flashcard.
  main.innerHTML = `
    <div class="cardwrap">
    <div class="flip" id="flip" role="button" tabindex="0" aria-label="${t("Flip the card")}">
      <div class="flip-inner">
        <div class="card face front">
          <div class="label">${fromLang ? name : yourName}</div>
          <div class="big">${showFront ? front : "🎧"}</div>
          ${fromLang ? `<button class="speak" id="say" aria-label="${t("Play")}">🔊</button>` : ""}
          <div class="hint">${t("Tap the card to flip it")}</div>
        </div>
        <div class="card face back">
          <div class="label">${fromLang ? yourName : name}</div>
          <div class="big">${fromLang ? own(p.known) : nat(p.text)}</div>
          <button class="speak" id="say2" aria-label="${t("Play")}">🔊</button>
          <div class="orig">${fromLang ? name : yourName}: <b>${front}</b></div>
          ${pron(p)}
        </div>
      </div>
    </div>
    ${practiseButton(p)}
    </div>
    <div class="detail" id="detail"></div>
    <div class="row sticky hidden" id="grades">
      <button class="act bad" id="again">${t("✗ Didn't know it")}</button>
      <button class="act good" id="got">${t("✓ Knew it")}</button>
    </div>`;
  const flip = $("#flip");
  let seenAnswer = false;
  if (fromLang) { $("#say").onclick = (e) => { e.stopPropagation(); speak(p); }; autoSpeak(p); }
  $("#say2").onclick = (e) => { e.stopPropagation(); speak(p); };
  // leaving it out keeps this card on screen (to grade, or to change your mind); it just won't come up again
  wirePractise(main, (_, on) => say(on ? t("Back in practice.") : t("Left out of practice. Tap the circle again to keep it."), 4000));
  const toggle = () => {
    const flipped = flip.classList.toggle("flipped");
    flip.setAttribute("aria-pressed", flipped);
    autoSpeak(p); // every flip plays the phrase, so you can hear it from either side
    if (!seenAnswer) {
      // the first flip reveals the answer: show the usage note under the card and offer the grade buttons
      seenAnswer = true;
      $("#detail").innerHTML = noteOf(p);
      $("#grades").classList.remove("hidden");
    }
  };
  flip.onclick = toggle;
  flip.onkeydown = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === flip) { e.preventDefault(); toggle(); } };
  $("#again").onclick = () => { grade(key, false); render(); };
  $("#got").onclick = () => { grade(key, true); render(); };
  updateStatus();
}

// ---------- quiz ----------
function distractors(p) {
  // never offer a wrong option that is really a right answer: no same meaning in the language you know, and no same
  // text in the language studied (French says Bonjour for both hello and good morning)
  const others = state.phrases.filter((o) => o.id !== p.id && o.text !== p.text && o.known !== p.known);
  const same = shuffle(others.filter((o) => o.cat === p.cat));
  const rest = shuffle(others.filter((o) => o.cat !== p.cat));
  return [...same, ...rest].slice(0, 2);
}
// A quiz is a round of questions (10, 20 or 50, from Settings), chosen up front from the cards that most need practice:
// new or due ones first (in random order), then whatever comes due soonest. One question per phrase.
function buildRound() {
  const size = parseInt(state.settings.round, 10) || 20;
  const now = Date.now();
  const items = candidates();
  const isDue = (i) => !state.progress[i.key] || state.progress[i.key].due <= now;
  const ordered = [
    ...shuffle(items.filter(isDue)),
    ...items.filter((i) => !isDue(i)).sort((a, b) => state.progress[a.key].due - state.progress[b.key].due),
  ];
  const seen = new Set();
  const picked = [];
  for (const i of ordered) {
    if (picked.length === size) break;
    if (!seen.has(i.p.id)) { seen.add(i.p.id); picked.push(i); }
  }
  // a small topic can run out of distinct phrases: top up with the other direction
  for (const i of ordered) {
    if (picked.length >= Math.min(size, ordered.length)) break;
    if (!picked.includes(i)) picked.push(i);
  }
  return { items: shuffle(picked), index: 0, correct: 0, missed: [], cat: topicsKey(), dir: $("#dir").value, size: state.settings.round };
}
// The round in progress is saved after every answer, so if the phone closes the app in the background
// it carries on where it was. One saved round per language; changing topic, direction or length starts afresh.
const roundKey = (code) => "phrasebook-quiz-" + code;
function saveRound() {
  const r = state.round;
  if (!r) return;
  const ref = (i) => [i.p.id, i.dir];
  store.set(roundKey(state.lang.code), {
    items: r.items.map(ref), missed: r.missed.map((m) => r.items.indexOf(m)),
    index: r.index, correct: r.correct, counted: !!r.counted, cat: r.cat, dir: r.dir, size: r.size,
  });
}
function loadRound() {
  const s = store.get(roundKey(state.lang.code), null);
  if (!s || s.cat !== topicsKey() || s.dir !== $("#dir").value || s.size !== state.settings.round) return null;
  const items = [];
  for (const [id, dir] of s.items) {
    const p = state.phrases.find((x) => x.id === id);
    if (!p) return null; // the phrase list changed since: start a new round
    items.push({ p, dir, key: keyOf(p, dir) });
  }
  return { ...s, items, missed: s.missed.map((n) => items[n]).filter(Boolean) };
}
// Start afresh next time the quiz opens.
function resetRound() {
  state.round = null;
  store.remove(roundKey(state.lang.code));
}
function renderQuiz() {
  if (state.phrases.length < 4) { main.innerHTML = `<div class="card">${t("Need at least 4 phrases.")}</div>`; return; }
  if (!state.round) { state.round = loadRound() || buildRound(); saveRound(); }
  const round = state.round;
  if (!round.items.length) { resetRound(); main.innerHTML = emptyTopic(); updateStatus(); return; }
  if (round.index >= round.items.length) { renderSummary(); return; }
  const { p, dir, key } = round.items[round.index];
  const total = round.items.length;
  const number = round.index + 1;
  const name = esc(langName(state.lang));
  const listenOnly = $("#listen").checked;
  const toLang = dir === "to";
  const opts = shuffle([p, ...distractors(p)]);
  main.innerHTML = `
    <div class="roundbar"><span>${t("Question {n} of {total}", { n: number, total })}</span><span id="score">${t("{n} correct", { n: round.correct })}</span></div>
    <div class="bar"><i style="width:${Math.round(100 * round.index / total)}%"></i></div>
    <div class="card q">
      ${practiseButton(p)}
      <div class="label">${t("Pick the {name}", { name: toLang ? name : esc(langName(state.known)) })}</div>
      <div class="big">${toLang ? own(p.known) : (listenOnly ? "🎧" : nat(p.text))}</div>
      ${toLang ? "" : `<button class="speak" id="say" aria-label="${t("Play")}">🔊</button>`}
    </div>
    <div id="choices"></div>
    <div class="reveal" id="reveal"></div>
    <div class="row sticky hidden" id="nextrow"><button class="act" id="next">${number === total ? t("See score") : t("Next")}</button></div>`;
  if (!toLang) { $("#say").onclick = () => speak(p); autoSpeak(p); }
  wirePractise(main, (_, on) => say(on ? t("Back in practice.") : t("Left out of later rounds. Tap the circle again to keep it."), 4000));
  const box = $("#choices");
  let answered = false;
  opts.forEach((o, i) => {
    const div = document.createElement("div");
    div.className = "choice";
    const label = toLang ? (listenOnly ? t("Option {n}", { n: i + 1 }) : nat(o.text)) : own(o.known);
    div.innerHTML = `<button class="pick"${toLang ? rtlAttr() : ""}>${label}</button>${toLang ? `<button class="speak" aria-label="${t("Play")}">🔊</button>` : ""}`;
    const pick = div.querySelector(".pick");
    if (toLang) div.querySelector(".speak").onclick = () => speak(o);
    pick.onclick = () => {
      if (answered) return;
      answered = true;
      const ok = o.id === p.id;
      grade(key, ok);
      // record the answer and move on at once, so leaving this tab and coming back never asks (or scores) it twice
      if (ok) round.correct++; else round.missed.push(round.items[round.index]);
      round.index++;
      saveRound();
      $("#score").textContent = t("{n} correct", { n: round.correct });
      pick.classList.add(ok ? "right" : "wrong");
      [...box.children].forEach((c, j) => {
        if (opts[j].id === p.id) c.querySelector(".pick").classList.add("right");
        if (toLang) c.querySelector(".pick").innerHTML = nat(opts[j].text);
      });
      autoSpeak(p);
      // the answer is already on screen, so show only what is new: how to say it
      $("#reveal").innerHTML = pron(p);
      $("#nextrow").classList.remove("hidden");
      updateStatus();
    };
    box.appendChild(div);
  });
  $("#next").onclick = render;
  updateStatus();
}

// The score screen at the end of a round: how you did, and the questions you missed.
function renderSummary() {
  const r = state.round;
  if (!r.counted) { r.counted = true; saveRound(); track("quiz/finished/" + state.lang.code); } // once per round, not each time the screen is redrawn
  const total = r.items.length;
  const pct = total ? Math.round((100 * r.correct) / total) : 0;
  const message = t(r.correct === total ? "A perfect round!" : pct >= 80 ? "Great work." : pct >= 50 ? "Good effort." : "Keep going. These will stick.");
  main.innerHTML = `
    <div class="card q summary">
      <div class="label">${t("Round complete")}</div>
      <div class="big">${t("{n} of {total}", { n: r.correct, total })}</div>
      <div class="hint">${message}</div>
    </div>
    ${r.missed.length
      ? `<h2 class="group">${t("To review ({n})", { n: r.missed.length })}</h2>${r.missed.map((i) => entryHtml(i.p, i.dir === "from", false)).join("")}`
      : `<p class="note" style="text-align:center">${t("No mistakes this round.")}</p>`}
    <div class="row sticky"><button class="act good" id="newround">${t("New round")}</button></div>`;
  wireSpeakButtons();
  $("#newround").onclick = () => { resetRound(); render(); };
  window.scrollTo(0, 0);
  updateStatus();
}

// ---------- study list ----------
// one phrase as a row: the language text with how to say it, and the meaning in the language you know, in the order you are studying
function entryHtml(p, fromFirst, withNote = true, withSkip = false) {
  const skipped = withSkip && isSkipped(p);
  return `
      <div class="entry${skipped ? " skipped" : ""}" data-entry="${p.id}">
        <div>
          ${fromFirst ? "" : `<div class="en">${own(p.known)}</div>`}
          <div class="vi"${rtlAttr()}>${nat(p.text)}</div>
          ${p.say ? `<div class="say">${esc(p.say)}</div>` : ""}
          ${womanForm(p)}
          ${fromFirst ? `<div class="en">${own(p.known)}</div>` : ""}
          ${p.tones ? `<div class="tones">${esc(p.tones)}</div>` : ""}
          ${withNote && p.note ? `<div class="note">${noteText(p.note)}</div>` : ""}
        </div>
        <div class="side">
          <button class="speak" data-id="${p.id}" aria-label="${t("Play")}">🔊</button>
          ${withSkip ? practiseButton(p) : ""}
        </div>
      </div>`;
}
function wireSpeakButtons() {
  main.querySelectorAll(".entry .speak").forEach((b) => b.onclick = () => {
    const p = state.phrases.find((x) => x.id === b.dataset.id);
    if (playAll && playAll.playing && state.mode === "list") jumpTo(p.id); // while playing, 🔊 moves the player there
    else speak(p);
  });
}
// the phrases the List shows, grouped by topic, in the order they appear
function listGroups() {
  const groups = {};
  for (const p of state.phrases) if (inTopics(p)) (groups[p.cat] ||= []).push(p);
  return groups;
}
function renderList() {
  const fromFirst = $("#dir").value === "from"; // the language you know first, unless studying the language → yours
  const groups = listGroups();
  const playing = playAll && playAll.playing;
  main.innerHTML = draftBanner() + Object.entries(groups).map(([c, ps]) => `
    <h2 class="group">${esc(t(topicName(c)))}</h2>
    ${ps.map((p) => entryHtml(p, fromFirst, true, true)).join("")}`).join("") + `
    <div class="row sticky"><button class="act${playing ? "" : " good"}" id="playall">${playing ? t("⏸ Pause") : t("▶ Play all")}</button></div>`;
  wireSpeakButtons();
  // changed in place, so the List doesn't jump
  wirePractise(main, (p, on) => main.querySelector(`[data-entry="${CSS.escape(p.id)}"]`).classList.toggle("skipped", !on));
  $("#playall").onclick = () => (playAll && playAll.playing ? pausePlayAll() : startPlayAll());
  if (playAll) markPlaying();
  else hint(t("Tap 🔊 to hear a phrase, or ▶ to hear them all"));
}

// ---------- play all: the List read aloud, for listening on the move ----------
// Each phrase in the List plays in the direction you study: the language you know, a pause, then the language studied
// (or the other way round), then a pause before the next. It goes round the list until you pause it. The pause length
// and "say each phrase twice" are in Settings. English comes from its own small pack ("en"), shared by every language;
// another language you know comes from its own pack.
const player = new Audio(); // one element for the whole run: iOS is likelier to keep a single player going
let playAll = null; // { items, index, playing, run }
let wakeLock = null;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
let finishClip = null; // ends the clip playing now, when paused
// Play a file on the one player and resolve when it has finished (or failed, after onFail has run)
function playFile(src, rate, onFail) {
  return new Promise((resolve) => {
    const done = () => { player.onended = player.onerror = null; finishClip = null; resolve(); };
    finishClip = done;
    player.onended = done;
    player.onerror = () => { player.onended = player.onerror = null; onFail().then(done); };
    player.src = src;
    player.playbackRate = rate;
    player.play().catch((err) => {
      if (err && err.name === "NotAllowedError") pausePlayAll(); // the phone refused to play without a tap
      if (finishClip === done) done();
    });
  });
}
// The pause before each clip is played, not timed: once the screen locks, iOS freezes the timers of a page that has
// gone quiet, so a timed pause never ended and Play all stopped there. The pause and the phrase are joined into one
// clip (MP3s join by putting one after the other), since iOS can drop the first moment after the player changes file.
// The pause is not pure digital silence but a 42 Hz hum at about -63 dB, far too low and quiet to hear: wired
// headphone adapters (and some Bluetooth gear) power down on digital silence and wake too late for the first syllable.
const SILENCE = "audio/silence.mp3";
let silenceBytes = null;
// audio/silence.mp3 (5 s, the longest pause) is made like the phrases (24 kHz mono, 48 kbps, and no bit reservoir),
// so it is a run of 144-byte frames of 24 ms each, one cycle of the hum per frame: any whole number of frames is valid
// audio that ends where it began, so a pause can be cut to the length it needs
const FRAME_BYTES = 144, FRAME_SECONDS = 0.024;
function silenceOf(seconds) {
  const parts = [];
  for (let left = Math.round(seconds / FRAME_SECONDS) * FRAME_BYTES; left > 0; left -= silenceBytes.byteLength) {
    parts.push(silenceBytes.slice(0, Math.min(left, silenceBytes.byteLength)));
  }
  return parts;
}
// The file at src with `seconds` of hum in front, as MP3 parts to join; null if it can't be had (not downloaded, offline)
async function withLead(src, seconds) {
  try {
    if (!silenceBytes) {
      const res = await fetch(SILENCE);
      if (res.ok) silenceBytes = await res.arrayBuffer();
    }
  } catch { /* no hum: the phrase on its own */ }
  try {
    const res = await fetch(src);
    return res.ok ? [...(silenceBytes ? silenceOf(seconds) : []), await res.arrayBuffer()] : null;
  } catch {
    return null;
  }
}
async function playJoined(parts, rate, onFail) {
  const url = URL.createObjectURL(new Blob(parts, { type: "audio/mpeg" }));
  try { await playFile(url, rate, onFail); } finally { URL.revokeObjectURL(url); }
}
// Play one side of a phrase after `gap` seconds of silence (if its file is missing, the device's own voice says it)
async function playClip(code, p, gap, still) {
  const pref = state.settings.voice;
  const voice = pref === "mixed" ? (Math.random() < 0.5 ? "f" : "m") : pref;
  const rate = code !== state.lang.code ? 1 : parseFloat(state.settings.speed) || 1; // you already know your own language
  const src = `audio/${code}/${voice}/${p.id}.mp3`;
  const sayIt = () => deviceVoice(code, p);
  if (!gap) return playFile(src, rate, sayIt); // straight after a tap: play at once, while the phone still allows it
  // the clip plays at the phrase's speed, so the pause is cut to gap × speed and still lasts the pause you chose
  const parts = await withLead(src, gap * rate);
  if (!still()) return;
  if (!parts) { // the phrase isn't downloaded: the pause on its own, then the device's voice
    if (silenceBytes) await playJoined(silenceOf(gap), 1, () => sleep(gap * 1000));
    return still() && playFile(src, rate, sayIt);
  }
  await playJoined(parts, rate, sayIt);
}
// The audio file is missing (not downloaded yet): say it with the device's voice instead
function deviceVoice(code, p) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) { resolve(); return; }
    const yours = code !== state.lang.code; // the language you know
    const u = new SpeechSynthesisUtterance((yours ? p.known : p.spoken || p.text).replace(/\.\.\.|…/g, ""));
    u.lang = yours ? state.known.ttsLang : state.lang.ttsLang;
    if (!yours && browserVoice) u.voice = browserVoice;
    u.rate = yours ? 1 : 0.85;
    const timer = setTimeout(resolve, 10000); // never wait for ever on a voice that doesn't report back
    u.onend = u.onerror = () => { clearTimeout(timer); resolve(); };
    speechSynthesis.speak(u);
  });
}
async function runPlayAll(run) {
  const pa = playAll;
  const still = () => playAll === pa && pa.playing && pa.run === run;
  let first = true; // the first clip after a tap plays at once; every later one comes after the pause
  while (still()) {
    if (pa.items.every(isSkipped)) { pausePlayAll(); return; }
    const p = pa.items[pa.index];
    if (isSkipped(p)) { pa.index = (pa.index + 1) % pa.items.length; continue; } // skipped, perhaps while playing
    markPlaying();
    const lang = state.lang.code;
    const twice = state.settings.twice === "yes";
    const yours = state.known.code;
    const order = $("#dir").value === "from" ? [lang, ...(twice ? [lang] : []), yours] : [yours, lang, ...(twice ? [lang] : [])];
    for (const code of order) {
      await playClip(code, p, first ? 0 : parseFloat(state.settings.gap), still);
      first = false;
      if (!still()) return;
    }
    pa.index = (pa.index + 1) % pa.items.length; // round again at the end
  }
}
function startPlayAll() {
  const items = Object.values(listGroups()).flat();
  if (!items.length) return;
  // the same list as last time carries on where it paused (with any phrases updated since); a different one starts at the top
  if (!playAll || playAll.items.length !== items.length || playAll.items.some((p, i) => p.id !== items[i].id)) {
    playAll = { items, index: 0, playing: false, run: 0 };
  }
  playAll.items = items;
  stopSpeaking();
  playAll.playing = true;
  playAll.run++;
  track("playall/" + state.lang.code);
  keepAwake(true);
  setMediaSession();
  runPlayAll(playAll.run);
  if (state.mode === "list") renderList();
}
function pausePlayAll() {
  if (!playAll || !playAll.playing) return;
  playAll.playing = false;
  playAll.run++;
  player.pause();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  finishClip?.();
  keepAwake(false);
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
  if (state.mode === "list") renderList();
}
// Stop and forget the place: the list it was playing has changed (topic, direction, language or tab)
function stopPlayAll() {
  pausePlayAll();
  playAll = null;
}
function jumpTo(id) {
  const i = playAll.items.findIndex((p) => p.id === id);
  if (i < 0) return;
  playAll.index = i;
  playAll.run++;
  player.pause();
  finishClip?.();
  runPlayAll(playAll.run);
}
// Highlight the phrase playing, keep it in view, and say where the player is
function markPlaying() {
  const pa = playAll;
  const p = pa.items[pa.index];
  main.querySelectorAll(".entry.playing").forEach((e) => e.classList.remove("playing"));
  const row = main.querySelector(`[data-entry="${CSS.escape(p.id)}"]`);
  if (state.mode === "list" && row) {
    row.classList.add("playing");
    if (pa.playing && !document.hidden) row.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  if (state.mode === "list") hint(t(pa.playing ? "Playing {n} of {total}" : "Paused at {n} of {total}", { n: pa.index + 1, total: pa.items.length }));
  if ("mediaSession" in navigator && "MediaMetadata" in window) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: p.known, artist: `${p.text} · ${langName(state.lang)}`, album: "PhraseBook",
      artwork: [{ src: "icon-v3-512.png", sizes: "512x512", type: "image/png" }],
    });
    navigator.mediaSession.playbackState = pa.playing ? "playing" : "paused";
  }
}
// The lock screen, headphones and the car can pause, resume and skip
function setMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  const skip = (d) => () => { if (playAll) jumpTo(playAll.items[(playAll.index + d + playAll.items.length) % playAll.items.length].id); };
  const handlers = { play: startPlayAll, pause: pausePlayAll, nexttrack: skip(1), previoustrack: skip(-1) };
  for (const [action, fn] of Object.entries(handlers)) {
    try { ms.setActionHandler(action, fn); } catch { /* not supported here */ }
  }
}
// Keep the screen on while playing (a phone in a car holder), so the phone doesn't lock and stop the sound
async function keepAwake(on) {
  try {
    if (on && !wakeLock && "wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* refused or not supported: the screen may lock as usual */ }
}
// The phone gives the wake lock back when the app is hidden: take it again on return
document.addEventListener("visibilitychange", () => { if (!document.hidden && playAll && playAll.playing) keepAwake(true); });

// ---------- guide: one page per language ----------
// the guide written for speakers of the language you know (lang/<code>/for-<yours>/guide.html), else the English one
async function renderGuide() {
  const code = state.lang.code;
  main.innerHTML = `<p class="note">${t("Loading…")}</p>`;
  hint(t("{name} pronunciation guide", { name: langName(state.lang) }));
  const get = async (path) => {
    const res = await fetch(path);
    if (!res.ok) throw new Error(res.status);
    return res.text();
  };
  try {
    const yours = state.known.code;
    const html = await (yours !== "en" ? get(`lang/${code}/for-${yours}/guide.html`).catch(() => get(`lang/${code}/guide.html`)) : get(`lang/${code}/guide.html`));
    if (state.mode === "guide" && state.lang.code === code) main.innerHTML = html;
  } catch {
    if (state.mode === "guide") main.innerHTML = `<p class="note">${t("The guide isn't available offline until {name} has finished downloading.", { name: esc(langName(state.lang)) })}</p>`;
  }
}

// ---------- first run: choose a language ----------
function pickerRow(l) {
  const note = state.busy[l.code] || `${(l.bytes / 1e6).toFixed(1)} MB${l.draft ? " · " + t("Draft translations") : ""}`;
  return `
    <div class="lang" data-lang="${l.code}">
      <div class="linfo"><div class="lname">${esc(langName(l))} <span class="note" lang="${l.code}">${esc(l.native)}</span></div>
        <div class="note"><span class="lstate">${esc(note)}</span></div></div>
      <div class="lbtn">${state.choosing ? "" : `<button class="mini" data-pick="${l.code}">${t("Start")}</button>`}</div>
    </div>`;
}
// the "I speak" choices, each in its own language (English, Deutsch, Español), whatever language the app is in,
// so anyone can find theirs
const knownSelect = () => knownLanguages().map((l) => `<option value="${l.code}"${l.code === state.base ? " selected" : ""} lang="${l.code}">${esc(l.native)}</option>`).join("");
function renderWelcome() {
  document.body.classList.add("firstrun");
  const choices = [...state.languages].sort((a, b) => langName(a).localeCompare(langName(b)));
  main.innerHTML = `
    <div class="welcome">
      <h1>${t("Welcome to PhraseBook")}</h1>
      <div class="setting"><label for="wknown">${t("I speak")}</label><select id="wknown">${knownSelect()}</select></div>
      <p class="lead">${t("Which language would you like to learn?")}</p>
      <p class="note">${t("Tap one to download it. That needs a connection once, and afterwards the app works without one. You can add more languages later in Settings.")}</p>
      <div id="welcomelangs">${choices.map(pickerRow).join("")}</div>
    </div>`;
  // the welcome screen changes to the language chosen (its interface text comes straight from the server)
  $("#wknown").onchange = async () => {
    state.base = $("#wknown").value;
    store.set("phrasebook-base", state.base);
    await loadUi(state.base);
    state.known = knownLanguages().find((l) => l.code === state.base) || ENGLISH;
    translatePage();
    setMuted(muted);
    renderWelcome();
  };
  $("#welcomelangs").onclick = (e) => {
    const b = e.target.closest("button[data-pick]");
    if (b) chooseFirstLanguage(b.dataset.pick);
  };
}
async function chooseFirstLanguage(code) {
  if (state.choosing) return;
  state.choosing = code;
  state.busy[code] = t("Starting…");
  renderWelcome();
  try {
    if (canCache) {
      await syncPack(code, (done, total) => {
        state.busy[code] = t("Downloading {done} of {total}", { done, total });
        const el = document.querySelector(`[data-lang="${code}"] .lstate`);
        if (el) el.textContent = state.busy[code];
      });
      track("download/" + code);
    }
    await useLanguage(code);
    if (canCache) syncKnownPack().catch(() => {}); // the language you know, for Play all, follows in the background (and is retried later)
    track("language/" + code);
    delete state.busy[code];
    state.choosing = null;
    state.firstRun = false;
    document.body.classList.remove("firstrun");
    render();
  } catch {
    state.choosing = null;
    state.busy[code] = t("Couldn't download. Check you're online and try again.");
    renderWelcome();
    setTimeout(() => { delete state.busy[code]; if (state.firstRun && !state.choosing) renderWelcome(); }, 5000);
  }
}

function render() {
  if (state.firstRun) { renderWelcome(); return; }
  if (state.mode === "cards") renderCard();
  else if (state.mode === "quiz") renderQuiz();
  else if (state.mode === "list") renderList();
  else if (state.mode === "guide") renderGuide();
  else renderSettings();
}

// ---------- language packs: only the languages you choose are stored on the device ----------
// A pack is everything for one language: its text, guide and audio. lang/<code>/pack.json
// lists every file with a hash, so a pack downloads once and later updates fetch only what changed.
const canCache = "caches" in window;
const packKey = (code) => "phrasebook-pack-" + code;
const cacheName = (code) => "lang-" + code;
function packState(code) {
  const rec = store.get(packKey(code), null);
  return rec ? (rec.complete ? "installed" : "partial") : "none";
}
// One download per language at a time: asking again while it runs joins the one under way (and hears its progress).
const syncs = {};
function syncPack(code, onProgress) {
  let s = syncs[code];
  if (!s) {
    s = syncs[code] = { listeners: new Set() };
    s.promise = downloadPack(code, (done, total) => s.listeners.forEach((f) => f(done, total)))
      .finally(() => { delete syncs[code]; });
  }
  if (onProgress) s.listeners.add(onProgress);
  return s.promise;
}
// Ask the browser to keep downloaded languages. Without this, Safari can clear a website's storage after a
// week or so unused (a Home Screen app is safe). Safari, Chrome and Edge decide quietly; Firefox on a computer
// or Android would ask with a pop-up instead, so it is not asked.
function keepStorage() {
  if (/Firefox\//.test(navigator.userAgent)) return;
  try { navigator.storage?.persist?.().catch(() => {}); } catch { /* not supported */ }
}
async function downloadPack(code, onProgress) {
  if (!canCache) throw new Error("This browser cannot keep languages offline");
  const res = await fetch(`lang/${code}/pack.json`, { cache: "no-store" });
  if (!res.ok) throw new Error("pack.json " + res.status);
  const manifest = await res.json();
  // files written for speakers of a language (its notes and guide for them, or its interface text) come only while
  // it is the language you know; switching away removes them below, as files no longer listed
  const wanted = { ...manifest.files, ...(manifest.forBase?.[wantedKnown().code] || {}) };
  const rec = store.get(packKey(code), { complete: false, files: {} });
  const cache = await caches.open(cacheName(code));
  for (const path of Object.keys(rec.files)) {
    if (!(path in wanted)) { await cache.delete(path); delete rec.files[path]; }
  }
  const todo = [];
  for (const [path, hash] of Object.entries(wanted)) {
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
      const r = await fetch(`${path}?sync=${wanted[path]}`); // ?sync makes the service worker step aside
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      await cache.put(path, r);
      rec.files[path] = wanted[path];
      store.set(packKey(code), rec);
      onProgress?.(++done, total);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  rec.complete = true;
  store.set(packKey(code), rec);
  keepStorage();
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
  // the language you know: its text from its own pack, or English (also when that pack can't load, offline before
  // it has downloaded); a phrase it has no text for yet shows in English
  let k = wantedKnown(), theirs = null;
  if (k !== ENGLISH) {
    try {
      const r = await fetch(`lang/${k.code}/phrases.json`);
      if (r.ok) theirs = await r.json();
    } catch { /* offline and not downloaded */ }
    if (!theirs) k = ENGLISH;
  }
  state.known = k;
  await loadUi(k.code);
  if (k.code !== wantedKnown().code) say(t("{name} isn't downloaded yet, so English is shown. Go online to get it.", { name: langName(wantedKnown()) }), 6000);
  // notes, "sounds like" spellings and tones written for speakers of your language (lang/<code>/for-<yours>/notes.json),
  // over the English ones; a phrase or field not yet written for them stays in English
  let notes = {};
  if (k !== ENGLISH) {
    try {
      const r = await fetch(`lang/${code}/for-${k.code}/notes.json`);
      if (r.ok) notes = await r.json();
    } catch { /* not written yet, or offline */ }
  }
  state.phrases = state.shared.filter((p) => texts[p.id]).map((p) => {
    const mine = notes[p.id] || {};
    const female = texts[p.id].female && { ...texts[p.id].female, ...mine.female };
    return { ...p, ...texts[p.id], ...mine, ...(female ? { female } : {}), known: theirs?.[p.id]?.text || p.en };
  });
  translatePage();
}
// Packs downloaded only because they were the language you know, not chosen to learn. Switching away removes them,
// so only what you use stays on the device (and is kept up to date). English's own pack is always one of these, as
// English is never a language to learn here; a language you choose to learn stops being one.
const KNOWN_ONLY = "phrasebook-known-only";
const knownOnly = () => store.get(KNOWN_ONLY, []);
function syncKnownPack(code = state.known.code, onProgress) {
  if (code !== state.lang.code && packState(code) === "none" && !knownOnly().includes(code)) store.set(KNOWN_ONLY, [...knownOnly(), code]);
  return syncPack(code, onProgress);
}
// the language you know was `before`: remove its pack unless something still needs it
async function dropKnownPack(before) {
  if (!canCache || before === state.known.code || before === state.lang.code || before === wantedKnown().code) return;
  if (before !== ENGLISH.code && !knownOnly().includes(before)) return; // a language you chose to learn
  await removePack(before);
  store.set(KNOWN_ONLY, knownOnly().filter((c) => c !== before));
}
// "I speak" changed: download that language if need be (its text and its audio for Play all), use it, and remove
// the one it replaces
async function setKnown(code) {
  const before = state.known.code;
  state.base = code;
  store.set("phrasebook-base", code);
  const k = wantedKnown();
  if (canCache) {
    try {
      // its pack (with its interface text), then what the language being learned has written for its speakers
      await syncKnownPack(k.code, (done, total) => say(t("Downloading {name}: {done} of {total}", { name: langName(k), done, total })));
      if (!state.firstRun) await syncPack(state.lang.code);
      say("");
    } catch {
      say(t("Couldn't download {name}. Check you're online and try again.", { name: langName(k) }), 6000);
    }
  }
  if (state.firstRun) return; // nothing is loaded until a language to learn is chosen
  await loadLanguageData();
  state.round = null; // reloaded from storage, with the new text
  state.last = null;
  stopPlayAll();
  rebuildDirOptions();
  rebuildTopicOptions();
  setMuted(muted);
  await dropKnownPack(before).catch(() => {});
  syncInstalled().catch(() => {}); // the other downloaded languages: their files for the old language you spoke go, the new one's come
}
function rebuildDirOptions() {
  const n = esc(langName(state.lang));
  const sel = $("#dir");
  const saved = store.get("phrasebook-dir", "mixed");
  const k = esc(langName(state.known));
  sel.innerHTML = `<option value="mixed">${t("Both Directions")}</option><option value="to">${k} → ${n}</option><option value="from">${n} → ${k}</option>`;
  sel.value = ["mixed", "to", "from"].includes(saved) ? saved : "mixed";
}
async function useLanguage(code) {
  const previous = state.lang;
  const before = state.known.code;
  state.lang = state.languages.find((l) => l.code === code);
  try {
    await loadLanguageData();
  } catch (err) {
    state.lang = previous; // keep studying what we had
    throw err;
  }
  store.set("phrasebook-lang", code);
  state.progress = store.get(progressKey(code), {});
  loadSkipped();
  state.last = null;
  state.round = null;
  stopPlayAll();
  rebuildDirOptions();
  pickVoice();
  store.set(KNOWN_ONLY, knownOnly().filter((c) => c !== code)); // chosen to learn: it stays when you switch what you speak
  dropKnownPack(before).catch(() => {}); // learning the language you speak means English is used for it, and the other way round
}
// Keep the language in use, and any other downloaded one, up to date. Runs quietly when online.
async function syncInstalled() {
  if (state.firstRun || !canCache || !navigator.onLine) return false; // nothing downloads before a language is chosen
  const codes = state.languages.map((l) => l.code).filter((c) => c === state.lang.code || packState(c) !== "none");
  let activeChanged = false;
  for (const code of codes) {
    const label = langName(state.languages.find((l) => l.code === code));
    try {
      const changed = await syncPack(code, (done, total) => {
        if (code === state.lang.code) say(t("Downloading {name}: {done} of {total}", { name: label, done, total }));
      });
      if (changed && code === state.lang.code) { activeChanged = true; say(t("{name} is ready to use offline", { name: label }), 4000); }
      else if (code === state.lang.code && state.note) say("");
    } catch {
      if (code === state.lang.code) say("");
    }
  }
  syncKnownPack().catch(() => {}); // the language you know, for Play all: kept current quietly
  return activeChanged;
}

// ---------- staying up to date ----------
// Whenever the app opens or comes back to the foreground with a connection, it checks for a newer version of
// itself and for new phrases, audio and languages. With no connection it just keeps using what it has stored.
async function swVersion() {
  // the server's version is the cache name in its sw.js; this copy's version is VERSION
  try {
    const text = await (await fetch("sw.js", { cache: "no-store" })).text();
    return /CACHE = "([^"]+)"/.exec(text)?.[1] || null;
  } catch { return null; }
}
// ---------- topics: all of them, one, or several ----------
const topicList = () => [...new Set(state.shared.map((p) => p.cat))]; // in the order phrases.json lists them
const inTopics = (p) => !state.topics.length || state.topics.includes(p.cat);
// what a saved quiz round was built from: "all", "food" or "food+numbers" (the first two as before several could be chosen)
const topicsKey = () => state.topics.join("+") || "all";
function topicLabel() {
  const names = state.topics.map((c) => t(topicName(c)));
  return !names.length ? t("All Topics") : names.length <= 2 ? names.join(" + ") : t("{first} + {n} more", { first: names[0], n: names.length - 1 });
}
// the topics chosen, kept in phrases.json's order; choosing every one is the same as All Topics
function tidyTopics(picked) {
  const cats = topicList();
  const kept = cats.filter((c) => picked.includes(c)); // a topic no longer offered drops out
  return kept.length === cats.length ? [] : kept;
}
function rebuildTopicOptions() {
  state.topics = tidyTopics(state.topics);
  $("#cat").textContent = topicLabel();
}
// The Topics button opens a checklist. The choice applies when it closes (Done, or a tap outside the list),
// so ticking three topics doesn't restart the quiz round three times.
function openTopics() {
  const menu = $("#topicmenu");
  const cats = topicList();
  let picked = [...state.topics];
  const count = (c) => state.phrases.filter((p) => p.cat === c).length;
  menu.innerHTML = `<form method="dialog">
    <label class="topic"><input type="checkbox" value="all"> ${t("All Topics")}</label>
    ${cats.map((c) => `<label class="topic"><input type="checkbox" value="${c}"> ${esc(t(topicName(c)))}<span class="note">${count(c)}</span></label>`).join("")}
    <button class="act good">${t("Done")}</button>
  </form>`;
  const tick = () => menu.querySelectorAll("input").forEach((i) => { i.checked = i.value === "all" ? !picked.length : picked.includes(i.value); });
  tick();
  menu.onchange = (e) => {
    const v = e.target.value;
    picked = v === "all" ? [] : tidyTopics(e.target.checked ? [...picked, v] : picked.filter((c) => c !== v));
    tick();
  };
  menu.onclick = (e) => { if (e.target === menu) menu.close(); }; // the shaded area around the list
  menu.onclose = () => setTopics(picked);
  menu.showModal();
}
function setTopics(picked) {
  if (picked.join("+") === state.topics.join("+")) return;
  state.topics = picked;
  store.set("phrasebook-topics", picked);
  $("#cat").textContent = topicLabel();
  state.last = null;
  resetRound();
  stopPlayAll();
  render();
}
// A newer app version is reloaded at once unless a quiz round is under way, in which case the footer offers it.
// It reloads by itself only once for any one version: if the server is still part-way through a release and
// hands back the old files, reloading again would go round in circles, so after that the footer offers it.
function installUpdate(version) {
  navigator.serviceWorker?.getRegistration().then((reg) => reg && reg.update()).catch(() => {});
  const r = state.round;
  const midRound = state.mode === "quiz" && r && r.index > 0 && r.index < r.items.length;
  if (!midRound && store.get("phrasebook-reloaded-for", null) !== version) {
    store.set("phrasebook-reloaded-for", version);
    location.reload();
    return;
  }
  state.updateReady = true;
  state.note = t("A new version is ready. Tap here to reload.");
  updateStatus();
}
let lastCheck = 0;
let checking = null; // the check under way, so a second one waits for it instead of downloading the same files again
function checkForUpdates(force = false) {
  if (checking) return checking;
  if (!navigator.onLine || (!force && Date.now() - lastCheck < 30000)) return Promise.resolve();
  lastCheck = Date.now();
  checking = runUpdateCheck().finally(() => { checking = null; });
  return checking;
}
async function runUpdateCheck() {
  const version = await swVersion();
  // only a newer number counts: a server part-way through a release can briefly answer with the old one
  const num = (v) => Number(/(\d+)$/.exec(v || "")?.[1] || 0);
  if (num(version) > num(VERSION)) { installUpdate(version); return; }
  try {
    const [languages, shared] = await Promise.all([getJson("languages.json"), getJson("phrases.json")]);
    const listChanged = JSON.stringify(shared) !== JSON.stringify(state.shared);
    state.languages = languages;
    state.shared = shared;
    state.lang = languages.find((l) => l.code === state.lang.code) || state.lang;
    if (listChanged) rebuildTopicOptions();
    if (state.firstRun) { if (!state.choosing) renderWelcome(); return; } // keep the picker's language list current
    const filesChanged = await syncInstalled();
    if (listChanged || filesChanged) {
      await loadLanguageData();
      if (state.mode === "list" || state.mode === "guide" || state.mode === "settings") render();
    }
  } catch { /* offline or a hiccup: keep showing what is stored */ }
}

// ---------- settings ----------
// The language list is split into the languages on this device (in an order you set with the arrows)
// and the ones still available to download, so the ones you use are always at the top.
const langOrderKey = "phrasebook-lang-order";
function languageGroups() {
  const onDevice = (l) => l.code === state.lang.code || packState(l.code) !== "none";
  const order = store.get(langOrderKey, []);
  const rank = (code) => (order.includes(code) ? order.indexOf(code) : order.length); // new ones go to the end
  const mine = state.languages.filter(onDevice).sort((a, b) => rank(a.code) - rank(b.code));
  const available = state.languages.filter((l) => !onDevice(l)).sort((a, b) => langName(a).localeCompare(langName(b))); // alphabetical
  return { mine, available };
}
function moveLanguage(code, delta) {
  const codes = languageGroups().mine.map((l) => l.code);
  const i = codes.indexOf(code), j = i + delta;
  if (i < 0 || j < 0 || j >= codes.length) return;
  [codes[i], codes[j]] = [codes[j], codes[i]];
  store.set(langOrderKey, codes);
}
function languageRow(l, position, count) {
  const ps = packState(l.code);
  const active = l.code === state.lang.code;
  const mb = `${(l.bytes / 1e6).toFixed(1)} MB`;
  const yours = l.code === state.known.code ? " · " + t("Your language") : ""; // downloaded for prompts and Play all
  const status = state.busy[l.code] || (active ? t("In use") : ps === "installed" ? t("Downloaded") + yours : ps === "partial" ? t("Partly downloaded") + yours : t("Not downloaded"));
  const name = esc(langName(l));
  const buttons = state.busy[l.code] || active ? ""
    : ps === "installed" ? `<button class="mini" data-act="use">${t("Use")}</button><button class="mini ghost" data-act="remove" aria-label="${t("Remove {name} from this device", { name })}" title="${t("Remove from this device")}">✕</button>`
    : `<button class="mini" data-act="download">${canCache ? t("Download &amp; use") : t("Use")}</button>`;
  // arrows only for languages on the device, where the order matters
  const arrows = position < 0 ? "" : `
        <div class="mv">
          <button class="mvb" data-act="up" aria-label="${t("Move {name} up", { name })}"${position === 0 ? " disabled" : ""}>▲</button>
          <button class="mvb" data-act="down" aria-label="${t("Move {name} down", { name })}"${position === count - 1 ? " disabled" : ""}>▼</button>
        </div>`;
  return `
      <div class="lang${active ? " current" : ""}" data-lang="${l.code}">${arrows}
        <div class="linfo"><div class="lname">${name} <span class="note" lang="${l.code}">${esc(l.native)}</span></div>
          <div class="note"><span class="lstate">${esc(status)}</span> · ${mb}${l.draft ? " · " + t("Draft translations") : ""}</div></div>
        <div class="lbtn">${buttons}</div>
      </div>`;
}
// The whole Language section folds away, leaving one line that names the language in use.
// Whether it (and the Available list) is open is remembered.
function languagePanel() {
  const { mine, available } = languageGroups();
  const open = store.get("phrasebook-lang-open", false);
  const availOpen = store.get("phrasebook-avail-open", available.length <= 5); // a long list starts folded
  return `
    <details class="panel" id="langpanel"${open ? " open" : ""}>
      <summary><span class="ptitle">${t("Learning")}</span><span class="pval">${esc(langName(state.lang))}</span><span class="chev" aria-hidden="true"></span></summary>
      <div class="pbody" id="langs">
        <h3 class="sub">${t("On this device ({n})", { n: mine.length })}</h3>
        ${mine.map((l, i) => languageRow(l, i, mine.length)).join("")}
        ${available.length ? `
        <details class="avail" id="availpanel"${availOpen ? " open" : ""}>
          <summary><span>${t("Available to download ({n})", { n: available.length })}</span><span class="chev" aria-hidden="true"></span></summary>
          ${available.map((l) => languageRow(l, -1, 0)).join("")}
        </details>` : ""}
        <p class="note">${t("A language is stored on this device only once you download it. Removing one frees its space and keeps your progress. Use the arrows to put your languages in the order you want.")}</p>
      </div>
    </details>`;
}
// ---------- about: install steps, sharing and feedback ----------
function installInfo() {
  const ua = navigator.userAgent;
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const safari = ios && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  // browsers other than Safari can add an app to the Home Screen from iOS 16.4 on (a UA with no version is treated as new enough)
  const v = /OS (\d+)_(\d+)/.exec(ua);
  const iosAllowsOtherBrowsers = !v || +v[1] > 16 || (+v[1] === 16 && +v[2] >= 4);
  let steps;
  if (installed) steps = [];
  else if (ios && safari) steps = ["Tap the Share button, the square with an arrow, at the bottom of Safari.", "Scroll down and tap <b>Add to Home Screen</b>.", "Tap <b>Add</b>. PhraseBook now opens from your Home Screen and works without a connection."];
  else if (ios && iosAllowsOtherBrowsers) steps = ["Tap your browser's Share button, the square with an arrow, in the address bar or the ••• menu.", "Tap <b>Add to Home Screen</b>, then <b>Add</b>.", "PhraseBook now opens from your Home Screen and works without a connection."];
  else if (ios) steps = ["This version of iOS only lets Safari add apps to the Home Screen. Open this page in <b>Safari</b>; <b>Share this app</b> below can send you the link.", "In Safari, tap the Share button, then <b>Add to Home Screen</b>."];
  else if (android) steps = ["Open this page in <b>Chrome</b> and tap the menu (⋮).", "Tap <b>Install app</b> or <b>Add to Home screen</b>.", "Tap <b>Install</b>. PhraseBook now opens from your Home screen and works without a connection."];
  else steps = ["In Chrome or Edge, click the install icon at the right end of the address bar, or open the menu and choose <b>Install PhraseBook</b>.", "In Safari on a Mac, choose <b>File → Add to Dock</b>.", "It then opens in its own window and works without a connection."];
  return { installed, steps: steps.map((s) => t(s)) };
}
function installPanel() {
  const { installed, steps } = installInfo();
  const open = store.get("phrasebook-install-open", !installed);
  return `
    <details class="panel" id="installpanel"${open ? " open" : ""}>
      <summary><span class="ptitle">${t("Install on this device")}</span><span class="pval">${installed ? t("Installed ✓") : ""}</span><span class="chev" aria-hidden="true"></span></summary>
      <div class="pbody">
        ${installed
          ? `<p class="note">${t("PhraseBook is installed on this device, and keeps itself up to date.")}</p>`
          : `<ol class="steps">${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
        <p class="note">${t("Once installed it updates itself, so there is no need to remove it and add it again.")}</p>`}
      </div>
    </details>`;
}
async function shareApp() {
  track("share/click");
  const url = new URL("./", location.href).href;
  const data = { title: "PhraseBook", text: t("A free phrase book for travel: flashcards, quizzes and audio, and it works offline."), url };
  const btn = $("#share");
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(url);
    btn.textContent = t("Link copied ✓");
    setTimeout(() => { if (btn.isConnected) btn.textContent = t("Share this app"); }, 2500);
  } catch (err) {
    if (err && err.name === "AbortError") return; // the person closed the share sheet
    prompt(t("Copy this link to share PhraseBook:"), url);
  }
}
// Feedback goes by email. The address is assembled here so it is not a plain mailto link sitting in the page
// for scrapers. A mailto: link does nothing on a laptop with no email app set up, and an iPhone lists only the
// mail apps it knows (not Yahoo Mail), so every device is offered the same choices: Gmail, Yahoo Mail, its own
// email app and a Copy button.
function feedbackParts() {
  const to = ["pcob47-pb", "yahoo.com"].join("@");
  const subject = "PhraseBook feedback";
  const body = `Hi! My feedback about PhraseBook:\n\n\n\n(To report a wrong or missing phrase, tell me the language and the phrase.)\n---\nLanguage: ${state.lang.name}\nVersion: ${state.version || "unknown"}`;
  const q = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return {
    to,
    mailto: `mailto:${to}?${q({ subject, body })}`,
    gmail: `https://mail.google.com/mail/?${q({ view: "cm", fs: "1", to, su: subject, body })}`,
    yahoo: `https://compose.mail.yahoo.com/?${q({ to, subject, body })}`,
  };
}
function openMailApp(url) { location.href = url; }
function showFeedbackOptions() {
  const box = $("#feedbackbox");
  if (!box) return;
  const f = feedbackParts();
  box.innerHTML = `
    <div>${t("Send your feedback to")} <b>${esc(f.to)}</b></div>
    <div class="row fbrow">
      <button class="mini" data-fb="gmail">Gmail</button>
      <button class="mini" data-fb="yahoo">Yahoo Mail</button>
      <button class="mini" data-fb="mail">${t("Email app")}</button>
      <button class="mini ghost wide" data-fb="copy">${t("Copy address")}</button>
    </div>`;
  box.hidden = false;
  box.onclick = async (e) => {
    const btn = e.target.closest("button[data-fb]");
    if (!btn) return;
    const parts = feedbackParts();
    if (btn.dataset.fb === "mail") openMailApp(parts.mailto);
    else if (btn.dataset.fb === "copy") {
      try { await navigator.clipboard.writeText(parts.to); btn.textContent = t("Copied ✓"); }
      catch { prompt(t("Copy this address:"), parts.to); }
    } else window.open(parts[btn.dataset.fb], "_blank", "noopener");
  };
}
function sendFeedback() {
  track("feedback/click");
  showFeedbackOptions();
}

function renderSettings() {
  const skippedCount = state.phrases.filter(isSkipped).length;
  const opt = (v, label, cur) => `<option value="${v}"${v === cur ? " selected" : ""}>${label}</option>`;
  main.innerHTML = `
    <h2 class="group">${t("Your language")}</h2>
    <div class="setting">
      <label for="known">${t("I speak")}</label>
      <select id="known">${knownSelect()}</select>
    </div>
    <p class="note">${t("Prompts, answers, notes, the guide and Play all use the language you speak. Anything not yet written for it shows in English.")}${state.base === state.lang.code ? " " + t("While you learn {name}, English is used.", { name: esc(langName(state.lang)) }) : ""}</p>
    ${languagePanel()}
    <h2 class="group">${t("Audio")}</h2>
    <div class="setting">
      <label for="voice">${t("Voice")}</label>
      <select id="voice">
        ${opt("f", t("Female"), state.settings.voice)}
        ${opt("m", t("Male"), state.settings.voice)}
        ${opt("mixed", t("Mixed (random each time)"), state.settings.voice)}
      </select>
    </div>
    <div class="setting">
      <label for="speed">${t("Speed")}</label>
      <select id="speed">
        ${opt("1", t("Normal"), state.settings.speed)}
        ${opt("0.85", t("Slower"), state.settings.speed)}
        ${opt("0.7", t("Slowest"), state.settings.speed)}
      </select>
    </div>
    <div class="row"><button class="act" id="sample">${t("🔊 Hear a sample")}</button></div>
    <h2 class="group">${t("Quiz")}</h2>
    <div class="setting">
      <label for="round">${t("Questions per round")}</label>
      <select id="round">
        ${ROUND_CHOICES.map((n) => opt(n, n, state.settings.round)).join("")}
      </select>
    </div>
    <h2 class="group">${t("Left out of practice")}</h2>
    <div class="setting">
      <span>${skippedCount ? t(skippedCount === 1 ? "{n} phrase left out in {name}" : "{n} phrases left out in {name}", { n: skippedCount, name: esc(langName(state.lang)) }) : t("None. Tap a phrase's ✓ circle (in the List, on a card or in the quiz) to leave it out.")}</span>
      ${skippedCount ? `<button class="act" id="unskip" style="flex:none">${t("Practise all")}</button>` : ""}
    </div>
    <h2 class="group">${t("Play all")}</h2>
    <div class="setting">
      <label for="gap">${t("Pause between")}</label>
      <select id="gap">
        ${GAP_CHOICES.map((n) => opt(n, n === "1" ? t("1 second") : t("{n} seconds", { n }), state.settings.gap)).join("")}
      </select>
    </div>
    <div class="setting">
      <label for="twice">${t("Say each phrase twice")}</label>
      <select id="twice">
        ${opt("no", t("No"), state.settings.twice)}
        ${opt("yes", t("Yes"), state.settings.twice)}
      </select>
    </div>
    <h2 class="group">${t("About")}</h2>
    ${installPanel()}
    <div class="row">
      <button class="act" id="share">${t("Share this app")}</button>
      <button class="act" id="feedback">${t("Send feedback")}</button>
    </div>
    <div class="draft" id="feedbackbox" hidden></div>
    <p class="note about">PhraseBook${state.version ? " · " + t("version {v}", { v: esc(state.version.replace("phrasebook-", "")) }) : ""}. ${t("Your progress and settings stay on this device.")}${analyticsOn ? " " + t("The app counts anonymous visits and which features are used, with no cookies and no personal data.") : ""}</p>`;
  if ($("#unskip")) $("#unskip").onclick = () => { state.skipped.clear(); store.set(skipKey(state.lang.code), []); state.last = null; renderSettings(); };
  $("#known").onchange = async () => { await setKnown($("#known").value); if (state.mode === "settings") renderSettings(); };
  $("#share").onclick = shareApp;
  $("#feedback").onclick = sendFeedback;
  $("#round").onchange = () => {
    state.settings.round = $("#round").value;
    store.set("phrasebook-round", state.settings.round);
    resetRound(); // the next quiz starts a fresh round of the new length
  };
  const sample = () => speak(state.phrases.find((p) => p.id === "hello") || state.phrases[0]);
  for (const id of ["voice", "speed"]) {
    $("#" + id).onchange = () => {
      state.settings[id] = $("#" + id).value;
      store.set("phrasebook-" + id, state.settings[id]);
      sample();
    };
  }
  for (const id of ["gap", "twice"]) {
    $("#" + id).onchange = () => { state.settings[id] = $("#" + id).value; store.set("phrasebook-" + id, state.settings[id]); };
  }
  $("#sample").onclick = sample;
  // remember whether the panels are open, but only when the person opens or closes one
  // (browsers also fire "toggle" when a panel that starts open is drawn)
  for (const [id, key] of [["langpanel", "phrasebook-lang-open"], ["availpanel", "phrasebook-avail-open"], ["installpanel", "phrasebook-install-open"]]) {
    const el = document.getElementById(id);
    if (!el) continue;
    let last = el.open;
    el.addEventListener("toggle", () => { if (el.open !== last) { last = el.open; store.set(key, last); } });
  }
  $("#langs").onclick = async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const code = btn.closest("[data-lang]").dataset.lang;
    const lang = state.languages.find((l) => l.code === code);
    if (btn.dataset.act === "up" || btn.dataset.act === "down") {
      moveLanguage(code, btn.dataset.act === "up" ? -1 : 1);
      renderSettings();
      return;
    }
    if (btn.dataset.act === "remove") {
      if (confirm(t("Remove {name} from this device? Your progress is kept.", { name: langName(lang) }))) { await removePack(code); renderSettings(); }
      return;
    }
    try {
      if (btn.dataset.act === "download" && canCache) {
        state.busy[code] = t("Starting…");
        renderSettings();
        await syncPack(code, (done, total) => {
          state.busy[code] = t("Downloading {done} of {total}", { done, total });
          const el = document.querySelector(`[data-lang="${code}"] .lstate`);
          if (el) el.textContent = state.busy[code];
        });
        track("download/" + code);
      }
      await useLanguage(code);
      if (canCache) syncKnownPack().catch(() => {});
      delete state.busy[code];
      track("language/" + code);
    } catch {
      state.busy[code] = t("Couldn't download. Check you're online and try again.");
      setTimeout(() => { delete state.busy[code]; if (state.mode === "settings") renderSettings(); }, 5000);
    }
    if (state.mode === "settings") renderSettings();
  };
  hint(t("Settings are saved on this device"));
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
    const valid = (c) => state.languages.some((l) => l.code === c);
    // A shared link such as ?lang=ja opens that language (and is then tidied out of the address bar)
    const linked = new URLSearchParams(location.search).get("lang");
    if (linked !== null) {
      const u = new URL(location.href);
      u.searchParams.delete("lang");
      history.replaceState(null, "", u);
      if (valid(linked)) store.set("phrasebook-lang", linked);
    }
    // ...and &speak=de sets the language you know (one marked "base", or English)
    const speak = new URLSearchParams(location.search).get("speak");
    if (speak !== null) {
      const u = new URL(location.href);
      u.searchParams.delete("speak");
      history.replaceState(null, "", u);
      if (knownLanguages().some((l) => l.code === speak)) store.set("phrasebook-base", (state.base = speak));
    }
    const saved = store.get("phrasebook-lang", "");
    // someone who used the app before the picker existed has a language downloaded but never "chose" one
    const usedBefore = state.languages.find((l) => packState(l.code) === "installed");
    const code = valid(saved) ? saved : usedBefore ? usedBefore.code : null;
    state.firstRun = !code; // brand new: ask which language, and download nothing until they say
    // brand new, the language you know starts as the browser's own, when it is one the app is written in
    if (state.firstRun && store.get("phrasebook-base", null) === null) {
      const own = (navigator.languages || [navigator.language]).map((l) => String(l).slice(0, 2).toLowerCase())
        .find((c) => knownLanguages().some((l) => l.code === c));
      if (own) store.set("phrasebook-base", (state.base = own));
    }
    state.lang = state.languages.find((l) => l.code === (code || state.languages[0].code)); // a placeholder until they choose
    if (!state.firstRun) { await loadLanguageData(); keepStorage(); }
    else { await loadUi(state.base); state.known = knownLanguages().find((l) => l.code === state.base) || ENGLISH; translatePage(); }
  } catch {
    main.innerHTML = `<p class="note">Couldn't load the phrases. Open the app once while online.</p>`;
    return;
  }
  state.progress = store.get(progressKey(state.lang.code), {});
  loadSkipped();
  pickVoice();
  // the chosen topics; before several could be chosen, one topic (or "all") was kept as "phrasebook-cat"
  const oldTopic = store.get("phrasebook-cat", "all");
  const saved = store.get("phrasebook-topics", oldTopic === "all" ? [] : [oldTopic]);
  state.topics = Array.isArray(saved) ? saved : [];
  rebuildTopicOptions();
  $("#cat").onclick = openTopics;
  rebuildDirOptions();
  $("#dir").onchange = () => { store.set("phrasebook-dir", $("#dir").value); state.last = null; resetRound(); render(); };
  if (!["f", "m", "mixed"].includes(state.settings.voice)) state.settings.voice = "f";
  if (!["1", "0.85", "0.7"].includes(state.settings.speed)) state.settings.speed = "1";
  if (!ROUND_CHOICES.includes(state.settings.round)) state.settings.round = "20";
  if (!GAP_CHOICES.includes(state.settings.gap)) state.settings.gap = "2";
  if (!["no", "yes"].includes(state.settings.twice)) state.settings.twice = "no";
  $("#listen").checked = store.get("phrasebook-listen", false);
  $("#listen").onchange = () => { store.set("phrasebook-listen", $("#listen").checked); render(); };
  setMuted(muted);
  $("#mute").onclick = () => setMuted(!muted);
  document.querySelectorAll(".tab").forEach((b) => b.onclick = () => {
    state.mode = b.dataset.mode;
    if (state.mode !== "list") pausePlayAll(); // Play all belongs to the List; it keeps its place for when you return
    track("tab/" + state.mode);
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === b));
    // topic/direction/listening-only mean nothing on the guide and settings pages
    $(".opts").hidden = state.mode === "guide" || state.mode === "settings";
    render();
  });
  render();
  // how the app was opened: in its language, and from the Home Screen or from a browser tab
  track(state.firstRun ? "welcome/shown" : "open/" + state.lang.code);
  track(matchMedia("(display-mode: standalone)").matches || navigator.standalone === true ? "mode/installed" : "mode/browser");
  $("#status").onclick = () => { if (state.updateReady) location.reload(); };
  checkForUpdates(true);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkForUpdates(); });
  window.addEventListener("online", () => checkForUpdates(true));
}
boot();

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
