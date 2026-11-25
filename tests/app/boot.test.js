// The app opens, every tab and More page draws without an error, and an update is announced once.
const { test } = require("node:test");
const assert = require("node:assert");
const { setup, open, tab, more } = require("./helpers");
setup();

test("opens on the List with no errors", async () => {
  const page = await open();
  assert.ok(await page.locator(".entry").count() > 50);
  assert.deepStrictEqual(page.errors, []);
});

test("every tab and More page draws without an error", async () => {
  const page = await open();
  for (const mode of ["cards", "quiz", "guide", "list"]) {
    await tab(page, mode);
    await page.waitForFunction(() => !document.querySelector("#main").textContent.includes("Loading…"));
  }
  for (const id of ["languages", "badges", "settings", "help", "changes", "about"]) {
    await more(page, id);
    await page.locator("#back, .backbtn").first().waitFor();
  }
  assert.deepStrictEqual(page.errors, []);
});

test("after an update, a note says so once, with a link to What's new", async () => {
  const page = await open({ seenVersion: false, storage: { "seen-version": "phrasebook-v1" } });
  await page.locator(".updated:not(.badgeup)").waitFor();
  await page.locator(".updated .ulink").click();
  await page.locator(".change .ver").first().waitFor();
  assert.strictEqual(await page.evaluate(() => state.mode), "changes");
  await page.reload();
  await page.waitForTimeout(300);
  assert.strictEqual(await page.locator(".updated:not(.badgeup)").count(), 0);
});

test("active devices: counted once a day, and once in any 7 and any 30 days, keeping only the date", async () => {
  const page = await open();
  const kept = await page.evaluate(() => ["day", "week", "month"].map((p) => JSON.parse(localStorage.getItem("phrasebook-active-" + p))));
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  assert.deepStrictEqual(kept, [today, today, today], "a first open counts all three, by the device's own date");
});
