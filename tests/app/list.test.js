// The List: topics, search, and leaving a phrase out of practice.
const { test } = require("node:test");
const assert = require("node:assert");
const { setup, open, stored, phrases } = require("./helpers");
setup();

test("shows every phrase, grouped by topic", async () => {
  const page = await open();
  assert.strictEqual(await page.locator(".entry").count(), phrases().length);
  assert.ok(await page.locator("main h2.group").count() >= 7);
});

test("choosing a topic shows only its phrases, and is remembered", async () => {
  const page = await open();
  await page.locator("#cat").click();
  await page.locator("#topicmenu input[value='food']").check();
  await page.keyboard.press("Escape");
  const food = phrases().filter((p) => p.cat === "food").length;
  await page.waitForFunction((n) => document.querySelectorAll(".entry").length === n, food);
  assert.deepStrictEqual(await stored(page, "topics"), ["food"]);
});

test("search finds phrases in any topic, ignoring accents", async () => {
  const page = await open({ lang: "fr" });
  await page.locator("#searchbtn").click();
  await page.locator("#q").fill("cafe");
  await page.waitForFunction(() => document.querySelectorAll(".entry").length >= 1 && document.querySelectorAll(".entry").length < 5);
  assert.match(await page.locator(".entry").first().innerText(), /café/i);
  await page.locator("#q").fill("zzzz");
  await page.locator(".searchnote").waitFor();
});

test("leaving a phrase out fades it and is kept for that language", async () => {
  const page = await open();
  const row = page.locator(".entry[data-entry='beer']");
  await row.locator("button.practice").click();
  assert.match(await row.getAttribute("class"), /skipped/);
  assert.deepStrictEqual(await stored(page, "skip-ja"), ["beer"]);
  await page.reload();
  assert.match(await page.locator(".entry[data-entry='beer']").getAttribute("class"), /skipped/);
});
