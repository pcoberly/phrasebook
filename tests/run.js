// Runs the tests a change needs, or all of them.
//
//   node tests/run.js              the tests for what changed since the last commit (and anything not yet committed)
//   node tests/run.js --base REF   the tests for what changed since REF (GitHub passes the commit before the push)
//   node tests/run.js --all        every test (GitHub runs this every night, and when asked from the Actions tab)
//   node tests/run.js --list       say which would run, and why, without running them
//
// Each browser test file covers one part of the app (tests/app/<suite>.test.js). A change picks its suites by file,
// and in app.js by section: the "// ---------- name ----------" headings. A change to the shared code above the first
// heading, to the test helpers, or to anything this file doesn't know about runs everything, to be safe; files that
// can't affect the app (the backlog, the data scripts) run nothing. check_data.py and the service worker test run in
// GitHub on every push anyway, and are quick.
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ALL = fs.readdirSync(path.join(__dirname, "app")).filter((f) => f.endsWith(".test.js")).map((f) => f.replace(".test.js", ""));

// app.js: the suites for each section, by the start of its heading
const SECTIONS = {
  "the app's own words": ["translations", "boot"],
  "speech": ["playall", "cards"],
  "scheduling": ["cards", "quiz", "badges"],
  "badges": ["badges"],
  "the language you know": ["languages", "translations"],
  "ui helpers": ["list", "cards", "quiz"],
  "cards": ["cards", "badges"],
  "quiz": ["quiz", "badges"],
  "study list": ["list", "playall"],
  "search": ["list"],
  "play all": ["playall", "badges"],
  "guide": ["more"],
  "first run": ["welcome", "offline"],
  "language packs": ["languages", "offline", "welcome"],
  "staying up to date": ["boot", "offline"],
  "topics": ["list"],
  "settings": ["more"],
  "about": ["more"],
  "more": ["more", "badges"],
  "languages": ["languages", "badges"],
  "boot": ["boot", "welcome", "offline"],
};
// other files: the suites they need ("all" for everything; nothing for files that don't reach the app)
const FILES = [
  [/^style\.css$/, ["layout"]],
  [/^map\.svg$/, ["more"]],
  [/^index\.html$/, ["boot", "layout", "translations"]],
  [/^sw\.js$/, ["offline"]],
  [/^help\.html$|^changes\.json$/, ["more"]],
  [/^lang\/[^/]+\/for-[^/]+\/(ui\.json|help\.html)$/, ["translations"]],
  [/^languages\.json$|^phrases\.json$/, ["welcome", "languages", "list"]],
  [/^tests\/app\/([a-z]+)\.test\.js$/, (m) => [m[1]]],
  [/^tests\/run\.js$/, []],
  [/^tools\//, []], // the usage report and other scripts that don't ship with the app
  [/^(lang|audio)\//, []], // phrases, notes, guides and audio: check_data.py checks them
  [/\.(md|py)$|^\.github\/|^\.gitignore$|^tests\/sw-test\.js$|^(manifest\.webmanifest|favicon-\d+\.png|icon-v\d+-\d+\.png)$/, []],
];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" });

// the suites for the lines changed in app.js, from the diff's line numbers in the new file
function appSuites(base, why) {
  const diff = base ? git("diff", "-U0", base, "--", "app.js") : git("diff", "-U0", "HEAD", "--", "app.js");
  if (!diff) return [];
  const lines = fs.readFileSync(path.join(ROOT, "app.js"), "utf8").split("\n");
  const heads = []; // [line number, section name]
  lines.forEach((l, i) => { const m = /^\/\/ -{10} (.+?) -{10}$/.exec(l); if (m) heads.push([i + 1, m[1].toLowerCase()]); });
  const out = new Set();
  for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = +m[1], count = m[2] === undefined ? 1 : +m[2];
    for (let n = Math.max(start, 1); n <= start + Math.max(count, 1) - 1; n++) {
      if (/^const VERSION = /.test(lines[n - 1] || "")) { out.add("boot"); continue; } // the version, bumped with every release
      const head = [...heads].reverse().find(([at]) => at <= n);
      if (!head) { why.push(`app.js line ${n}: shared code above the first section`); return ALL; }
      const key = Object.keys(SECTIONS).find((k) => head[1].startsWith(k));
      if (!key) { why.push(`app.js: section "${head[1]}" isn't in tests/run.js`); return ALL; }
      if (!SECTIONS[key].every((s) => out.has(s))) why.push(`app.js, ${key}: ${SECTIONS[key].join(", ")}`);
      SECTIONS[key].forEach((s) => out.add(s));
    }
  }
  return [...out];
}

function pick() {
  const why = [];
  if (flag("--all")) return { suites: ALL, why: ["--all"] };
  const i = args.indexOf("--base");
  let base = i >= 0 ? args[i + 1] : "HEAD~1";
  try { git("cat-file", "-e", base + "^{commit}"); } catch { return { suites: ALL, why: [`can't find ${base}: everything`] }; }
  if (i < 0) { // locally: the last commit plus anything not yet committed
    const pending = git("status", "--porcelain").trim();
    if (pending) why.push("including changes not yet committed");
  }
  const files = new Set(git("diff", "--name-only", base).split("\n").filter(Boolean));
  if (i < 0) git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean).forEach((f) => files.add(f));
  const out = new Set();
  for (const f of files) {
    if (f.startsWith("tests/app/helpers")) { why.push(`${f}: everything`); return { suites: ALL, why }; }
    if (f === "app.js") { appSuites(base, why).forEach((s) => out.add(s)); continue; }
    const rule = FILES.find(([re]) => re.test(f));
    if (!rule) { why.push(`${f}: unknown, so everything`); return { suites: ALL, why }; }
    const suites = typeof rule[1] === "function" ? rule[1](rule[0].exec(f)) : rule[1];
    if (suites.length) why.push(`${f}: ${suites.join(", ")}`);
    suites.forEach((s) => out.add(s));
  }
  return { suites: ALL.filter((s) => out.has(s)), why };
}

const { suites, why } = pick();
console.log(why.length ? why.map((w) => "  " + w).join("\n") : "  nothing that reaches the app changed");
console.log(suites.length ? `Running ${suites.length} of ${ALL.length} suites: ${suites.join(", ")}` : "No browser tests needed.");
if (flag("--list") || !suites.length) process.exit(0);
const run = spawnSync(process.execPath, ["--test", "--test-reporter=spec", ...suites.map((s) => path.join(__dirname, "app", s + ".test.js"))], { stdio: "inherit", cwd: ROOT });
process.exit(run.status ?? 1);
