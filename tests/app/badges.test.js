// Badges: earned once, never twice, one note for badges already earned, and shown in More and on Languages.
const { test } = require("node:test");
const assert = require("node:assert");
const { setup, open, more, stored, phrases, learned, answer } = require("./helpers");
setup();
const ids = (cat) => phrases().filter((p) => p.cat === cat).map((p) => p.id);

test("someone with progress already gets one note for all their badges", async () => {
  const page = await open({ storage: { "progress-ja": learned([...ids("basics"), ...ids("numbers"), ...ids("emergency")]) } });
  await page.locator(".badgeup").waitFor();
  assert.match(await page.locator(".badgeup").innerText(), /already earned 6 badges/);
  const got = Object.keys(await stored(page, "badges")).sort();
  assert.deepStrictEqual(got, ["alphabet", "emergency:ja", "first-words", "numbers:ja", "polite:ja", "trip-ready:ja"]);
  assert.ok(!got.includes("tones"), "Japanese isn't tonal");
});

test("a badge is earned the moment it is reached, and only once", async () => {
  const later = Date.now() + 86400000;
  const page = await open({ storage: { badges: {}, topics: ["emergency"], dir: "to", "progress-ja": { "help:to": { box: 2, due: 0 }, "need-doctor:to": { box: 1, due: later }, "pharmacy:to": { box: 1, due: later } } } });
  await page.locator(".tab[data-mode='cards']").click();
  await page.locator("#flip").click({ position: { x: 12, y: 12 } });
  await page.locator("#got").click();
  await page.locator(".badgeup").waitFor();
  assert.match(await page.locator(".badgeup").innerText(), /First words/);
  const first = (await stored(page, "badges"))["first-words"];
  await page.evaluate(() => checkBadges());
  assert.strictEqual((await stored(page, "badges"))["first-words"], first);
});

test("a perfect quiz round earns First quiz and Perfect round; Good ear needs Listening only", async () => {
  const page = await open({ storage: { badges: {}, round: "10", dir: "from" } });
  await page.locator(".tab[data-mode='quiz']").click();
  for (let i = 0; i < 10; i++) await answer(page);
  await page.locator(".summary").waitFor();
  const got = await stored(page, "badges");
  assert.ok(got["first-quiz"] && got.perfect && !got["good-ear"]);
});

test("Good ear: a perfect round with Listening only on", async () => {
  const page = await open({ storage: { badges: {}, round: "10", dir: "from", listen: true } });
  await page.locator(".tab[data-mode='quiz']").click();
  for (let i = 0; i < 10; i++) await answer(page);
  await page.locator(".summary").waitFor();
  assert.ok((await stored(page, "badges"))["good-ear"]);
});

test("Badges page shows earned and still-to-come; Languages shows each language's", async () => {
  const page = await open({ storage: { badges: { "first-words": 1, "polite:ja": 1 } } });
  await more(page, "badges");
  assert.strictEqual(await page.locator(".badge.on").count(), 2);
  assert.ok(await page.locator(".badge:not(.on)").count() > 10);
  await more(page, "languages");
  assert.match(await page.locator(".lang.current .lbadges").innerText(), /🙏/);
  assert.deepStrictEqual(page.errors, []);
});
