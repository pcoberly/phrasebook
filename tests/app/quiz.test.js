// Quiz: a round, its score, and carrying on after the app is closed mid-round.
const { test } = require("node:test");
const assert = require("node:assert");
const { setup, open, answer, stored } = require("./helpers");
setup();

test("a round of 10 ends with the score and the ones to review", async () => {
  const page = await open({ storage: { round: "10" } });
  await page.locator(".tab[data-mode='quiz']").click();
  for (let i = 0; i < 10; i++) await answer(page, i !== 3);
  await page.locator(".summary").waitFor();
  assert.match(await page.locator(".summary .big").innerText(), /9 of 10/);
  assert.match(await page.locator("main").textContent(), /To review \(1\)/);
  assert.deepStrictEqual(page.errors, []);
});

test("a round carries on where it was after a reload", async () => {
  const page = await open({ storage: { round: "10" } });
  await page.locator(".tab[data-mode='quiz']").click();
  for (let i = 0; i < 4; i++) await answer(page);
  await page.reload();
  await page.locator(".tab[data-mode='quiz']").click();
  assert.match(await page.locator(".roundbar").innerText(), /Question 5 of 10/);
  assert.match(await page.locator("#score").innerText(), /4 correct/);
});

test("New round starts again from question 1", async () => {
  const page = await open({ storage: { round: "10" } });
  await page.locator(".tab[data-mode='quiz']").click();
  for (let i = 0; i < 10; i++) await answer(page);
  await page.locator("#newround").click();
  assert.match(await page.locator(".roundbar").innerText(), /Question 1 of 10/);
  assert.strictEqual((await stored(page, "quiz-ja")).index, 0);
});
