// A brand-new person: the welcome page, in their browser's language, and their first language.
const { test } = require("node:test");
const assert = require("node:assert");
const { setup, open, ready } = require("./helpers");
setup();

test("a new person sees the welcome page and can choose a language", async () => {
  const page = await open({ lang: null, wait: false });
  await page.locator("#welcomelangs [data-lang='it']").click();
  await page.locator(".entry").first().waitFor({ timeout: 20000 }); // downloads Italian, then opens its List
  assert.match(await page.locator(".entry .vi").first().innerText(), /Ciao|Buongiorno|Salve/);
  assert.deepStrictEqual(page.errors, []);
});

test("the welcome page is in the browser's language when the app has it", async () => {
  const page = await open({ lang: null, wait: false, locale: "de-DE" });
  await page.locator(".welcome h1").waitFor();
  assert.strictEqual(await page.locator(".welcome h1").innerText(), "Willkommen bei PhraseBook");
  assert.strictEqual(await page.locator("#wknown").inputValue(), "de");
});

test("English speakers aren't offered English to learn; French speakers are", async () => {
  const page = await open({ lang: null, wait: false });
  await page.locator(".welcome").waitFor();
  assert.strictEqual(await page.locator("#welcomelangs [data-lang='en-us']").count(), 0);
  await page.locator("#wknown").selectOption("fr");
  await page.locator("#welcomelangs [data-lang='en-us']").waitFor();
});
