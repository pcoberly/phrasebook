// The app in German, French and Spanish: its words translated, the help in that language, no {placeholders} showing.
const { test } = require("node:test");
const assert = require("node:assert");
const { setup, open, tab, more } = require("./helpers");
setup();
const WORDS = { de: ["Karten", "Mehr"], fr: ["Fiches", "Plus"], es: ["Tarjetas", "Más"] };

for (const [code, [cards, moreWord]] of Object.entries(WORDS)) {
  test(`${code}: tabs, pages and help are translated`, async () => {
    const page = await open({ storage: { base: code } });
    assert.strictEqual(await page.locator('.tab[data-mode="cards"] .tl').innerText(), cards);
    assert.strictEqual(await page.locator('.tab[data-mode="more"] .tl').innerText(), moreWord);
    for (const go of [() => tab(page, "cards"), () => tab(page, "quiz"), () => more(page, "badges"), () => more(page, "settings"), () => more(page, "languages"), () => more(page, "changes")]) {
      await go();
      await page.waitForTimeout(50);
      const text = await page.locator("body").innerText();
      assert.ok(!/\{[a-z]+\}/.test(text), `a {placeholder} shows on ${await page.evaluate(() => state.mode)}`);
    }
    await more(page, "help");
    await page.locator("main section.sect").first().waitFor();
    assert.strictEqual(await page.evaluate(() => document.documentElement.lang), code);
    assert.deepStrictEqual(page.errors, []);
  });
}
