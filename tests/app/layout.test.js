// Layout: nothing wider than the screen on a phone or an iPad, and the controls along the top not cut off.
const { test } = require("node:test");
const assert = require("node:assert");
const { setup, open, tab, more } = require("./helpers");
setup();
const SIZES = { "small phone": { width: 360, height: 740 }, iPhone: { width: 390, height: 844 }, iPad: { width: 820, height: 1180 } };

for (const [name, viewport] of Object.entries(SIZES)) {
  test(`${name}: no page scrolls sideways`, async () => {
    const page = await open({ viewport });
    for (const go of [() => tab(page, "list"), () => tab(page, "cards"), () => tab(page, "quiz"), () => more(page, "languages"), () => more(page, "badges"), () => more(page, "settings")]) {
      await go();
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(over <= 0, `${name}, ${await page.evaluate(() => state.mode)}: ${over}px too wide`);
    }
  });
}

test("iPad: the direction menu shows its whole choice", async () => {
  const page = await open({ viewport: SIZES.iPad, storage: { base: "de" } });
  await tab(page, "cards");
  const cut = await page.evaluate(() => { const d = document.querySelector("#dir"); return d.scrollWidth > d.clientWidth + 1; });
  assert.ok(!cut);
});

test("iPhone: Listening only and Sound stay on one line each", async () => {
  const page = await open({ viewport: SIZES.iPhone, storage: { base: "de" } });
  await tab(page, "cards");
  for (const sel of ["label.check", "#mute"]) {
    const lines = await page.locator(sel).evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight || 20)));
    const h = await page.locator(sel).evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(h < 44, `${sel} is ${h}px tall: it wraps`);
  }
});
