// Languages: switching, the language you speak, English to learn, and progress kept per language.
const { test } = require("node:test");
const assert = require("node:assert");
const { setup, open, more, stored, learned } = require("./helpers");
setup();

test("choosing German as the language you speak puts the app in German", async () => {
  const page = await open();
  await more(page, "languages");
  await page.locator("#known").selectOption("de");
  await page.waitForFunction(() => document.querySelector('.tab[data-mode="more"] .tl').textContent === "Mehr");
  assert.strictEqual(await stored(page, "base"), "de");
  await page.locator(".tab[data-mode='list']").click();
  assert.match(await page.locator(".entry[data-entry='thank-you'] .en").innerText(), /Danke/);
});

test("switching language keeps each one's progress", async () => {
  const page = await open({ storage: { "progress-ja": learned(["hello"]), "progress-fr": learned(["please", "thank-you"]) } });
  await more(page, "languages");
  await page.locator("[data-lang='fr']").click();
  await page.locator("dialog.ready [data-go]").click({ timeout: 20000 }); // after French has downloaded
  await page.waitForFunction(() => state.lang.code === "fr");
  assert.strictEqual(await page.evaluate(() => learnedFor("fr").known), 4);
  assert.strictEqual(await page.evaluate(() => learnedFor("ja").known), 2);
});

test("English to learn isn't offered to English speakers, and English can't be spoken while learning it", async () => {
  const page = await open();
  await more(page, "languages");
  assert.strictEqual(await page.locator("[data-lang='en-us']").count(), 0);
  const page2 = await open({ lang: "en-us", storage: { base: "fr" } });
  await more(page2, "languages");
  assert.ok(await page2.locator("#known option[value='en']").isDisabled());
});

test("right-to-left languages are written right to left", async () => {
  const page = await open({ lang: "ar" });
  assert.strictEqual(await page.locator(".entry .vi").first().getAttribute("dir"), "rtl");
});
