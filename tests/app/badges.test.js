// Badges: earned once, never twice, one note for badges already earned, and shown in More and on Languages.
const { test } = require("node:test");
const assert = require("node:assert");
const { setup, open, more, stored, phrases, learned, answer } = require("./helpers");
setup();
const ids = (cat) => phrases().filter((p) => p.cat === cat).map((p) => p.id);

test("someone with progress already gets one note for all their badges", async () => {
  const page = await open({ storage: { "progress-ja": learned([...ids("basics"), ...ids("numbers"), ...ids("emergency")]) } });
  await page.locator(".badgeup").waitFor();
  assert.match(await page.locator(".badgeup").innerText(), /already earned 7 badges/);
  const got = Object.keys(await stored(page, "badges")).sort();
  assert.deepStrictEqual(got, ["alphabet", "asia", "emergency:ja", "first-words:ja", "numbers:ja", "polite:ja", "trip-ready:ja"]);
  assert.ok(!got.includes("tones"), "Japanese isn't tonal");
});

test("a badge is earned the moment it is reached, and only once", async () => {
  const later = Date.now() + 86400000;
  const page = await open({ storage: { badges: {}, topics: ["emergency"], dir: "to", "progress-ja": { "help:to": { box: 2, due: 0 }, "need-doctor:to": { box: 1, due: later }, "pharmacy:to": { box: 1, due: later }, "leave-me-alone:to": { box: 1, due: later } } } });
  await page.locator(".tab[data-mode='cards']").click();
  await page.locator("#flip").click({ position: { x: 12, y: 12 } });
  await page.locator("#got").click();
  await page.locator(".badgeup").waitFor();
  assert.match(await page.locator(".badgeup").innerText(), /First words/);
  const first = (await stored(page, "badges"))["first-words:ja"];
  assert.ok(first);
  await page.evaluate(() => checkBadges());
  assert.strictEqual((await stored(page, "badges"))["first-words:ja"], first);
});

test("a perfect quiz round earns First quiz and Perfect round; Good ear needs Listening only", async () => {
  const page = await open({ storage: { badges: {}, round: "10", dir: "from" } });
  await page.locator(".tab[data-mode='quiz']").click();
  for (let i = 0; i < 10; i++) await answer(page);
  await page.locator(".summary").waitFor();
  const got = await stored(page, "badges");
  assert.ok(got["first-quiz:ja"] && got["perfect:ja"] && !got["good-ear:ja"]);
});

test("Good ear: a perfect round with Listening only on", async () => {
  const page = await open({ storage: { badges: {}, round: "10", dir: "from", listen: true } });
  await page.locator(".tab[data-mode='quiz']").click();
  for (let i = 0; i < 10; i++) await answer(page);
  await page.locator(".summary").waitFor();
  assert.ok((await stored(page, "badges"))["good-ear:ja"]);
});

test("Badges page: a collapsed section per language on the device; Languages shows each language's", async () => {
  const page = await open({ storage: { badges: { "first-quiz:ja": 1, "polite:ja": 1 }, "badges-reset": true, "pack-fr": { complete: true } } });
  await more(page, "badges");
  assert.deepStrictEqual(await page.locator("details.blang").evaluateAll((ds) => ds.map((d) => [d.dataset.code, d.open])), [["ja", false], ["fr", false]]);
  assert.match(await page.locator("details.blang[data-code=ja] summary").innerText(), /🎯🙏/);
  await page.locator("details.blang[data-code=ja] summary").click();
  assert.strictEqual(await page.locator("details.blang[data-code=ja] .badge.on").count(), 2);
  await page.waitForFunction(() => localStorage.getItem("phrasebook-badges-open")); // saved when the section opens
  assert.deepStrictEqual(await stored(page, "badges-open"), ["ja"]);
  await more(page, "languages");
  assert.match(await page.locator(".lang.current .lbadges").innerText(), /🙏/);
  assert.deepStrictEqual(page.errors, []);
});

test("language badges start afresh once: progress ones come back quietly, quiz ones go", async () => {
  const page = await open({ storage: {
    badges: { "perfect:ja": 1, "first-quiz:ja": 1, "polite:ja": 1, perfect: 1, "langs-2": 1 },
    "progress-ja": learned(["hello", "please", "thank-you", "excuse-me"]),
  } });
  const got = await stored(page, "badges");
  assert.ok(!got["perfect:ja"] && !got["first-quiz:ja"] && !got.perfect, "quiz badges are earned anew");
  assert.ok(got["polite:ja"] && got["first-words:ja"], "progress shows these, so they come back");
  assert.ok(got["langs-2"], "badges across languages stay");
  assert.strictEqual(await page.locator(".badgeup").count(), 0, "quietly");
  await page.reload();
  await page.evaluate(() => checkBadges({ also: ["perfect"] })); // earned after the reset: kept
  await page.reload();
  assert.ok((await stored(page, "badges"))["perfect:ja"], "only once");
});

test("region and family badges", async () => {
  const one = (ids) => learned(ids);
  const page = await open({ storage: { badges: {}, "badges-reset": true,
    "progress-es": one(["hello"]), "progress-it": one(["hello"]), "progress-sw": one(["hello"]), "progress-pt-br": one(["hello"]), "progress-pt-pt": one(["hello"]),
    "progress-ar": one(["hello"]), "progress-ary": one(["hello"]), "progress-ja": one(["hello"]) } });
  await page.evaluate(() => checkBadges({ quiet: true }));
  const got = await stored(page, "badges");
  for (const k of ["europe", "asia", "africa", "americas", "middle-east", "globetrotter", "romance"]) assert.ok(got[k], k);
  assert.ok(!got.semitic, "the two Arabics count as one language");
  assert.ok(!got.germanic && !got.slavic);
});
