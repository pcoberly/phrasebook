// The More pages: Settings, Help, What's new, About, and the Guide.
const { test } = require("node:test");
const assert = require("node:assert");
const { setup, open, more, stored } = require("./helpers");
setup();

test("a setting changed is remembered", async () => {
  const page = await open();
  await more(page, "settings");
  await page.locator("#round").selectOption("10");
  assert.strictEqual(await stored(page, "round"), "10");
  await page.reload();
  await more(page, "settings");
  assert.strictEqual(await page.locator("#round").inputValue(), "10");
});

test("Help is drawn as section cards", async () => {
  const page = await open();
  await more(page, "help");
  await page.locator("main section.sect").first().waitFor();
  assert.ok(await page.locator("main section.sect").count() >= 8);
});

test("What's new lists the versions newest first, marking this one if it has an entry", async () => {
  const page = await open();
  await more(page, "changes");
  const vs = (await page.locator(".change .ver").allInnerTexts()).map((t) => +/v(\d+)/.exec(t)[1]);
  assert.deepStrictEqual(vs, [...vs].sort((a, b) => b - a));
  const current = await page.evaluate(() => +VERSION.replace("phrasebook-v", ""));
  const marked = await page.locator(".change", { hasText: "This version" }).count();
  assert.strictEqual(marked, vs[0] === current ? 1 : 0); // a version with nothing new to say has no entry
});

test("the Guide shows the language's pronunciation guide", async () => {
  const page = await open({ lang: "fi" });
  await page.locator(".tab[data-mode='guide']").click();
  await page.locator("main h2").first().waitFor();
  assert.match(await page.locator("main").innerText(), /Finnish/);
});
