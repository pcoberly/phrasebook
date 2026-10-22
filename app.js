"use strict";

// This copy of the app's version. It must match CACHE in sw.js; a newer CACHE on the server means an update.
const VERSION = "phrasebook-v30";
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
const state = {
  languages: [],  // languages.json: every language the app offers
  shared: [],     // phrases.json: the phrases every language shares (id, English, topic)
  lang: null,     // the language being studied
  phrases: [],    // shared phrases merged with the active language's text, say, tones, note
  mode: "list",
  progress: {},
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
  if (!items.length) return null; // a topic this language has no phrases for yet
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
  return `<div class="woman">A woman says: ${f.text ? `<b>${nat(f.text)}</b> ` : ""}${f.say ? `<i>${esc(f.say)}</i>` : ""}</div>`;
}
const noteOf = (p) => (p.note ? `<div class="note">${noteText(p.note)}</div>` : "");
// languages marked "draft" in languages.json have not been checked by a native speaker
function draftBanner() {
  return state.lang.draft
    ? `<p class="draft">Draft ${esc(state.lang.name)}: not yet checked by a native speaker. Trust the audio over the spelling, and check anything important with a local.</p>`
    : "";
}
function updateStatus() {
  $("#status").classList.toggle("ready", !!state.updateReady); // a pending app update turns the footer into a reload button
  if (state.note) { $("#status").textContent = state.note; return; }
  const all = state.phrases.length * 2;
  const known = Object.values(state.progress).filter((v) => v.box >= 3).length;
  $("#status").textContent = `${known} of ${all} cards learned`;
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
const emptyTopic = () => `<div class="card">${esc(state.lang.name)} has no phrases in this topic yet. Choose another topic.</div>`;
function renderCard() {
  const item = next();
  if (!item) { main.innerHTML = emptyTopic(); updateStatus(); return; }
  const { p, dir, key } = item;
  const name = state.lang.name;
  const listenOnly = $("#listen").checked;
  const fromLang = dir === "from";
  const showFront = !(fromLang && listenOnly);
  const front = fromLang ? nat(p.text) : esc(p.en);
  // Two faces share one spot, so the card keeps one height and turns over like a real flashcard.
  main.innerHTML = `
    <div class="flip" id="flip" role="button" tabindex="0" aria-label="Flip the card">
      <div class="flip-inner">
        <div class="card face front">
          <div class="label">${fromLang ? name : "English"}</div>
          <div class="big">${showFront ? front : "🎧"}</div>
          ${fromLang ? `<button class="speak" id="say" aria-label="Play">🔊</button>` : ""}
          <div class="hint">Tap the card to flip it</div>
        </div>
        <div class="card face back">
          <div class="label">${fromLang ? "English" : name}</div>
          <div class="big">${fromLang ? esc(p.en) : nat(p.text)}</div>
          <button class="speak" id="say2" aria-label="Play">🔊</button>
          <div class="orig">${fromLang ? name : "English"}: <b>${front}</b></div>
          ${pron(p)}
        </div>
      </div>
    </div>
    <div class="detail" id="detail"></div>
    <div class="row sticky hidden" id="grades">
      <button class="act bad" id="again">✗ Didn't know it</button>
      <button class="act good" id="got">✓ Knew it</button>
    </div>`;
  const flip = $("#flip");
  let seenAnswer = false;
  if (fromLang) { $("#say").onclick = (e) => { e.stopPropagation(); speak(p); }; speak(p); }
  $("#say2").onclick = (e) => { e.stopPropagation(); speak(p); };
  const toggle = () => {
    const flipped = flip.classList.toggle("flipped");
    flip.setAttribute("aria-pressed", flipped);
    speak(p); // every flip plays the phrase, so you can hear it from either side
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
  // never offer a wrong option that is really a right answer: no same English, and no same text in the language
  // (French says Bonjour for both hello and good morning)
  const others = state.phrases.filter((o) => o.id !== p.id && o.text !== p.text && o.en !== p.en);
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
  return { items: shuffle(picked), index: 0, correct: 0, missed: [], cat: $("#cat").value, dir: $("#dir").value, size: state.settings.round };
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
  if (!s || s.cat !== $("#cat").value || s.dir !== $("#dir").value || s.size !== state.settings.round) return null;
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
  if (state.phrases.length < 4) { main.innerHTML = `<div class="card">Need at least 4 phrases.</div>`; return; }
  if (!state.round) { state.round = loadRound() || buildRound(); saveRound(); }
  const round = state.round;
  if (!round.items.length) { resetRound(); main.innerHTML = emptyTopic(); updateStatus(); return; }
  if (round.index >= round.items.length) { renderSummary(); return; }
  const { p, dir, key } = round.items[round.index];
  const total = round.items.length;
  const number = round.index + 1;
  const name = state.lang.name;
  const listenOnly = $("#listen").checked;
  const toLang = dir === "to";
  const opts = shuffle([p, ...distractors(p)]);
  main.innerHTML = `
    <div class="roundbar"><span>Question ${number} of ${total}</span><span id="score">${round.correct} correct</span></div>
    <div class="bar"><i style="width:${Math.round(100 * round.index / total)}%"></i></div>
    <div class="card q">
      <div class="label">${toLang ? `Pick the ${name}` : "Pick the English"}</div>
      <div class="big">${toLang ? esc(p.en) : (listenOnly ? "🎧" : nat(p.text))}</div>
      ${toLang ? "" : `<button class="speak" id="say" aria-label="Play">🔊</button>`}
    </div>
    <div id="choices"></div>
    <div class="reveal" id="reveal"></div>
    <div class="row sticky hidden" id="nextrow"><button class="act" id="next">${number === total ? "See score" : "Next"}</button></div>`;
  if (!toLang) { $("#say").onclick = () => speak(p); speak(p); }
  const box = $("#choices");
  let answered = false;
  opts.forEach((o, i) => {
    const div = document.createElement("div");
    div.className = "choice";
    const label = toLang ? (listenOnly ? `Option ${i + 1}` : nat(o.text)) : esc(o.en);
    div.innerHTML = `<button class="pick"${toLang ? rtlAttr() : ""}>${label}</button>${toLang ? `<button class="speak" aria-label="Play">🔊</button>` : ""}`;
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
      $("#score").textContent = `${round.correct} correct`;
      pick.classList.add(ok ? "right" : "wrong");
      [...box.children].forEach((c, j) => {
        if (opts[j].id === p.id) c.querySelector(".pick").classList.add("right");
        if (toLang) c.querySelector(".pick").innerHTML = nat(opts[j].text);
      });
      speak(p);
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
  const message = r.correct === total ? "A perfect round!" : pct >= 80 ? "Great work." : pct >= 50 ? "Good effort." : "Keep going. These will stick.";
  main.innerHTML = `
    <div class="card q summary">
      <div class="label">Round complete</div>
      <div class="big">${r.correct} of ${total}</div>
      <div class="hint">${message}</div>
    </div>
    ${r.missed.length
      ? `<h2 class="group">To review (${r.missed.length})</h2>${r.missed.map((i) => entryHtml(i.p, i.dir === "from", false)).join("")}`
      : `<p class="note" style="text-align:center">No mistakes this round.</p>`}
    <div class="row sticky"><button class="act good" id="newround">New round</button></div>`;
  wireSpeakButtons();
  $("#newround").onclick = () => { resetRound(); render(); };
  window.scrollTo(0, 0);
  updateStatus();
}

// ---------- study list ----------
// one phrase as a row: the language text with how to say it, and the English, in the order you are studying
function entryHtml(p, fromFirst, withNote = true) {
  return `
      <div class="entry" data-entry="${p.id}">
        <div>
          ${fromFirst ? "" : `<div class="en">${esc(p.en)}</div>`}
          <div class="vi"${rtlAttr()}>${nat(p.text)}</div>
          ${p.say ? `<div class="say">${esc(p.say)}</div>` : ""}
          ${womanForm(p)}
          ${fromFirst ? `<div class="en">${esc(p.en)}</div>` : ""}
          ${p.tones ? `<div class="tones">${esc(p.tones)}</div>` : ""}
          ${withNote && p.note ? `<div class="note">${noteText(p.note)}</div>` : ""}
        </div>
        <button class="speak" data-id="${p.id}" aria-label="Play">🔊</button>
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
  const cat = $("#cat").value;
  const groups = {};
  for (const p of state.phrases) if (cat === "all" || p.cat === cat) (groups[p.cat] ||= []).push(p);
  return groups;
}
function renderList() {
  const fromFirst = $("#dir").value === "from"; // English first unless studying the language → English
  const groups = listGroups();
  const playing = playAll && playAll.playing;
  main.innerHTML = draftBanner() + Object.entries(groups).map(([c, ps]) => `
    <h2 class="group">${esc(topicName(c))}</h2>
    ${ps.map((p) => entryHtml(p, fromFirst)).join("")}`).join("") + `
    <div class="row sticky"><button class="act${playing ? "" : " good"}" id="playall">${playing ? "⏸ Pause" : "▶ Play all"}</button></div>`;
  wireSpeakButtons();
  $("#playall").onclick = () => (playAll && playAll.playing ? pausePlayAll() : startPlayAll());
  if (playAll) markPlaying();
  else hint("Tap 🔊 to hear a phrase, or ▶ to hear them all");
}

// ---------- play all: the List read aloud, for listening on the move ----------
// Each phrase in the List plays in the direction you study: English, a pause, then the language (or the other way
// round), then a pause before the next. It goes round the list until you pause it. The pause length and
// "say each phrase twice" are in Settings. English comes from its own small pack ("en"), shared by every language.
const EN = "en";
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
  const rate = code === EN ? 1 : parseFloat(state.settings.speed) || 1; // you already know the English
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
    const english = code === EN;
    const u = new SpeechSynthesisUtterance((english ? p.en : p.spoken || p.text).replace(/\.\.\.|…/g, ""));
    u.lang = english ? "en-US" : state.lang.ttsLang;
    if (!english && browserVoice) u.voice = browserVoice;
    u.rate = english ? 1 : 0.85;
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
    const p = pa.items[pa.index];
    markPlaying();
    const lang = state.lang.code;
    const twice = state.settings.twice === "yes";
    const order = $("#dir").value === "from" ? [lang, ...(twice ? [lang] : []), EN] : [EN, lang, ...(twice ? [lang] : [])];
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
  if (state.mode === "list") hint(`${pa.playing ? "Playing" : "Paused at"} ${pa.index + 1} of ${pa.items.length}`);
  if ("mediaSession" in navigator && "MediaMetadata" in window) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: p.en, artist: `${p.text} · ${state.lang.name}`, album: "PhraseBook",
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
async function renderGuide() {
  const code = state.lang.code;
  main.innerHTML = `<p class="note">Loading…</p>`;
  hint(`${state.lang.name} pronunciation guide`);
  try {
    const res = await fetch(`lang/${code}/guide.html`);
    if (!res.ok) throw new Error(res.status);
    const html = await res.text();
    if (state.mode === "guide" && state.lang.code === code) main.innerHTML = html;
  } catch {
    if (state.mode === "guide") main.innerHTML = `<p class="note">The guide isn't available offline until ${esc(state.lang.name)} has finished downloading.</p>`;
  }
}

// ---------- first run: choose a language ----------
function pickerRow(l) {
  const note = state.busy[l.code] || `${(l.bytes / 1e6).toFixed(1)} MB${l.draft ? " · Draft translations" : ""}`;
  return `
    <div class="lang" data-lang="${l.code}">
      <div class="linfo"><div class="lname">${esc(l.name)} <span class="note" lang="${l.code}">${esc(l.native)}</span></div>
        <div class="note"><span class="lstate">${esc(note)}</span></div></div>
      <div class="lbtn">${state.choosing ? "" : `<button class="mini" data-pick="${l.code}">Start</button>`}</div>
    </div>`;
}
function renderWelcome() {
  document.body.classList.add("firstrun");
  const choices = [...state.languages].sort((a, b) => a.name.localeCompare(b.name));
  main.innerHTML = `
    <div class="welcome">
      <h1>Welcome to PhraseBook</h1>
      <p class="lead">Which language would you like to learn?</p>
      <p class="note">Tap one to download it. That needs a connection once, and afterwards the app works without one. You can add more languages later in Settings.</p>
      <div id="welcomelangs">${choices.map(pickerRow).join("")}</div>
    </div>`;
  $("#welcomelangs").onclick = (e) => {
    const b = e.target.closest("button[data-pick]");
    if (b) chooseFirstLanguage(b.dataset.pick);
  };
}
async function chooseFirstLanguage(code) {
  if (state.choosing) return;
  state.choosing = code;
  state.busy[code] = "Starting…";
  renderWelcome();
  try {
    if (canCache) {
      await syncPack(code, (done, total) => {
        state.busy[code] = `Downloading ${done} of ${total}`;
        const el = document.querySelector(`[data-lang="${code}"] .lstate`);
        if (el) el.textContent = state.busy[code];
      });
      track("download/" + code);
      syncPack(EN).catch(() => {}); // English for Play all follows in the background (and is retried later)
    }
    await useLanguage(code);
    track("language/" + code);
    delete state.busy[code];
    state.choosing = null;
    state.firstRun = false;
    document.body.classList.remove("firstrun");
    render();
  } catch {
    state.choosing = null;
    state.busy[code] = "Couldn't download. Check you're online and try again.";
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
  state.phrases = state.shared.filter((p) => texts[p.id]).map((p) => ({ ...p, ...texts[p.id] }));
}
function rebuildDirOptions() {
  const n = esc(state.lang.name);
  const sel = $("#dir");
  const saved = store.get("phrasebook-dir", "mixed");
  sel.innerHTML = `<option value="mixed">Both Directions</option><option value="to">English → ${n}</option><option value="from">${n} → English</option>`;
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
  state.round = null;
  stopPlayAll();
  rebuildDirOptions();
  pickVoice();
}
// Keep the language in use, and any other downloaded one, up to date. Runs quietly when online.
async function syncInstalled() {
  if (state.firstRun || !canCache || !navigator.onLine) return false; // nothing downloads before a language is chosen
  const codes = state.languages.map((l) => l.code).filter((c) => c === state.lang.code || packState(c) !== "none");
  let activeChanged = false;
  for (const code of codes) {
    const label = state.languages.find((l) => l.code === code).name;
    try {
      const changed = await syncPack(code, (done, total) => {
        if (code === state.lang.code) say(`Downloading ${label}: ${done} of ${total}`);
      });
      if (changed && code === state.lang.code) { activeChanged = true; say(`${label} is ready to use offline`, 4000); }
      else if (code === state.lang.code && state.note) say("");
    } catch {
      if (code === state.lang.code) say("");
    }
  }
  syncPack(EN).catch(() => {}); // English, for Play all: shared by every language, kept current quietly
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
function rebuildTopicOptions() {
  const current = $("#cat").value || store.get("phrasebook-cat", "all");
  const cats = [...new Set(state.shared.map((p) => p.cat))];
  $("#cat").innerHTML = `<option value="all">All Topics</option>` + cats.map((c) => `<option value="${c}">${esc(topicName(c))}</option>`).join("");
  $("#cat").value = [...$("#cat").options].some((o) => o.value === current) ? current : "all";
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
  state.note = "A new version is ready. Tap here to reload.";
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
  const available = state.languages.filter((l) => !onDevice(l)).sort((a, b) => a.name.localeCompare(b.name)); // alphabetical
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
  const status = state.busy[l.code] || (active ? "In use" : ps === "installed" ? "Downloaded" : ps === "partial" ? "Partly downloaded" : "Not downloaded");
  const buttons = state.busy[l.code] || active ? ""
    : ps === "installed" ? `<button class="mini" data-act="use">Use</button><button class="mini ghost" data-act="remove" aria-label="Remove ${esc(l.name)} from this device" title="Remove from this device">✕</button>`
    : `<button class="mini" data-act="download">${canCache ? "Download &amp; use" : "Use"}</button>`;
  // arrows only for languages on the device, where the order matters
  const arrows = position < 0 ? "" : `
        <div class="mv">
          <button class="mvb" data-act="up" aria-label="Move ${esc(l.name)} up"${position === 0 ? " disabled" : ""}>▲</button>
          <button class="mvb" data-act="down" aria-label="Move ${esc(l.name)} down"${position === count - 1 ? " disabled" : ""}>▼</button>
        </div>`;
  return `
      <div class="lang${active ? " current" : ""}" data-lang="${l.code}">${arrows}
        <div class="linfo"><div class="lname">${esc(l.name)} <span class="note" lang="${l.code}">${esc(l.native)}</span></div>
          <div class="note"><span class="lstate">${esc(status)}</span> · ${mb}${l.draft ? " · Draft translations" : ""}</div></div>
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
      <summary><span class="ptitle">Language</span><span class="pval">${esc(state.lang.name)}</span><span class="chev" aria-hidden="true"></span></summary>
      <div class="pbody" id="langs">
        <h3 class="sub">On this device (${mine.length})</h3>
        ${mine.map((l, i) => languageRow(l, i, mine.length)).join("")}
        ${available.length ? `
        <details class="avail" id="availpanel"${availOpen ? " open" : ""}>
          <summary><span>Available to download (${available.length})</span><span class="chev" aria-hidden="true"></span></summary>
          ${available.map((l) => languageRow(l, -1, 0)).join("")}
        </details>` : ""}
        <p class="note">A language is stored on this device only once you download it. Removing one frees its space and keeps your progress. Use the arrows to put your languages in the order you want.</p>
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
  return { installed, steps };
}
function installPanel() {
  const { installed, steps } = installInfo();
  const open = store.get("phrasebook-install-open", !installed);
  return `
    <details class="panel" id="installpanel"${open ? " open" : ""}>
      <summary><span class="ptitle">Install on this device</span><span class="pval">${installed ? "Installed ✓" : ""}</span><span class="chev" aria-hidden="true"></span></summary>
      <div class="pbody">
        ${installed
          ? `<p class="note">PhraseBook is installed on this device, and keeps itself up to date.</p>`
          : `<ol class="steps">${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
        <p class="note">Once installed it updates itself, so there is no need to remove it and add it again.</p>`}
      </div>
    </details>`;
}
async function shareApp() {
  track("share/click");
  const url = new URL("./", location.href).href;
  const data = { title: "PhraseBook", text: "A free phrase book for travel: flashcards, quizzes and audio, and it works offline.", url };
  const btn = $("#share");
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(url);
    btn.textContent = "Link copied ✓";
    setTimeout(() => { if (btn.isConnected) btn.textContent = "Share this app"; }, 2500);
  } catch (err) {
    if (err && err.name === "AbortError") return; // the person closed the share sheet
    prompt("Copy this link to share PhraseBook:", url);
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
    <div>Send your feedback to <b>${esc(f.to)}</b></div>
    <div class="row fbrow">
      <button class="mini" data-fb="gmail">Gmail</button>
      <button class="mini" data-fb="yahoo">Yahoo Mail</button>
      <button class="mini" data-fb="mail">Email app</button>
      <button class="mini ghost wide" data-fb="copy">Copy address</button>
    </div>`;
  box.hidden = false;
  box.onclick = async (e) => {
    const btn = e.target.closest("button[data-fb]");
    if (!btn) return;
    const parts = feedbackParts();
    if (btn.dataset.fb === "mail") openMailApp(parts.mailto);
    else if (btn.dataset.fb === "copy") {
      try { await navigator.clipboard.writeText(parts.to); btn.textContent = "Copied ✓"; }
      catch { prompt("Copy this address:", parts.to); }
    } else window.open(parts[btn.dataset.fb], "_blank", "noopener");
  };
}
function sendFeedback() {
  track("feedback/click");
  showFeedbackOptions();
}

function renderSettings() {
  const opt = (v, label, cur) => `<option value="${v}"${v === cur ? " selected" : ""}>${label}</option>`;
  main.innerHTML = `
    ${languagePanel()}
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
    <div class="row"><button class="act" id="sample">🔊 Hear a sample</button></div>
    <h2 class="group">Quiz</h2>
    <div class="setting">
      <label for="round">Questions per round</label>
      <select id="round">
        ${ROUND_CHOICES.map((n) => opt(n, n, state.settings.round)).join("")}
      </select>
    </div>
    <h2 class="group">Play all</h2>
    <div class="setting">
      <label for="gap">Pause between</label>
      <select id="gap">
        ${GAP_CHOICES.map((n) => opt(n, n === "1" ? "1 second" : `${n} seconds`, state.settings.gap)).join("")}
      </select>
    </div>
    <div class="setting">
      <label for="twice">Say each phrase twice</label>
      <select id="twice">
        ${opt("no", "No", state.settings.twice)}
        ${opt("yes", "Yes", state.settings.twice)}
      </select>
    </div>
    <h2 class="group">About</h2>
    ${installPanel()}
    <div class="row">
      <button class="act" id="share">Share this app</button>
      <button class="act" id="feedback">Send feedback</button>
    </div>
    <div class="draft" id="feedbackbox" hidden></div>
    <p class="note about">PhraseBook${state.version ? ` · version ${esc(state.version.replace("phrasebook-", ""))}` : ""}. Your progress and settings stay on this device.${analyticsOn ? " The app counts anonymous visits and which features are used, with no cookies and no personal data." : ""}</p>`;
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
      if (confirm(`Remove ${lang.name} from this device? Your progress is kept.`)) { await removePack(code); renderSettings(); }
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
        track("download/" + code);
        syncPack(EN).catch(() => {});
      }
      await useLanguage(code);
      delete state.busy[code];
      track("language/" + code);
    } catch {
      state.busy[code] = "Couldn't download. Check you're online and try again.";
      setTimeout(() => { delete state.busy[code]; if (state.mode === "settings") renderSettings(); }, 5000);
    }
    if (state.mode === "settings") renderSettings();
  };
  hint("Settings are saved on this device");
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
    const saved = store.get("phrasebook-lang", "");
    // someone who used the app before the picker existed has a language downloaded but never "chose" one
    const usedBefore = state.languages.find((l) => packState(l.code) === "installed");
    const code = valid(saved) ? saved : usedBefore ? usedBefore.code : null;
    state.firstRun = !code; // brand new: ask which language, and download nothing until they say
    state.lang = state.languages.find((l) => l.code === (code || state.languages[0].code)); // a placeholder until they choose
    if (!state.firstRun) { await loadLanguageData(); keepStorage(); }
  } catch {
    main.innerHTML = `<p class="note">Couldn't load the phrases. Open the app once while online.</p>`;
    return;
  }
  state.progress = store.get(progressKey(state.lang.code), {});
  pickVoice();
  rebuildTopicOptions();
  $("#cat").onchange = () => { store.set("phrasebook-cat", $("#cat").value); state.last = null; resetRound(); stopPlayAll(); render(); };
  rebuildDirOptions();
  $("#dir").onchange = () => { store.set("phrasebook-dir", $("#dir").value); state.last = null; resetRound(); render(); };
  if (!["f", "m", "mixed"].includes(state.settings.voice)) state.settings.voice = "f";
  if (!["1", "0.85", "0.7"].includes(state.settings.speed)) state.settings.speed = "1";
  if (!ROUND_CHOICES.includes(state.settings.round)) state.settings.round = "20";
  if (!GAP_CHOICES.includes(state.settings.gap)) state.settings.gap = "2";
  if (!["no", "yes"].includes(state.settings.twice)) state.settings.twice = "no";
  $("#listen").checked = store.get("phrasebook-listen", false);
  $("#listen").onchange = () => { store.set("phrasebook-listen", $("#listen").checked); render(); };
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
