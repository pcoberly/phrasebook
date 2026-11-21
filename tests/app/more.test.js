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
  await page.locator(".change").first().waitFor();
  const vs = (await page.locator(".change").evaluateAll((cs) => cs.map((c) => +c.dataset.v)));
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

test("Share shows a QR code that works offline, and Send the link", async () => {
  const page = await open();
  await page.locator(".tab[data-mode='more']").click();
  await page.locator("#share").click();
  await page.locator("dialog.share img.qr").waitFor();
  await page.waitForFunction(() => { const i = document.querySelector("dialog.share img.qr"); return i.complete && i.naturalWidth > 0; }); // the QR code loads
  assert.match(await page.locator("dialog.share .qrurl").innerText(), /pcoberly\.github\.io\/phrasebook/);
  await page.locator("dialog.share [data-close]").click();
  assert.strictEqual(await page.locator("dialog.share").count(), 0);
});

test("versions read as release.revision, and What's new folds each release, the newest open", async () => {
  const page = await open();
  assert.strictEqual(await page.evaluate(() => [versionName(1), versionName(33), versionName(34), versionName(60), versionName(61), versionName(103)].join(" ")),
    "0.5.0 0.5.32 0.6.0 0.6.26 0.7.0 0.7.42");
  await more(page, "changes");
  await page.locator("details.release").first().waitFor();
  const rel = await page.locator("details.release").evaluateAll((ds) => ds.map((d) => [d.querySelector("summary b").textContent, d.open]));
  assert.deepStrictEqual(rel, [["0.7", true], ["0.6", false], ["0.5", false]]);
  assert.match(await page.locator(".change .ver").first().innerText(), /version 0\.7\.\d+/);
});

test("About shows the coverage map, drawn for today's languages", async () => {
  const page = await open();
  await more(page, "about");
  await page.waitForFunction(() => { const i = document.querySelector(".mapcard img"); return i && i.complete && i.naturalWidth > 0; });
  assert.strictEqual(await page.locator(".aboutcard .note").count(), 0, "no version number on About");
});

test("Support PhraseBook: share, donate, and help make it better", async () => {
  const page = await open();
  await more(page, "support");
  await page.locator("#volunteer").waitFor();
  assert.strictEqual(await page.locator("#donate").getAttribute("href"), "https://ko-fi.com/phrasebook");
  assert.strictEqual(await page.locator("#donate").getAttribute("target"), "_blank");
  await page.locator("#share").click();
  await page.locator("dialog.share").waitFor();
  await page.locator("dialog.share [data-close]").click();
  await page.locator("#volunteer").click();
  await page.locator("dialog.feedback").waitFor();
  await page.locator("dialog.feedback [data-close]").click();
  await more(page, "about");
  await page.locator("#tosupport").click();
  assert.strictEqual(await page.evaluate(() => state.mode), "support");
  assert.deepStrictEqual(page.errors, []);
});
