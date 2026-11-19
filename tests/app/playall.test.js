// Play all: plays the List in both languages, in order, and can be paused.
const { test } = require("node:test");
const assert = require("node:assert");
const { setup, open } = require("./helpers");
setup();

test("plays each phrase in English and then in the language, and pauses", async () => {
  const page = await open({ storage: { topics: ["emergency"] } });
  await page.locator("#playall").click();
  await page.waitForFunction(() => window.__played.length >= 6);
  await page.locator("#playall").click(); // pause
  const n = await page.evaluate(() => window.__played.length);
  await page.waitForTimeout(200);
  assert.strictEqual(await page.evaluate(() => window.__played.length), n, "nothing more plays once paused");
  assert.match(await page.locator("#playall").innerText(), /Play all/);
  assert.deepStrictEqual(page.errors, []);
});

test("goes round to the start again at the end of the list", async () => {
  const page = await open({ storage: { topics: ["emergency"] } });
  await page.locator("#playall").click();
  await page.waitForFunction(() => playAll && playAll.index === 0 && window.__played.length > 6);
  await page.locator("#playall").click();
});
