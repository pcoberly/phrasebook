// Offline: once a language is downloaded, the app opens and works with no connection.
const { test } = require("node:test");
const assert = require("node:assert");
const { setup, open, ready } = require("./helpers");
setup();

test("after choosing a language, the app opens and works offline", async () => {
  const page = await open({ lang: null, wait: false, serviceWorkers: "allow" });
  await page.locator("#welcomelangs [data-lang='ko']").click();
  await page.locator(".entry").first().waitFor({ timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller); // the service worker now answers for the app
  await page.context().setOffline(true);
  await page.reload();
  await ready(page);
  assert.ok(await page.locator(".entry").count() > 50);
  await page.locator(".tab[data-mode='guide']").click();
  await page.locator("main h2").first().waitFor();
  assert.deepStrictEqual(page.errors, []);
});
