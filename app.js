"use strict";

// This copy of the app's version. It must match CACHE in sw.js; a newer CACHE on the server means an update.
const VERSION = "phrasebook-v109";
// The version people see: release.revision, such as 0.7.42. VERSION counts every release (it is what tells the app an
// update is waiting); each release starts at its first VERSION number, and the revision counts on from there.
// A new release (0.8, or 1.0) is one more line here, with the first VERSION number that belongs to it.
const RELEASES = [[61, "0.7"], [34, "0.6"], [1, "0.5"]]; // 0.5 to October 22, 0.6 from October 29, 0.7 from November 17
const releaseOf = (n) => RELEASES.find(([first]) => n >= first) || RELEASES[RELEASES.length - 1];
const versionName = (n) => { const [first, name] = releaseOf(n); return `${name}.${n - first}`; };
const versionNumber = (v) => Number(/(\d+)$/.exec(v || "")?.[1] || 0);
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
// ?analytics=mine, for the owner's own devices (?analytics=on undoes it). It fails quietly when offline.
// ?analytics=off used to do this; it now does nothing, and devices it switched off count again.
const ANALYTICS_TOKEN = "5720307f64814acea36e11d2a3b09d31"; // Cloudflare: a public site token, safe to publish
const GOATCOUNTER_URL = "https://phrasebook.goatcounter.com/count"; // GoatCounter: the public address of the counter
let analyticsOn = false;
const countQueue = []; // events that happen before GoatCounter's script has finished loading
(function loadAnalytics() {
  try {
    const choice = new URLSearchParams(location.search).get("analytics");
    localStorage.removeItem("phrasebook-no-analytics"); // set by the old ?analytics=off
    if (choice === "mine") localStorage.setItem("phrasebook-not-counted", "1");
    if (choice === "on") localStorage.removeItem("phrasebook-not-counted");
    if (choice !== null) { // take it out of the address bar, so a copied or shared link doesn't carry it
      const u = new URL(location.href);
      u.searchParams.delete("analytics");
      history.replaceState(null, "", u);
    }
    if (["localhost", "127.0.0.1"].includes(location.hostname) || localStorage.getItem("phrasebook-not-counted") || navigator.doNotTrack === "1") return;
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
  fitTabs();
}
// a tab label too long for the bottom tray (Einstellungen, Configuración) is set a little smaller rather than cut off
function fitTabs() {
  document.querySelectorAll(".tab .tl").forEach((el) => {
    el.style.fontSize = "";
    for (let size = parseFloat(getComputedStyle(el).fontSize); el.scrollWidth > el.clientWidth && size > 9; size -= 0.5) el.style.fontSize = size - 0.5 + "px";
  });
}
addEventListener("resize", fitTabs);
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
  skipped: new Set(), // ids of the phrases you chose not to practice in this language
  settings: {
    voice: store.get("phrasebook-voice", "f"), speed: store.get("phrasebook-speed", "1"), round: store.get("phrasebook-round", "20"),
    gap: store.get("phrasebook-gap", "2"), twice: store.get("phrasebook-twice", "no"), // Play all: seconds between, and say it twice
  },
  last: null,
  firstRun: false, // true until a brand-new person has chosen a language
  choosing: null,  // the language being downloaded from the welcome screen
  round: null,    // the quiz round in progress: its questions, where you are, your score and your misses
  busy: {},      // language code -> message while it downloads
  dl: {},        // language code -> percent downloaded, shown as a bar
  query: "",     // the List's search, across every topic; empty when not searching
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
// a card is "learned" once known this many times in a row (as counted in the footer and on the Languages page)
const LEARNED = 3;
// A small celebration for "✓ Knew it": a green ✓ that pops over the card and floats away, or, when a card has just
// become learned, a bigger "Learned!". It sits on top of the page, so the next card is there at once.
function cheer(learned, over = "#flip") {
  const el = document.createElement("div");
  el.className = "cheer" + (learned ? " big" : "");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = learned ? `<span class="cmark">✓</span><span class="ctext">${t("Learned!")} ✨</span>` : `<span class="cmark">✓</span>`;
  // centered on the card, wherever it sits on this screen
  const card = $(over)?.getBoundingClientRect();
  if (card && card.height) { el.style.left = card.left + card.width / 2 + "px"; el.style.top = card.top + card.height / 2 + "px"; }
  document.body.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
  setTimeout(() => el.remove(), 2000); // in case the animation never runs
  navigator.vibrate?.(learned ? [12, 60, 18] : 10);
}
function grade(key, ok) {
  const cur = state.progress[key] || { box: 0 };
  const box = ok ? Math.min(cur.box + 1, INTERVALS.length - 1) : 0;
  state.progress[key] = { box, due: Date.now() + INTERVALS[box] * DAY };
  store.set(progressKey(state.lang.code), state.progress);
  if (ok && box >= LEARNED) checkBadges();
}
// ---------- badges: celebrations of what you've done, never pressure ----------
// Earned once and kept for good, even if a card later slips back out of learned. No streaks, no countdowns, no
// reminders: a small note pops up when one is earned, and More → Badges shows them all (the ones still to come
// faded). Kept on this device only, like progress: { "first-words": time, "polite:ja": time }.
const BADGE_KEY = "phrasebook-badges";
const badge = (id, icon, name, desc) => ({ id, icon, name, desc });
const BADGES = [ // once each, across your languages
  badge("langs-2", "🗺️", "Two languages", "Cards learned in two languages"),
  badge("langs-5", "🧭", "Five languages", "Cards learned in five languages"),
  badge("langs-10", "🌍", "Ten languages", "Cards learned in ten languages"),
  badge("alphabet", "✍️", "New alphabet", "A card learned in a language with its own alphabet"),
  badge("tones", "🎵", "Tones", "A card learned in a tonal language"),
  badge("europe", "🏰", "Europe", "Cards learned in a language of Europe"),
  badge("asia", "🏯", "Asia", "Cards learned in a language of Asia"),
  badge("africa", "🦁", "Africa", "Cards learned in a language of Africa"),
  badge("americas", "🌎", "The Americas", "Cards learned in a language of the Americas"),
  badge("middle-east", "🐪", "The Middle East", "Cards learned in a language of the Middle East"),
  badge("globetrotter", "🌐", "Globetrotter", "Europe, Asia, Africa, the Americas, and the Middle East"),
  badge("romance", "🍷", "Romance", "Two Romance languages: Spanish, French, Italian, Portuguese, or Romanian"),
  badge("germanic", "🥨", "Germanic", "Two Germanic languages: German, Dutch, Danish, Swedish, Norwegian, or English"),
  badge("slavic", "🪆", "Slavic", "Two Slavic languages: Russian, Ukrainian, Polish, Czech, Croatian, or Bulgarian"),
  badge("semitic", "📜", "Semitic", "Two Semitic languages: Arabic, Hebrew, or Amharic"),
];
// where each language is spoken, for the region badges (a language can count for more than one)
const REGIONS = {
  europe: ["es", "fr", "nl", "de", "it", "pt-pt", "ru", "uk", "da", "pl", "cs", "el", "hr", "hu", "ro", "sv", "nb", "fi", "bg", "tr"],
  asia: ["vi", "ja", "km", "lo", "zh", "ko", "id", "tl", "th", "hi", "si", "ru"],
  africa: ["sw", "zu", "am", "ary", "ar", "fr"],
  americas: ["es", "pt-br", "en-us"],
  "middle-east": ["ar", "he", "fa", "tr"],
};
// language families, for the family badges: two different languages earn one (the two Portugueses, and the two
// Arabics, count as one language)
const FAMILIES = {
  romance: ["es", "fr", "it", "pt-br", "pt-pt", "ro"],
  germanic: ["de", "nl", "da", "sv", "nb", "en-us"],
  slavic: ["ru", "uk", "pl", "cs", "hr", "bg"],
  semitic: ["ar", "ary", "he", "am"],
};
const SAME = { "pt-pt": "pt-br", ary: "ar" };
const LANG_BADGES = [ // earned again in each language
  badge("first-words", "🌱", "First words", "Your first card learned"),
  badge("first-quiz", "🎯", "First quiz", "A quiz round finished"),
  badge("perfect", "⭐", "Perfect round", "Every answer right in a quiz round of 10 or more"),
  badge("good-ear", "👂", "Good ear", "A perfect round with Listening only on"),
  badge("all-ears", "🎧", "All ears", "Play all listened to right to the end"),
  badge("polite", "🙏", "Polite basics", "Hello, please, thank you and excuse me, learned both ways"),
  badge("numbers", "🔢", "Counting", "All the numbers"),
  badge("food", "🍽️", "Food", "The whole Food topic"),
  badge("getting-around", "🚆", "Getting around", "The whole Getting Around topic"),
  badge("emergency", "🆘", "Emergency", "The whole Emergency topic"),
  badge("trip-ready", "✈️", "Trip-ready", "Polite basics, Counting and Emergency"),
  badge("halfway", "🌗", "Halfway", "Half the cards you practice, learned"),
  badge("whole-book", "🏅", "The whole book", "Every card you practice, learned"),
];
const POLITE = ["hello", "please", "thank-you", "excuse-me"];
const OWN_ALPHABET = new Set(["ja", "km", "lo", "zh", "he", "ko", "th", "ru", "ar", "ary", "fa", "uk", "hi", "am", "el", "bg", "si"]);
const TONAL = new Set(["vi", "th", "lo", "zh"]);
const BOOK_MIN = 40; // Halfway and The whole book need at least this many phrases in practice, so leaving out most can't earn them
const earnedBadges = () => store.get(BADGE_KEY, {});
// a language's progress and left-out phrases, from memory for the one in use and from storage for the others
function progressOf(code) {
  const mine = code === state.lang?.code;
  return {
    learned: new Set(Object.entries(mine ? state.progress : store.get(progressKey(code), {})).filter(([, v]) => v.box >= LEARNED).map(([k]) => k)),
    skipped: mine ? state.skipped : new Set(store.get(skipKey(code), [])),
  };
}
// the language badges a language has reached now: a topic counts once each of its phrases you practice is learned,
// either way round (and at least half the topic is in practice); Polite basics needs both ways
function langBadgesNow(code) {
  const { learned, skipped } = progressOf(code);
  const either = (id) => learned.has(id + ":to") || learned.has(id + ":from");
  const topic = (cat) => {
    const ids = state.shared.filter((p) => p.cat === cat).map((p) => p.id);
    const active = ids.filter((id) => !skipped.has(id));
    return active.length > 0 && active.length * 2 >= ids.length && active.every(either);
  };
  const active = state.shared.filter((p) => !skipped.has(p.id));
  const known = active.reduce((n, p) => n + learned.has(p.id + ":to") + learned.has(p.id + ":from"), 0);
  const got = {
    "first-words": learned.size > 0,
    polite: POLITE.every((id) => learned.has(id + ":to") && learned.has(id + ":from")),
    numbers: topic("numbers"), food: topic("food"), "getting-around": topic("getting-around"), emergency: topic("emergency"),
    halfway: active.length >= BOOK_MIN && known * 2 >= active.length * 2,
    "whole-book": active.length >= BOOK_MIN && known === active.length * 2,
  };
  got["trip-ready"] = got.polite && got.numbers && got.emergency;
  return Object.keys(got).filter((k) => got[k]);
}
// Award whatever has been reached and not yet earned. Returns the new ones as [badge, language or null].
// also: language badges just reached in the language in use (a quiz round, Play all), which progress can't show.
function checkBadges({ quiet = false, also = [] } = {}) {
  if (!state.shared.length) return [];
  const earned = earnedBadges();
  const fresh = [];
  const add = (key, b, lang = null) => { if (!earned[key]) { earned[key] = Date.now(); fresh.push([b, lang]); } };
  const withCards = state.languages.filter((l) => progressOf(l.code).learned.size);
  for (const l of withCards) for (const id of langBadgesNow(l.code)) add(id + ":" + l.code, LANG_BADGES.find((b) => b.id === id), l);
  for (const id of also) add(id + ":" + state.lang.code, LANG_BADGES.find((b) => b.id === id), state.lang);
  const reached = new Set();
  if (withCards.length >= 2) reached.add("langs-2");
  if (withCards.length >= 5) reached.add("langs-5");
  if (withCards.length >= 10) reached.add("langs-10");
  if (withCards.some((l) => OWN_ALPHABET.has(l.code))) reached.add("alphabet");
  if (withCards.some((l) => TONAL.has(l.code))) reached.add("tones");
  const codes = withCards.map((l) => l.code);
  for (const [region, langs] of Object.entries(REGIONS)) if (codes.some((c) => langs.includes(c))) reached.add(region);
  if (Object.keys(REGIONS).every((r) => reached.has(r))) reached.add("globetrotter");
  for (const [family, langs] of Object.entries(FAMILIES)) {
    if (new Set(codes.filter((c) => langs.includes(c)).map((c) => SAME[c] || c)).size >= 2) reached.add(family);
  }
  for (const b of BADGES) if (reached.has(b.id)) add(b.id, b);
  if (!fresh.length) return fresh;
  store.set(BADGE_KEY, earned);
  if (!quiet) fresh.forEach(([b, l]) => badgeToast(`${b.icon} ${t("Badge earned")}: ${esc(t(b.name))}${l ? " · " + esc(langName(l)) : ""}`));
  return fresh;
}
// The note that a badge was earned: at the top, for a few seconds, after the card's own ✓ has had its moment.
// Several earned at once come one after another.
const toastQueue = [];
function badgeToast(html) {
  toastQueue.push(html);
  if (toastQueue.length === 1) setTimeout(nextToast, 900);
}
function nextToast() {
  if (!toastQueue.length) return;
  if (document.querySelector(".updated:not(.badgeup)")) { setTimeout(nextToast, 1500); return; } // after "PhraseBook was updated"
  const el = document.createElement("div");
  el.className = "updated badgeup";
  el.setAttribute("role", "status");
  el.innerHTML = `<span>${toastQueue[0]}</span><button class="ulink">${t("See badges")}</button><button class="uclose" aria-label="${t("Close")}">✕</button>`;

  document.body.appendChild(el);
  let done = false;
  const close = () => {
    if (done) return;
    done = true;
    el.classList.add("gone");
    setTimeout(() => { el.remove(); toastQueue.shift(); nextToast(); }, 300);
  };
  el.querySelector(".ulink").onclick = () => { close(); goTo("badges"); };
  el.querySelector(".uclose").onclick = close;
  setTimeout(close, 5000);
}
// The first time the app has badges, someone with progress already has some: one note for all of them, not one each
function firstBadges() {
  // Language badges start afresh, once: moving the old ones to a language put some on the wrong one. Those that
  // progress shows (Polite basics, the topics...) come straight back, quietly; quiz and Play all ones are earned anew.
  let old = store.get(BADGE_KEY, null);
  if (old !== null && !store.get("phrasebook-badges-reset", false)) {
    for (const k of Object.keys(old)) if (k.includes(":") || ["first-words", "first-quiz", "perfect", "good-ear", "all-ears"].includes(k)) delete old[k];
    store.set(BADGE_KEY, old);
    checkBadges({ quiet: true });
  }
  store.set("phrasebook-badges-reset", true);
  if (old !== null) { checkBadges(); return; }
  const n = checkBadges({ quiet: true }).length;
  if (!n) { store.set(BADGE_KEY, {}); return; }
  badgeToast(`🏅 ${n === 1 ? t("You've already earned a badge") : t("You've already earned {n} badges", { n })}`);
}
// a language's badges, small, under its progress on the Languages page
function badgeStrip(code) {
  const earned = earnedBadges();
  const got = LANG_BADGES.filter((b) => earned[b.id + ":" + code]);
  return got.length ? `<span class="lbadges" title="${t("Badges")}">${got.map((b) => `<span aria-label="${esc(t(b.name))}">${b.icon}</span>`).join("")}</span>` : "";
}
function badgeTile(b, on) {
  return `<div class="badge${on ? " on" : ""}"><span class="bi" aria-hidden="true">${b.icon}</span><span class="bn">${esc(t(b.name))}</span><span class="bd">${on ? "" : `<span class="sr">${t("Not yet")}: </span>`}${esc(t(b.desc))}</span></div>`;
}
function renderBadges() {
  checkBadges({ quiet: true });
  const earned = earnedBadges();
  const count = Object.keys(earned).length;
  const has = (l, b) => earned[b.id + ":" + l.code];
  // the language in use first, then the others on this device, then any other with a badge or a card learned
  const langs = [state.lang, ...state.languages.filter((l) => l.code !== state.lang.code
    && (packState(l.code) !== "none" || LANG_BADGES.some((b) => has(l, b)) || progressOf(l.code).learned.size))];
  const open = store.get("phrasebook-badges-open", []);
  main.innerHTML = `${backToMore()}
    <h2 class="group">${t("Badges")} · ${t("{n} earned", { n: count })}</h2>
    <p class="note">${t("Badges celebrate what you've done. You can't lose them, and there's no rush.")}</p>
    ${langs.map((l) => {
      const got = LANG_BADGES.filter((b) => has(l, b));
      return `
    <details class="blang" data-code="${l.code}"${open.includes(l.code) ? " open" : ""}>
      <summary><span class="bln">${esc(langName(l))} <span class="note" lang="${l.code}">${esc(l.native)}</span></span>
        <span class="blc">${got.map((b) => b.icon).join("")} <span class="note">${got.length}/${LANG_BADGES.length}</span></span></summary>
      <div class="badges">${LANG_BADGES.map((b) => badgeTile(b, has(l, b))).join("")}</div>
    </details>`;
    }).join("")}
    <h2 class="group">${t("Across your languages")}</h2>
    <div class="badges">${BADGES.map((b) => badgeTile(b, earned[b.id])).join("")}</div>`;
  main.querySelectorAll("details.blang").forEach((d) => d.addEventListener("toggle", () => {
    store.set("phrasebook-badges-open", [...main.querySelectorAll("details.blang[open]")].map((x) => x.dataset.code));
  }));
  wireBack();
  hint("");
}

// Phrases you don't want to practice (the beer phrase, if you don't drink), one list per language, shown as an empty
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
// the languages you can learn: all of them, except one that is the language you speak under another code (English to
// learn, "en-us", is "sameAs" English, the language you know; you can't learn English from English). The one being
// studied always stays, so a link or an old setting never leaves the app without a language.
const learnable = () => state.languages.filter((l) => !l.sameAs || l.sameAs !== state.base || l.code === state.lang?.code);
// the one to use: the chosen one, unless it is the language being studied (French from French makes no sense)
function wantedKnown() {
  const k = knownLanguages().find((l) => l.code === state.base);
  return k && k.code !== state.lang.code ? k : ENGLISH;
}
// text in the language you know, tagged so the device reads and hyphenates it as that language
// "mark" highlights what the List's search matched
const own = (s, mark) => `<span lang="${state.known.code}">${mark ? hl(s) : esc(s)}</span>`;

// ---------- ui helpers ----------
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// text in the language being studied, tagged so the device picks the right font, and marked right-to-left for
// Hebrew and the like ("rtl" in languages.json) so its punctuation lands on the correct side
const rtlAttr = () => (state.lang.rtl ? ' dir="rtl"' : "");
const nat = (s, mark) => `<span lang="${state.lang.code}"${rtlAttr()}>${mark ? hl(s) : esc(s)}</span>`;
// a phrase with a gap ("Which train for...?") shown with the example its audio uses filled in and marked, so what you
// see matches what you hear: "filled" holds it as "Tàu nào đi ⟦Hà Nội⟧?". The quiz keeps the gap.
const natFilled = (p, mark) => p.filled
  ? `<span lang="${state.lang.code}"${rtlAttr()}>${esc(p.filled).replace(/⟦(.*?)⟧/, `<mark class="example" title="${esc(t("An example: put in your own"))}">$1</mark>`)}</span>`
  : nat(p.text, mark);
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
  return `<div class="woman">${t("A woman says:")} ${f.text ? `<b>${natFilled(f)}</b> ` : ""}${f.say ? `<i>${esc(f.say)}</i>` : ""}</div>`;
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
// The ✓ circle: practice this phrase, or (empty) leave it out
function practiceButton(p) {
  const on = !isSkipped(p);
  return `<button class="practice${on ? " on" : ""}" data-skip="${p.id}" aria-pressed="${on}" aria-label="${t("Practice this phrase")}"></button>`;
}
// make every ✓ circle under root work; then(p, on) runs after each change
function wirePractice(root, then = () => {}) {
  root.querySelectorAll("button.practice").forEach((b) => b.onclick = (e) => {
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
  const front = fromLang ? natFilled(p) : own(p.known);
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
          <div class="big">${fromLang ? own(p.known) : natFilled(p)}</div>
          <button class="speak" id="say2" aria-label="${t("Play")}">🔊</button>
          <div class="orig">${fromLang ? name : yourName}: <b>${front}</b></div>
          ${pron(p)}
        </div>
      </div>
    </div>
    ${practiceButton(p)}
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
  wirePractice(main, (_, on) => say(on ? t("Back in practice.") : t("Left out of practice. Tap the circle again to keep it."), 4000));
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
  $("#got").onclick = () => {
    const wasLearned = (state.progress[key]?.box || 0) >= LEARNED;
    grade(key, true);
    cheer(!wasLearned && state.progress[key].box >= LEARNED); // a bigger one the moment a card counts as learned
    render();
  };
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
  return { items: shuffle(picked), index: 0, correct: 0, missed: [], cat: topicsKey(), dir: $("#dir").value, size: state.settings.round, listen: $("#listen").checked };
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
    index: r.index, correct: r.correct, counted: !!r.counted, cat: r.cat, dir: r.dir, size: r.size, listen: !!r.listen,
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
// Listening only, with the choices in the language: they are played one after another, each lit while it plays, and
// one can be picked at any time. Answering, or leaving the question, stops them.
let quizRun = 0;
function speakDone(p) {
  return new Promise((done) => {
    const finish = () => { tapPlayer.removeEventListener("ended", ended); clearTimeout(timer); done(); };
    const ended = () => { if (tapPlayer.src.startsWith("blob:")) finish(); }; // the phrase, not the hum speak() starts with
    const timer = setTimeout(finish, 6000); // the device's own voice, or a clip that never ends, doesn't hold it up
    tapPlayer.addEventListener("ended", ended);
    speak(p);
  });
}
async function playChoices(opts, box, run) {
  await sleep(600); // a moment to read the question first
  for (let i = 0; i < opts.length; i++) {
    if (run !== quizRun || state.mode !== "quiz") return;
    box.children[i].classList.add("speaking");
    await speakDone(opts[i]);
    box.children[i]?.classList.remove("speaking");
    await sleep(400);
  }
}
function renderQuiz() {
  quizRun++;
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
      ${practiceButton(p)}
      <div class="label">${t("Pick the {name}", { name: toLang ? name : esc(langName(state.known)) })}</div>
      <div class="big">${toLang ? own(p.known) : (listenOnly ? "🎧" : nat(p.text))}</div>
      ${toLang ? "" : `<button class="speak" id="say" aria-label="${t("Play")}">🔊</button>`}
    </div>
    <div id="choices"></div>
    <div class="reveal" id="reveal"></div>
    <div class="row sticky hidden" id="nextrow"><button class="act next" id="next">${number === total ? t("See score") : t("Next")} →</button></div>`;
  if (!toLang) { $("#say").onclick = () => speak(p); autoSpeak(p); }
  wirePractice(main, (_, on) => say(on ? t("Back in practice.") : t("Left out of later rounds. Tap the circle again to keep it."), 4000));
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
      quizRun++; // stops the choices playing
      box.querySelectorAll(".speaking").forEach((c) => c.classList.remove("speaking"));
      const ok = o.id === p.id;
      const wasLearned = (state.progress[key]?.box || 0) >= LEARNED;
      grade(key, ok);
      if (ok) cheer(!wasLearned && state.progress[key].box >= LEARNED, ".card.q"); // as on the cards: a ✓, or "Learned!"
      // record the answer and move on at once, so leaving this tab and coming back never asks (or scores) it twice
      if (ok) round.correct++; else round.missed.push(round.items[round.index]);
      if (!listenOnly) round.listen = false; // Good ear needs Listening only for the whole round
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
  if (toLang && listenOnly && !muted) playChoices(opts, box, quizRun);
  $("#next").onclick = render;
  updateStatus();
}

// The score screen at the end of a round: how you did, and the questions you missed.
function renderSummary() {
  const r = state.round;
  if (!r.counted) { // once per round, not each time the screen is redrawn
    r.counted = true;
    saveRound();
    track("quiz/finished/" + state.lang.code);
    const perfect = r.items.length >= 10 && r.correct === r.items.length;
    checkBadges({ also: ["first-quiz", ...(perfect ? ["perfect"] : []), ...(perfect && r.listen ? ["good-ear"] : [])] });
  }
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
          ${fromFirst ? "" : `<div class="en">${own(p.known, withSkip)}</div>`}
          <div class="vi"${rtlAttr()}>${natFilled(p, withSkip)}</div>
          ${p.say ? `<div class="say">${withSkip ? hl(p.say) : esc(p.say)}</div>` : ""}
          ${womanForm(p)}
          ${fromFirst ? `<div class="en">${own(p.known, withSkip)}</div>` : ""}
          ${p.tones ? `<div class="tones">${esc(p.tones)}</div>` : ""}
          ${withNote && p.note ? `<div class="note">${noteText(p.note)}</div>` : ""}
        </div>
        <div class="side">
          <button class="speak" data-id="${p.id}" aria-label="${t("Play")}">🔊</button>
          ${withSkip ? practiceButton(p) : ""}
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
// the phrases the List shows, grouped by topic, in the order they appear: those in the chosen topics, or while
// searching, those in any topic that match
function listGroups() {
  const groups = {};
  for (const p of state.phrases) if (state.query ? matches(p) : inTopics(p)) (groups[p.cat] ||= []).push(p);
  return groups;
}

// ---------- search ----------
// Accents and case don't count ("cafe" finds "café", "nusse" finds "Nüsse"). Each character is folded on its own,
// so a match can be mapped back onto the text as written to highlight it.
const fold = (ch) => ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ß/g, "ss");
function folded(s) {
  let out = "";
  const start = []; // where each original character begins in the folded text
  for (const ch of s) { start.push(out.length); out += fold(ch); }
  start.push(out.length);
  return { out, start };
}
// where the query is found in a text: at the start of a word for queries in a script written with spaces between
// words ("pharm" finds pharmacy, "arm" doesn't), anywhere for Thai, Chinese, Japanese and the like
function hits(s) {
  const q = fold(state.query);
  if (!q || !s) return [];
  const { out } = folded(s);
  const anywhere = /[^\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Hebrew}\p{Script=Hangul}\s\d\p{P}]/u.test(state.query);
  const found = [];
  for (let i = out.indexOf(q); i >= 0; i = out.indexOf(q, i + 1)) {
    if (anywhere || i === 0 || !/[\p{L}\p{N}]/u.test(out[i - 1])) found.push(i);
  }
  return found;
}
const plain = (s) => (s || "").replace(/[⟦⟧]/g, "");
function matches(p) {
  return [p.known, p.en, p.text, plain(p.filled), p.say, p.female?.text, p.female?.say].some((s) => hits(s).length);
}
// the text, escaped, with what the search matched in <mark class="hit">
function hl(s) {
  const at = state.query ? hits(s) : [];
  if (!at.length) return esc(s);
  const { start } = folded(s);
  const chars = [...s], q = fold(state.query).length;
  let html = "", i = 0;
  for (const a of at) {
    const from = start.findIndex((x) => x >= a), to = start.findIndex((x) => x >= a + q);
    if (from < i) continue;
    html += esc(chars.slice(i, from).join("")) + `<mark class="hit">${esc(chars.slice(from, to).join(""))}</mark>`;
    i = to;
  }
  return html + esc(chars.slice(i).join(""));
}
function openSearch() {
  $(".opts").classList.add("searching");
  $(".search").hidden = false;
  $("#q").placeholder = t("Search all phrases");
  $("#q").focus();
  track("search/open");
}
function closeSearch(redraw = true) {
  if (!$(".opts").classList.contains("searching")) return;
  $(".opts").classList.remove("searching");
  $(".search").hidden = true;
  $("#q").value = "";
  if (state.query) {
    state.query = "";
    if (playAll) stopPlayAll(); // it was playing the results
    if (redraw && state.mode === "list") renderList();
  }
}
function renderList() {
  const fromFirst = $("#dir").value === "from"; // the language you know first, unless studying the language → yours
  const groups = listGroups();
  const playing = playAll && playAll.playing;
  if (state.query) {
    const n = Object.values(groups).flat().length;
    if (!n) {
      main.innerHTML = `<p class="note searchnote">${t("No phrase matches “{q}”.", { q: esc(state.query) })}</p>`;
      hint("");
      return;
    }
    hint(t(n === 1 ? "1 phrase found, in any topic" : "{n} phrases found, in any topic", { n }));
  }
  main.innerHTML = draftBanner() + Object.entries(groups).map(([c, ps]) => `
    <h2 class="group">${esc(t(topicName(c)))}</h2>
    ${ps.map((p) => entryHtml(p, fromFirst, true, true)).join("")}`).join("") + `
    <div class="row sticky"><button class="act${playing ? "" : " good"}" id="playall">${playing ? t("⏸ Pause") : t("▶ Play all")}</button></div>`;
  wireSpeakButtons();
  // changed in place, so the List doesn't jump
  wirePractice(main, (p, on) => main.querySelector(`[data-entry="${CSS.escape(p.id)}"]`).classList.toggle("skipped", !on));
  $("#playall").onclick = () => (playAll && playAll.playing ? pausePlayAll() : startPlayAll());
  if (playAll) markPlaying();
  else if (!state.query) hint(t("Tap 🔊 to hear a phrase, or ▶ to hear them all"));
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
    if (pa.index === pa.items.length - 1 && pa.items.length >= 10) checkBadges({ also: ["all-ears"] });
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
// What's new: the versions that brought a new language or feature (changes.json, newest first), reached from Settings
async function renderChanges() {
  try {
    state.changes ||= await (await fetch("changes.json")).json();
  } catch {
    main.innerHTML = `<p class="note">${t("The list of changes isn't available offline yet. Open the app once while online.")}</p>`;
    return;
  }
  if (state.mode !== "changes") return;
  const locale = state.base === "es" ? "es-419" : state.base;
  const current = parseInt((state.version || "").replace("phrasebook-v", ""), 10);
  const names = (codes) => codes.map((c) => state.languages.find((l) => l.code === c)).filter(Boolean).map(langName);
  const item = (it) => {
    if (it.langs) {
      const n = names(it.langs);
      return n.length === 1 ? t("New language: {name}", { name: esc(n[0]) }) : t("New languages: {names}", { names: esc(new Intl.ListFormat(locale, { type: "conjunction" }).format(n)) });
    }
    return esc(it[state.base] || it.en);
  };
  const when = (d) => new Date(d + "T12:00:00").toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  const releases = [];
  for (const c of state.changes) {
    const [, name] = releaseOf(c.v);
    if (!releases.length || releases[releases.length - 1].name !== name) releases.push({ name, changes: [] });
    releases[releases.length - 1].changes.push(c);
  }
  main.innerHTML = `
    ${backToMore()}
    <h2 class="group">${t("What's new")}</h2>
    ${releases.map((r, i) => `
      <details class="release"${i === 0 ? " open" : ""}>
        <summary><b>${r.name}</b> <span class="note">${when(r.changes[r.changes.length - 1].date)} – ${when(r.changes[0].date)}</span></summary>
        ${r.changes.map((c) => `
        <div class="change" data-v="${c.v}">
          <div class="ver">${t("version {v}", { v: versionName(c.v) })} · ${when(c.date)}${c.v === current ? ` · <b>${t("This version")}</b>` : ""}</div>
          <ul>${c.items.map((it) => `<li>${item(it)}</li>`).join("")}</ul>
        </div>`).join("")}
      </details>`).join("")}`;
  wireBack();
  hint("");
}
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

// a language's status while it downloads: a bar with the percentage, which progress() then moves along
function dlStatus(code) {
  if (!(code in state.dl)) return `<span class="lstate">${esc(state.busy[code])}</span>`;
  const p = state.dl[code];
  return `<span class="dl"><span class="bar"><span style="width:${p}%"></span></span><span class="pct">${p}%</span></span>`;
}
// the callback syncPack calls as files arrive: updates the bar in place, without redrawing the page
function progress(code) {
  state.dl[code] = 0;
  return (done, total) => {
    const p = total ? Math.floor((done / total) * 100) : 0;
    state.dl[code] = p;
    const row = document.querySelector(`[data-lang="${code}"]`);
    if (!row) return;
    if (!row.querySelector(".dl")) { const st = row.querySelector(".lstate"); if (st) st.outerHTML = dlStatus(code); }
    const bar = row.querySelector(".dl .bar > span"), pct = row.querySelector(".dl .pct");
    if (bar) bar.style.width = p + "%";
    if (pct) pct.textContent = p + "%";
  };
}
// a language is ready to learn: a pop-up in the middle of the screen, over a dimmed page, that leads to its phrases.
// It stays until the person chooses.
function readyDialog(lang, downloaded, start) {
  document.querySelector("dialog.ready")?.remove();
  const d = document.createElement("dialog");
  d.className = "ready";
  d.setAttribute("aria-labelledby", "readytitle");
  const name = esc(langName(lang));
  d.innerHTML = `
    <div class="readyicon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
    <h2 id="readytitle">${downloaded ? t("{name} is ready", { name }) : t("Now learning {name}", { name })}</h2>
    <p class="native" lang="${lang.code}">${esc(lang.native)}</p>
    ${downloaded ? `<p class="note">${t("It's on this device and works offline.")}</p>` : ""}
    <button class="act good" data-go>${t("Start learning")}</button>
    <button class="later" data-later>${t("Not now")}</button>`;
  document.body.appendChild(d);
  const close = () => { d.close(); d.remove(); };
  // "start" switches to a language that was only downloaded; one already switched to just opens its List
  d.querySelector("[data-go]").onclick = async () => { close(); if (start) await start(); goTo("list"); };
  d.querySelector("[data-later]").onclick = close;
  d.addEventListener("click", (e) => { if (e.target === d) close(); }); // a tap on the dimmed page around it
  d.addEventListener("cancel", (e) => { e.preventDefault(); close(); }); // Escape
  d.showModal();
  d.querySelector("[data-go]").focus();
}
// The pages reached from the More tab, which stays lit on them
const MORE_PAGES = ["more", "languages", "badges", "settings", "help", "changes", "about", "install"];
const tabFor = (mode) => (MORE_PAGES.includes(mode) ? "more" : mode);
// go to a page as if its tab had been tapped
function goTo(mode) {
  state.mode = mode;
  if (mode !== "list") closeSearch(false);
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === tabFor(mode)));
  // topic, direction and listening-only belong to the practice pages
  $(".opts").hidden = !["list", "cards", "quiz"].includes(mode);
  render();
  scrollTo(0, 0);
}
const backToMore = () => `<button class="mini ghost backbtn" id="back">‹ ${t("More")}</button>`;
const wireBack = () => { $("#back").onclick = () => goTo("more"); };

// ---------- first run: choose a language ----------
// one language to choose: its name, its own name, and a › — the whole row is the button. While it downloads, the
// row shows the progress bar (or the error) and the others step back.
function pickerRow(l) {
  const busy = state.busy[l.code];
  return `
    <button class="pick${state.choosing && state.choosing !== l.code ? " dim" : ""}" data-lang="${l.code}"${state.choosing ? " disabled" : ""}>
      <span class="pt"><span class="pn">${esc(langName(l))}</span><span class="pnat" lang="${l.code}">${esc(l.native)}</span>${busy ? `<span class="note">${dlStatus(l.code)}</span>` : ""}</span>
      ${busy ? "" : `<span class="mc" aria-hidden="true">›</span>`}
    </button>`;
}
// the "I speak" choices, each in its own language (English, Deutsch, Español), whatever language the app is in,
// so anyone can find theirs
// While you learn English, English can't be the language you speak, so it is shown but not offered
const knownSelect = () => knownLanguages().map((l) => {
  const off = !state.firstRun && state.lang?.sameAs === l.code && l.code !== state.base;
  return `<option value="${l.code}"${l.code === state.base ? " selected" : ""}${off ? " disabled" : ""} lang="${l.code}">${esc(l.native)}${off ? " – " + esc(t("you're learning it")) : ""}</option>`;
}).join("");
function renderWelcome() {
  document.body.classList.add("firstrun");
  const choices = learnable().filter((l) => !(l.sameAs && l.sameAs === state.base)).sort((a, b) => langName(a).localeCompare(langName(b)));
  main.innerHTML = `
    <div class="welcome">
      <div class="whead">
        <img src="icon-v3-180.png" alt="" width="64" height="64">
        <h1>${t("Welcome to PhraseBook")}</h1>
        <p class="tagline">${t("A free phrase book for travel: flashcards, quizzes, and audio, and it works offline.")}</p>
      </div>
      <div class="wknown"><label for="wknown">${t("I speak")}</label><select id="wknown">${knownSelect()}</select></div>
      <p class="lead">${t("Which language would you like to learn?")}</p>
      <div id="welcomelangs" class="wlist">${choices.map(pickerRow).join("")}</div>
      <p class="note wnote">${t("About 2 MB each, downloaded once. You can add more languages later.")}</p>
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
    const row = e.target.closest("[data-lang]"); // the row itself, not only its Start button
    if (row) chooseFirstLanguage(row.dataset.lang);
  };
}
async function chooseFirstLanguage(code) {
  if (state.choosing) return;
  state.choosing = code;
  state.busy[code] = t("Starting…");
  renderWelcome();
  try {
    if (canCache) {
      await syncPack(code, progress(code));
      track("download/" + code);
    }
    await useLanguage(code);
    if (canCache) syncKnownPack().catch(() => {}); // the language you know, for Play all, follows in the background (and is retried later)
    track("language/" + code);
    delete state.busy[code];
    delete state.dl[code];
    state.choosing = null;
    state.firstRun = false;
    document.body.classList.remove("firstrun");
    $("#cat").textContent = topicLabel(); // drawn before the language you speak was chosen on the welcome page
    render();
  } catch {
    state.choosing = null;
    delete state.dl[code];
    state.busy[code] = t("Couldn't download. Check you're online and try again.");
    renderWelcome();
    setTimeout(() => { delete state.busy[code]; if (state.firstRun && !state.choosing) renderWelcome(); }, 5000);
  }
}

function render() {
  document.body.dataset.mode = state.mode; // search is only on the List
  main.classList.remove("help");
  if (state.firstRun) { renderWelcome(); return; }
  if (state.mode === "cards") renderCard();
  else if (state.mode === "quiz") renderQuiz();
  else if (state.mode === "list") renderList();
  else if (state.mode === "guide") renderGuide();
  else if (state.mode === "changes") renderChanges();
  else if (state.mode === "more") renderMore();
  else if (state.mode === "languages") renderLanguages();
  else if (state.mode === "badges") renderBadges();
  else if (state.mode === "help") renderHelp();
  else if (state.mode === "about") renderAbout();
  else if (state.mode === "install") renderInstall();
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
    // as a prompt, a phrase can read differently from how a learner should say it ("prompt": Quiero... for I want, while learners of Spanish say ¿Me da...?)
    return { ...p, ...texts[p.id], ...mine, ...(female ? { female } : {}), known: theirs?.[p.id]?.prompt || theirs?.[p.id]?.text || p.en };
  });
  translatePage();
}
// Packs downloaded only because they were the language you know, not chosen to learn. Switching away removes them,
// so only what you use stays on the device (and is kept up to date). English's own pack is always one of these, as
// English as the language you know is never the one you learn (English to learn is its own pack, "en-us"); a language
// you choose to learn stops being one.
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
  const previous = { lang: state.lang, progress: state.progress, skipped: state.skipped };
  const before = state.known.code;
  // the language and its progress change together, so nothing in between counts (or saves) one language's progress as another's
  state.lang = state.languages.find((l) => l.code === code);
  state.progress = store.get(progressKey(code), {});
  loadSkipped();
  try {
    await loadLanguageData();
  } catch (err) {
    Object.assign(state, previous); // keep studying what we had
    throw err;
  }
  store.set("phrasebook-lang", code);
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
// A newer version on the server is applied by reloading, but only once the phone has it stored (the service worker
// has installed it into its own cache): a reload before then could bring back the old version and ask again.
// It never interrupts: in the middle of a quiz round or Play all it waits, and is applied when you leave the app
// (except while Play all plays, which goes on with the screen locked) or at the next check after you're done.
// After the reload you are back on the same page. If the server is still part-way through a release and hands back
// the old files, it doesn't reload again for that version for ten minutes, so it can't go round in circles.
const busyNow = () => {
  const r = state.round;
  const midRound = state.mode === "quiz" && r && r.index > 0 && r.index < r.items.length;
  return midRound || (playAll && playAll.playing);
};
async function newVersionStored(version) {
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => null);
  if (!reg || !("caches" in window)) return true; // no offline copy to wait for: a reload fetches the new files
  await reg.update().catch(() => {});
  for (let i = 0; i < 30; i++) {
    if ((await caches.has(version)) && !reg.installing && !reg.waiting) return true;
    await sleep(1000);
  }
  return false; // not there yet: the next check tries again
}
function applyUpdate(version) {
  const last = store.get("phrasebook-reloaded-for", null);
  if (last && last.v === version && Date.now() - last.at < 10 * 60000) return; // just tried this one
  store.set("phrasebook-reloaded-for", { v: version, at: Date.now() });
  store.set("phrasebook-resume", { mode: state.mode, at: Date.now() });
  location.reload();
}
async function installUpdate(version) {
  if (!(await newVersionStored(version))) return;
  if (busyNow()) { state.pendingUpdate = version; return; }
  applyUpdate(version);
}
document.addEventListener("visibilitychange", () => {
  // leaving the app is a good moment for a waiting update, unless Play all is playing with the screen locked
  if (document.hidden && state.pendingUpdate && !(playAll && playAll.playing)) applyUpdate(state.pendingUpdate);
});
// After the app has updated itself (usually by reloading as it opens, before anything shows), say so once: a short
// notice at the top with the way to What's new, which closes by itself. Not on a first visit.
function updatedNotice() {
  const seen = store.get("phrasebook-seen-version", null);
  store.set("phrasebook-seen-version", VERSION);
  const num = (v) => Number(/(\d+)$/.exec(v || "")?.[1] || 0);
  if (!seen || num(VERSION) <= num(seen) || state.firstRun) return;
  const el = document.createElement("div");
  el.className = "updated";
  el.setAttribute("role", "status");
  el.innerHTML = `<span>✓ ${t("PhraseBook was updated to {v}", { v: versionName(versionNumber(VERSION)) })}</span>
    <button class="ulink">${t("What's new")}</button><button class="uclose" aria-label="${t("Close")}">✕</button>`;
  document.body.appendChild(el);
  const close = () => { el.classList.add("gone"); setTimeout(() => el.remove(), 300); };
  el.querySelector(".ulink").onclick = () => { close(); goTo("changes"); };
  el.querySelector(".uclose").onclick = close;
  setTimeout(close, 10000);
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
      if (state.mode === "list" || state.mode === "guide" || state.mode === "languages") render();
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
  const mine = learnable().filter(onDevice).sort((a, b) => rank(a.code) - rank(b.code));
  const available = learnable().filter((l) => !onDevice(l)).sort((a, b) => langName(a).localeCompare(langName(b))); // alphabetical
  return { mine, available };
}
// Put your languages in order by dragging the handle (⠿) on a row: it follows the finger or mouse, and the others
// slide out of the way. On the keyboard, the handle moves its language with ↑ and ↓.
function wireReorder() {
  const box = $("#langs");
  if (!box) return;
  for (const grip of box.querySelectorAll(".grip")) {
    const row = grip.closest(".lang");
    grip.onkeydown = (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      moveLanguage(row.dataset.lang, e.key === "ArrowUp" ? -1 : 1);
      renderLanguages();
      $(`[data-lang="${row.dataset.lang}"] .grip`)?.focus();
    };
    grip.onpointerdown = (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      const rows = [...box.querySelectorAll(".lang[data-pos]")];
      const rects = rows.map((r) => r.getBoundingClientRect());
      const from = rows.indexOf(row);
      // how far a neighbor moves to make room: one row's height plus the space between rows
      const step = rows.length > 1 ? (from < rows.length - 1 ? rects[from + 1].top - rects[from].top : rects[from].top - rects[from - 1].top) : 0;
      const startY = e.clientY;
      let to = from;
      grip.setPointerCapture(e.pointerId);
      row.classList.add("dragging");
      const move = (ev) => {
        const dy = ev.clientY - startY;
        row.style.transform = `translateY(${dy}px)`;
        const mid = rects[from].top + rects[from].height / 2 + dy;
        to = from;
        rects.forEach((r, i) => {
          const center = r.top + r.height / 2;
          if (i < from && mid < center) to = Math.min(to, i);
          if (i > from && mid > center) to = Math.max(to, i);
        });
        rows.forEach((r, i) => {
          if (r === row) return;
          const shift = from < to && i > from && i <= to ? -step : to < from && i >= to && i < from ? step : 0;
          r.style.transform = shift ? `translateY(${shift}px)` : "";
        });
      };
      const end = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", end);
        grip.removeEventListener("pointercancel", end);
        rows.forEach((r) => { r.style.transform = ""; });
        row.classList.remove("dragging");
        if (to !== from) {
          const codes = rows.map((r) => r.dataset.lang);
          codes.splice(to, 0, codes.splice(from, 1)[0]);
          store.set(langOrderKey, codes);
          renderLanguages();
        }
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", end);
      grip.addEventListener("pointercancel", end);
    };
  }
}
function moveLanguage(code, delta) {
  const codes = languageGroups().mine.map((l) => l.code);
  const i = codes.indexOf(code), j = i + delta;
  if (i < 0 || j < 0 || j >= codes.length) return;
  [codes[i], codes[j]] = [codes[j], codes[i]];
  store.set(langOrderKey, codes);
}
// how far you've got in a language: cards learned out of the cards you practice (two per phrase not left out).
// Progress is kept per language, also after its download is removed.
function learnedFor(code) {
  const mine = code === state.lang.code;
  const progress = mine ? state.progress : store.get(progressKey(code), {});
  const skipped = mine ? state.skipped : new Set(store.get(skipKey(code), []));
  const active = new Set(state.shared.map((p) => p.id).filter((id) => !skipped.has(id)));
  const known = Object.entries(progress).filter(([k, v]) => v.box >= 3 && active.has(k.split(":")[0])).length;
  return { known, all: active.size * 2 };
}
function progressLine(code) {
  const { known, all } = learnedFor(code);
  const p = all ? Math.round((known / all) * 100) : 0;
  return `<div class="lprog"><span class="bar"><span style="width:${p}%"></span></span><span>${t("{known} of {all} cards learned", { known, all })}</span>${badgeStrip(code)}</div>`;
}
function languageRow(l, position, count) {
  const ps = packState(l.code);
  const active = l.code === state.lang.code;
  const mb = `${(l.bytes / 1e6).toFixed(1)} MB`;
  const yours = l.code === state.known.code ? " · " + t("Your language") : ""; // downloaded for prompts and Play all
  const status = state.busy[l.code] || (active ? t("In use") : ps === "installed" ? t("Downloaded") + yours : ps === "partial" ? t("Partly downloaded") + yours : t("Not downloaded"));
  const name = esc(langName(l));
  const buttons = state.busy[l.code] || active ? ""
    : ps === "installed" ? `<button class="mini" data-act="use">${t("Use")}</button><button class="mini ghost" data-act="remove" aria-label="${t("Remove {name} from this device", { name })}" title="${t("Remove from this device")}"><svg class="trash" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg></button>`
    : `<button class="mini" data-act="download">${canCache ? t("Download") : t("Use")}</button>`;
  // a drag handle only for languages on the device, where the order matters (and only once there are two)
  const arrows = position < 0 || count < 2 ? "" : `
        <button class="grip" data-act="grip" aria-label="${t("Move {name}: drag it, or use the arrow keys", { name })}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
        </button>`;
  const line = state.busy[l.code] ? dlStatus(l.code) : `<span class="lstate">${esc(status)}</span> · ${mb}${l.draft ? " · " + t("Draft translations") : ""}`;
  return `
      <div class="lang${active ? " current" : state.busy[l.code] ? "" : " tap"}" data-lang="${l.code}"${position >= 0 ? ` data-pos="${position}"` : ""}>${arrows}
        <div class="linfo"><div class="lname">${active ? "✓ " : ""}${name} <span class="note" lang="${l.code}">${esc(l.native)}</span></div>
          <div class="note">${line}</div></div>
        <div class="lbtn">${buttons}</div>
        ${state.busy[l.code] ? "" : position >= 0 || learnedFor(l.code).known || badgeStrip(l.code) ? progressLine(l.code) : ""}
      </div>`;
}
// The languages: those on this device always in view, and below them a clear "Add a language" button that opens the
// ones to download. That list starts open for someone with only one language (adding another is the likely next step),
// and is remembered once opened or closed.
function languagePanel() {
  const { mine, available } = languageGroups();
  const addOpen = store.get("phrasebook-add-open", mine.length <= 1);
  return `
    ${sectionTitle("Learning")}
    <div id="langs">
      <h3 class="sub">${t("On this device ({n})", { n: mine.length })}</h3>
      ${mine.map((l, i) => languageRow(l, i, mine.length)).join("")}
      ${available.length ? `
      <button class="addlang" id="addlang" aria-expanded="${addOpen}" aria-controls="availlist">
        <span class="plus" aria-hidden="true">＋</span><span class="atext">${t("Add a language")}<span class="acount">${t("{n} available", { n: available.length })}</span></span><span class="chev" aria-hidden="true"></span>
      </button>
      <div id="availlist"${addOpen ? "" : " hidden"}>
        <h3 class="sub">${t("Available to download ({n})", { n: available.length })}</h3>
        ${available.map((l) => languageRow(l, -1, 0)).join("")}
      </div>` : ""}
      <p class="note">${t("Tap a language to switch to it, or to download it if it isn't on this device yet.")} ${t("A language is stored on this device only once you download it. Removing one frees its space and keeps your progress. Drag ⠿ to put your languages in the order you want.")}</p>
    </div>`;
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
// ---------- More: a menu of the app's other pages and actions ----------
// Everything here works offline: the pages are drawn from the app itself, What's new comes from changes.json
// (stored with the app), and Share and Send feedback hand over to the phone's own share sheet and mail app.
const MENU_ICONS = {
  languages: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  changes: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z"/>',
  install: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7v7M9 11.5l3 3 3-3"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  feedback: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="1.1" class="dot"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.5"/><circle cx="12" cy="17" r="1.1" class="dot"/>',
  badges: '<circle cx="12" cy="9" r="6"/><path d="M8.5 13.8L7 21.5l5-2.8 5 2.8-1.5-7.7"/>',
};
const menuRow = (id, label, sub, chevron = true) => `
    <button class="menurow" id="${id}">
      <span class="mi" aria-hidden="true"><svg viewBox="0 0 24 24">${MENU_ICONS[id]}</svg></span>
      <span class="mt"><span class="ml">${label}</span>${sub ? `<span class="ms">${sub}</span>` : ""}</span>
      ${chevron ? `<span class="mc" aria-hidden="true">›</span>` : ""}
    </button>`;
const versionLabel = () => (state.version ? t("version {v}", { v: versionName(versionNumber(state.version)) }) : "");
function renderMore() {
  const { installed } = installInfo();
  main.innerHTML = `
    <h2 class="group">${t("More")}</h2>
    <div class="menu">
      ${menuRow("languages", t("Languages"), t("Learning {name} · you speak {known}", { name: esc(langName(state.lang)), known: esc(state.known.native) }))}
      ${menuRow("badges", t("Badges"), t("{n} earned", { n: Object.keys(earnedBadges()).length }))}
      ${menuRow("settings", t("Settings"), t("Audio, quiz, and Play all"))}
      ${menuRow("help", t("Help"), t("How to use PhraseBook"))}
      ${menuRow("changes", t("What's new"), versionLabel())}
      ${installed ? "" : menuRow("install", t("Install on this device"), t("Add PhraseBook to your Home Screen"))}
    </div>
    <div class="menu">
      ${menuRow("share", t("Share this app"), t("Send PhraseBook to a friend"), false)}
      ${menuRow("feedback", t("Send feedback"), t("Tell us what to fix or add"), false)}
      ${menuRow("about", t("About"), t("Version, offline use, and privacy"))}
    </div>`;
  for (const page of ["languages", "badges", "settings", "help", "changes", "install", "about"]) {
    const b = document.getElementById(page);
    if (b) b.onclick = () => { track("more/" + page); goTo(page); };
  }
  $("#share").onclick = shareApp;
  $("#feedback").onclick = sendFeedback;
  hint(""); // progress and practice hints belong to the practice pages
}
// Help: how to use the app, in the language you speak. English is stored with the app; the others come in the pack of
// the language you speak (lang/<code>/for-<code>/help.html, beside its interface text), so it works offline. Each
// <h2 data-icon> becomes a section card with that icon.
async function renderHelp() {
  const code = state.known.code;
  let html = null;
  for (const path of code === "en" ? ["help.html"] : [`lang/${code}/for-${code}/help.html`, "help.html"]) {
    try { const res = await fetch(path); if (res.ok) { html = await res.text(); break; } } catch { /* offline and not stored: try the next */ }
  }
  if (state.mode !== "help") return;
  main.innerHTML = backToMore() + (html ?? `<p class="note">${t("Help isn't available offline yet. Open it once while online.")}</p>`);
  const icon = {
    start: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    list: document.querySelector('.tab[data-mode="list"] svg')?.innerHTML,
    cards: document.querySelector('.tab[data-mode="cards"] svg')?.innerHTML,
    quiz: document.querySelector('.tab[data-mode="quiz"] svg')?.innerHTML,
    guide: document.querySelector('.tab[data-mode="guide"] svg')?.innerHTML,
    search: document.querySelector(".searchbtn svg")?.innerHTML,
    playall: SECTION_ICONS["Play all"],
    circle: SECTION_ICONS["Left out of practice"],
    languages: MENU_ICONS.languages,
    offline: MENU_ICONS.install,
    privacy: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  };
  main.querySelectorAll(":scope > h2[data-icon]").forEach((h) => {
    h.className = "group sh";
    h.insertAdjacentHTML("afterbegin", `<span class="si" aria-hidden="true"><svg viewBox="0 0 24 24">${icon[h.dataset.icon] || ""}</svg></span>`);
  });
  sectionize(main);
  main.classList.add("help");
  wireBack();
  hint("");
}
function renderAbout() {
  main.innerHTML = `
    ${backToMore()}
    <div class="aboutcard">
      <img src="icon-v3-180.png" alt="" width="72" height="72">
      <h2>PhraseBook</h2>
      <p class="note">${versionLabel()}</p>
    </div>
    <section class="sect why">
      <p>${t("PhraseBook was born out of a love of travel and of connecting with people. Learn nearly 100 basic phrases to engage with locals and handle your travel needs, then see the positive response to your efforts!")}</p>
      <p>${t("It's ad-free, owl-free, and streak-free, so you can learn at your own pace and talk with people all over the globe.")}</p>
      <p class="shareline">${t("If PhraseBook helps you, share it with your friends and fellow travelers.")}</p>
      <button class="act" id="share"><span class="ml">${t("Share this app")}</span></button>
      <p class="shareline">${t("If you want to make it better, send me a note and volunteer to help with translations, guides, or maintaining the open-source code.")}</p>
      <button class="act" id="volunteer">${t("Send feedback")}</button>
    </section>
    <p>${t("PhraseBook is free. Once a language is downloaded, everything works without a connection: the phrases, the audio, the cards, the quiz, and the guide.")}</p>
    <p class="note">${t("Your progress and settings stay on this device.")}${analyticsOn ? " " + t("The app counts anonymous visits and which features are used, with no cookies and no personal data.") : ""}</p>`;
  wireBack();
  $("#share").onclick = shareApp;
  $("#volunteer").onclick = sendFeedback;
  hint("");
}
function renderInstall() {
  const { installed, steps } = installInfo();
  main.innerHTML = `
    ${backToMore()}
    <h2 class="group">${t("Install on this device")}</h2>
    ${installed
      ? `<p class="note">${t("PhraseBook is installed on this device, and keeps itself up to date.")}</p>`
      : `<ol class="steps">${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
    <p class="note">${t("Once installed it updates itself, so there is no need to remove it and add it again.")}</p>`}`;
  wireBack();
  hint("");
}
// Share: a QR code to scan from this phone, for someone right there (it ships with the app, so it works offline), and
// Send the link for the phone's own share sheet, or a copy of the link where there is none. qr.svg holds the app's
// address, written out under it for anyone who can't scan.
const APP_ADDRESS = "pcoberly.github.io/phrasebook";
function shareApp() {
  track("share/click");
  document.querySelector("dialog.share")?.remove();
  const d = document.createElement("dialog");
  d.className = "ready share";
  d.setAttribute("aria-labelledby", "sharetitle");
  d.innerHTML = `
    <h2 id="sharetitle">${t("Share PhraseBook")}</h2>
    <p class="note">${t("Someone with you can scan this with their phone's camera.")}</p>
    <img class="qr" src="qr.svg" alt="${t("QR code for PhraseBook's address")}" width="220" height="220">
    <p class="qrurl">${APP_ADDRESS}</p>
    <button class="act good" data-send>${t("Send the link")}</button>
    <button class="later" data-close>${t("Close")}</button>`;
  document.body.appendChild(d);
  const close = () => { d.close(); d.remove(); };
  d.querySelector("[data-send]").onclick = () => sendLink(d.querySelector("[data-send]"));
  d.querySelector("[data-close]").onclick = close;
  d.addEventListener("click", (e) => { if (e.target === d) close(); }); // a tap on the dimmed page around it
  d.addEventListener("cancel", (e) => { e.preventDefault(); close(); }); // Escape
  d.showModal();
}
async function sendLink(button) {
  track("share/send");
  const url = new URL("./", location.href).href;
  const data = { title: "PhraseBook", text: t("A free phrase book for travel: flashcards, quizzes, and audio, and it works offline."), url };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(url);
    button.textContent = t("Link copied ✓");
    setTimeout(() => { if (button.isConnected) button.textContent = t("Send the link"); }, 2500);
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
  const body = `Hi! My feedback about PhraseBook:\n\n\n\n(To report a wrong or missing phrase, tell me the language and the phrase.)\n---\nLanguage: ${state.lang.name}\nVersion: ${state.version ? versionName(versionNumber(state.version)) + " (" + state.version + ")" : "unknown"}`;
  const q = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return {
    to,
    mailto: `mailto:${to}?${q({ subject, body })}`,
    gmail: `https://mail.google.com/mail/?${q({ view: "cm", fs: "1", to, su: subject, body })}`,
    yahoo: `https://compose.mail.yahoo.com/?${q({ to, subject, body })}`,
  };
}
function openMailApp(url) { location.href = url; }
// Send feedback: a pop-up like Share's, with the address and the ways to write (Gmail, Yahoo Mail, the phone's own
// email app, or copy the address)
function sendFeedback() {
  track("feedback/click");
  document.querySelector("dialog.feedback")?.remove();
  const f = feedbackParts();
  const d = document.createElement("dialog");
  d.className = "ready feedback";
  d.setAttribute("aria-labelledby", "fbtitle");
  d.innerHTML = `
    <h2 id="fbtitle">${t("Send feedback")}</h2>
    <p class="note">${t("Tell us what to fix or add, or offer to help.")} ${t("Send your feedback to")} <b>${esc(f.to)}</b></p>
    <div class="fbrow">
      <button class="act" data-fb="gmail">Gmail</button>
      <button class="act" data-fb="yahoo">Yahoo Mail</button>
      <button class="act" data-fb="mail">${t("Email app")}</button>
      <button class="act" data-fb="copy">${t("Copy address")}</button>
    </div>
    <button class="later" data-close>${t("Close")}</button>`;
  document.body.appendChild(d);
  const close = () => { d.close(); d.remove(); };
  d.onclick = async (e) => {
    if (e.target === d) { close(); return; } // a tap on the dimmed page around it
    if (e.target.closest("[data-close]")) { close(); return; }
    const btn = e.target.closest("button[data-fb]");
    if (!btn) return;
    if (btn.dataset.fb === "mail") openMailApp(f.mailto);
    else if (btn.dataset.fb === "copy") {
      try { await navigator.clipboard.writeText(f.to); btn.textContent = t("Copied ✓"); }
      catch { prompt(t("Copy this address:"), f.to); }
    } else window.open(f[btn.dataset.fb], "_blank", "noopener");
  };
  d.addEventListener("cancel", (e) => { e.preventDefault(); close(); }); // Escape
  d.showModal();
}

// Settings sections: each a card whose title has an icon, so the page reads as a few clear groups
const SECTION_ICONS = {
  "Your language": '<path d="M4 5h16v10H9l-5 4z"/>',
  "Learning": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  "Audio": '<path d="M4 9.5h4L13 5v14l-5-4.5H4z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
  "Quiz": '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.5"/><circle cx="12" cy="17" r="1.1" class="dot"/>',
  "Left out of practice": '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  "Play all": '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z" class="dot"/>',
};
const sectionTitle = (key) => `<h2 class="group sh"><span class="si" aria-hidden="true"><svg viewBox="0 0 24 24">${SECTION_ICONS[key]}</svg></span>${t(key)}</h2>`;
// wrap each title and what follows it, up to the next title, in a <section class="sect">
function sectionize(root) {
  for (const h of [...root.querySelectorAll(":scope > h2.sh")]) {
    const sect = document.createElement("section");
    sect.className = "sect";
    h.before(sect);
    let el = h;
    while (el && !(el !== h && el.matches?.("h2.sh"))) { const next = el.nextElementSibling; sect.appendChild(el); el = next; }
  }
}
// ---------- Languages: the language you speak and the ones you learn, a page of its own in More ----------
function renderLanguages() {
  main.innerHTML = `
    ${sectionTitle("Your language")}
    <div class="setting">
      <label for="known">${t("I speak")}</label>
      <select id="known">${knownSelect()}</select>
    </div>
    <p class="note">${t("Prompts, answers, notes, the guide, and Play all use the language you speak. Anything not yet written for it shows in English.")}${state.base === state.lang.code ? " " + t("While you learn {name}, English is used.", { name: esc(langName(state.lang)) }) : ""}</p>
    ${languagePanel()}
`;
  sectionize(main);
  main.insertAdjacentHTML("afterbegin", backToMore());
  wireBack();
  $("#known").onchange = async () => { await setKnown($("#known").value); if (state.mode === "languages") renderLanguages(); };
  wireReorder();
  if ($("#addlang")) $("#addlang").onclick = () => {
    const open = $("#availlist").hidden;
    $("#availlist").hidden = !open;
    $("#addlang").setAttribute("aria-expanded", open);
    store.set("phrasebook-add-open", open);
  };
  $("#langs").onclick = async (e) => {
    const row = e.target.closest("[data-lang]");
    if (!row || e.target.closest(".grip")) return;
    const code = row.dataset.lang;
    const lang = state.languages.find((l) => l.code === code);
    // a tap anywhere on the row uses the language, or downloads it first; the buttons do the same, plus remove
    let act = e.target.closest("button[data-act]")?.dataset.act;
    if (!act) {
      if (state.busy[code] || code === state.lang.code) return;
      act = packState(code) === "installed" || !canCache ? "use" : "download";
    }
    const btn = { dataset: { act } };
    if (btn.dataset.act === "remove") {
      if (confirm(t("Remove {name} from this device? Your progress is kept.", { name: langName(lang) }))) { await removePack(code); renderLanguages(); }
      return;
    }
    // switch to a language on the device
    const switchTo = async () => {
      await useLanguage(code);
      if (canCache) syncKnownPack().catch(() => {});
      track("language/" + code);
      if (state.mode !== "languages" && state.mode !== "quiz") render();
    };
    try {
      if (btn.dataset.act === "download" && canCache) {
        // Download only downloads; the pop-up then offers to start it now, or it waits in the list with a Use button
        state.busy[code] = t("Starting…");
        const p = progress(code);
        renderLanguages();
        await syncPack(code, p);
        track("download/" + code);
        delete state.busy[code];
        delete state.dl[code];
        readyDialog(lang, true, switchTo);
      } else {
        await switchTo();
        readyDialog(lang, false);
      }
    } catch {
      delete state.dl[code];
      state.busy[code] = t("Couldn't download. Check you're online and try again.");
      setTimeout(() => { delete state.busy[code]; if (state.mode === "languages") renderLanguages(); }, 5000);
    }
    if (state.mode === "languages") renderLanguages();
  };
  hint("");
}
function renderSettings() {
  const skippedCount = state.phrases.filter(isSkipped).length;
  const opt = (v, label, cur) => `<option value="${v}"${v === cur ? " selected" : ""}>${label}</option>`;
  main.innerHTML = `
    ${sectionTitle("Audio")}
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
    ${sectionTitle("Quiz")}
    <div class="setting">
      <label for="round">${t("Questions per round")}</label>
      <select id="round">
        ${ROUND_CHOICES.map((n) => opt(n, n, state.settings.round)).join("")}
      </select>
    </div>
    ${sectionTitle("Left out of practice")}
    <div class="setting">
      <span>${skippedCount ? t(skippedCount === 1 ? "{n} phrase left out in {name}" : "{n} phrases left out in {name}", { n: skippedCount, name: esc(langName(state.lang)) }) : t("None. Tap a phrase's ✓ circle (in the List, on a card or in the quiz) to leave it out.")}</span>
      ${skippedCount ? `<button class="act" id="unskip" style="flex:none">${t("Practice all")}</button>` : ""}
    </div>
    ${sectionTitle("Play all")}
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
`;
  sectionize(main);
  main.insertAdjacentHTML("afterbegin", backToMore());
  wireBack();
  if ($("#unskip")) $("#unskip").onclick = () => { state.skipped.clear(); store.set(skipKey(state.lang.code), []); state.last = null; renderSettings(); };
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
  hint(t("Settings are saved on this device"));
}

// ---------- boot ----------
// the splash in index.html covers the page until the first screen is drawn, then fades away. It stays at least
// SPLASH_MS from the start, so a quick open is a calm fade rather than a flash.
const SPLASH_MS = 750;
function hideSplash() {
  const s = $("#splash");
  if (!s) return;
  setTimeout(() => {
    s.classList.add("gone");
    setTimeout(() => s.remove(), 450);
  }, Math.max(0, SPLASH_MS - performance.now()));
}
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
    hideSplash();
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
  $("#searchbtn").onclick = openSearch;
  $("#qclose").onclick = () => closeSearch();
  $("#q").oninput = () => {
    state.query = $("#q").value.trim();
    if (playAll) stopPlayAll(); // the list it was playing has changed
    renderList();
    scrollTo(0, 0);
  };
  $("#q").onkeydown = (e) => {
    if (e.key === "Escape") closeSearch();
    if (e.key === "Enter") $("#q").blur(); // put the keyboard away to see the results
  };
  document.querySelectorAll(".tab").forEach((b) => b.onclick = () => {
    if (b.dataset.mode !== "list") pausePlayAll(); // Play all belongs to the List; it keeps its place for when you return
    track("tab/" + b.dataset.mode);
    goTo(b.dataset.mode);
  });
  const resume = store.get("phrasebook-resume", null);
  store.remove("phrasebook-resume");
  if (resume && Date.now() - resume.at < 60000 && !state.firstRun && resume.mode !== "list") goTo(resume.mode);
  else render();
  hideSplash();
  updatedNotice();
  if (!state.firstRun) firstBadges();
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
