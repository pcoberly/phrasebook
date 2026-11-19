// Cards: turning over, grading, and a card becoming learned.
const { test } = require("node:test");
const assert = require("node:assert");
const { setup, open, stored } = require("./helpers");
setup();

test("a card turns over to show the answer and the grade buttons", async () => {
  const page = await open();
  await page.locator(".tab[data-mode='cards']").click();
  assert.ok(await page.locator("#grades.hidden").count());
  await page.locator("#flip").click({ position: { x: 12, y: 12 } }); // a corner, clear of 🔊
  await page.locator("#grades:not(.hidden)").waitFor();
  assert.deepStrictEqual(page.errors, []);
});

test("known three times in a row, a card is learned, with a bigger cheer", async () => {
  const later = Date.now() + 86400000;
  const page = await open({ storage: { topics: ["emergency"], dir: "to", "progress-ja": {
    "help:to": { box: 2, due: 0 }, "need-doctor:to": { box: 1, due: later }, "pharmacy:to": { box: 1, due: later } } } });
  await page.locator(".tab[data-mode='cards']").click();
  assert.strictEqual(await page.evaluate(() => state.last), "help:to"); // the only card due
  await page.locator("#flip").click({ position: { x: 12, y: 12 } }); // a corner, clear of 🔊
  await page.locator("#got").click();
  await page.locator(".cheer.big").waitFor();
  assert.strictEqual((await stored(page, "progress-ja"))["help:to"].box, 3);
  assert.strictEqual(await page.evaluate(() => learnedFor("ja").known), 1);
});

test("Didn't know it sends a card back to the start", async () => {
  const page = await open({ storage: { topics: ["emergency"], dir: "to", "progress-ja": { "help:to": { box: 4, due: 0 }, "need-doctor:to": { box: 4, due: 0 }, "pharmacy:to": { box: 4, due: 0 } } } });
  await page.locator(".tab[data-mode='cards']").click();
  await page.locator("#flip").click({ position: { x: 12, y: 12 } }); // a corner, clear of 🔊
  await page.locator("#again").click();
  const prog = await stored(page, "progress-ja");
  assert.ok(Object.values(prog).some((v) => v.box === 0));
});

test("a phrase left out never comes up as a card", async () => {
  const page = await open({ storage: { topics: ["emergency"], "skip-ja": ["help", "need-doctor"] } });
  await page.locator(".tab[data-mode='cards']").click();
  for (let i = 0; i < 4; i++) {
    assert.strictEqual(await page.evaluate(() => state.last.split(":")[0]), "pharmacy");
    await page.locator("#flip").click({ position: { x: 12, y: 12 } }); // a corner, clear of 🔊
    await page.locator("#again").click();
  }
});
