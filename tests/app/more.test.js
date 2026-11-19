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

test("What's new marks this version", async () => {
  const page = await open();
  await more(page, "changes");
  assert.match(await page.locator(".change").first().innerText(), /This version/);
});

test("the Guide shows the language's pronunciation guide", async () => {
  const page = await open({ lang: "fi" });
  await page.locator(".tab[data-mode='guide']").click();
  await page.locator("main h2").first().waitFor();
  assert.match(await page.locator("main").innerText(), /Finnish/);
});
