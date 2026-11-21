"""PhraseBook's usage report, from GoatCounter: new users, active devices, app opens by language, downloads, and
which features are used. Writes one HTML page.

    python3 tools/usage_report.py [--out report.html] [--days 30]

It needs a GoatCounter API key with "Read statistics" in GOATCOUNTER_KEY (in a Claude cloud session the network
proxy adds the saved key itself, so the variable can be left unset). Nothing personal is read: GoatCounter only holds
counts of named events, such as "open/ja" or "welcome/shown", with no cookies or IDs (see the analytics note in
app.js).
"""
import argparse
import html
import string
import json
import os
import urllib.request
from collections import defaultdict
from datetime import date, timedelta

SITE = "https://phrasebook.goatcounter.com"
FIRST_DAY = date(2026, 10, 17)  # the first version
ACTIVE_FROM = date(2026, 11, 21)  # active/day, active/week, and active/month are counted from this day on


def fetch(start: date, end: date) -> list:
    """Every counted path between two days, each with its count per day."""
    key = os.environ.get("GOATCOUNTER_KEY", "proxy-injected")
    hits, after = [], None
    while True:
        url = f"{SITE}/api/v0/stats/hits?start={start}&end={end}&limit=100&daily=true"
        if after:
            url += "&exclude_paths=" + ",".join(str(h["path_id"]) for h in hits)
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as res:
            page = json.load(res)
        hits += page["hits"]
        if not page.get("more"):
            return hits
        after = True


def daily(hits: list) -> dict:
    """path -> {day: count}"""
    out = defaultdict(lambda: defaultdict(int))
    for h in hits:
        for s in h.get("stats", []):
            if s.get("daily"):
                out[h["path"]][s["day"]] += s["daily"]
    return out


def total(series: dict, paths, since: date, until: date) -> int:
    return sum(n for p in paths for d, n in series.get(p, {}).items() if since.isoformat() <= d <= until.isoformat())


def by_prefix(series: dict, prefix: str, since: date, until: date) -> list:
    """[(rest of the path, count)] for paths starting with prefix, biggest first"""
    rows = [(p[len(prefix):], total(series, [p], since, until)) for p in series if p.startswith(prefix)]
    return sorted([r for r in rows if r[1]], key=lambda r: -r[1])


def language_names() -> dict:
    root = os.path.join(os.path.dirname(__file__), "..")
    with open(os.path.join(root, "languages.json"), encoding="utf-8") as f:
        return {l["code"]: l["name"] for l in json.load(f)}


def build(days: int) -> dict:
    today = date.today()
    hits = fetch(FIRST_DAY, today)
    s = daily(hits)
    since = today - timedelta(days=days - 1)
    week = today - timedelta(days=6)
    names = language_names()
    opens = [p for p in s if p.startswith("open/")]
    day_list = [(since + timedelta(days=i)).isoformat() for i in range(days)]
    feature_paths = {
        "Cards tab": ["tab/cards"], "Quiz tab": ["tab/quiz"], "Quiz rounds finished": [p for p in s if p.startswith("quiz/finished/")],
        "Play all": [p for p in s if p.startswith("playall/")], "Guide tab": ["tab/guide"], "Search": ["search/open"],
        "Badges page": ["more/badges"], "Share opened": ["share/click"], "Link sent": ["share/send"], "Feedback opened": ["feedback/click"], "Support page": ["more/support"], "Donate tapped": ["support/donate"],
        "Help": ["more/help"], "What's new": ["more/changes"],
    }
    return {
        "made": today.isoformat(), "days": days, "since": since.isoformat(), "active_from": ACTIVE_FROM.isoformat(),
        "new_users": {"week": total(s, ["welcome/shown"], week, today), "period": total(s, ["welcome/shown"], since, today),
                      "all": total(s, ["welcome/shown"], FIRST_DAY, today)},
        "opens": {"week": total(s, opens, week, today), "period": total(s, opens, since, today)},
        "active": {"today": total(s, ["active/day"], today, today),
                   "day_avg": round(total(s, ["active/day"], week, today) / 7, 1),
                   "week": total(s, ["active/week"], today - timedelta(days=(today.weekday())), today),
                   "month": total(s, ["active/month"], today.replace(day=1), today)},
        "installed": {"installed": total(s, ["mode/installed"], since, today), "browser": total(s, ["mode/browser"], since, today)},
        "chart": [{"day": d, "opens": sum(s[p].get(d, 0) for p in opens), "new": s.get("welcome/shown", {}).get(d, 0),
                   "active": s.get("active/day", {}).get(d, 0)} for d in day_list],
        "languages": [{"code": c, "name": names.get(c, c), "opens": n,
                       "downloads": total(s, ["download/" + c], since, today)} for c, n in by_prefix(s, "open/", since, today)],
        "downloads": [{"code": c, "name": names.get(c, c), "n": n} for c, n in by_prefix(s, "download/", since, today)],
        "features": sorted([{"name": k, "n": total(s, v, since, today)} for k, v in feature_paths.items()], key=lambda r: -r["n"]),
    }


PAGE = """<title>PhraseBook Usage</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Space+Grotesk:wght@500;700&display=swap">
<style>
/* A one-column report: the headline numbers, then the trend, then the detail tables. PhraseBook's own red as the accent. */
:root { --bg: #faf8f5; --surface: #ffffff; --fg: #1d1b1a; --muted: #6b645e; --line: #e4ddd5; --accent: #b3261e; --good: #1b7a3d; --soft: #f1e3df;
  --display: "Space Grotesk", system-ui, sans-serif; --body: "Inter", system-ui, sans-serif; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #161413; --surface: #221f1d; --fg: #f1ece7; --muted: #a39b94; --line: #3a3532; --accent: #ff8a80; --good: #6fd08c; --soft: #3a2724; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #161413; --surface: #221f1d; --fg: #f1ece7; --muted: #a39b94; --line: #3a3532; --accent: #ff8a80; --good: #6fd08c; --soft: #3a2724; color-scheme: dark; }
body { background: var(--bg); color: var(--fg); font: 15px/1.5 var(--body); }
main { max-width: 860px; margin: 0 auto; padding-block: 28px 48px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 28px; }
h1, h2 { font-family: var(--display); margin: 0; text-wrap: balance; }
h1 { font-size: 30px; } h2 { font-size: 19px; }
.sub { color: var(--muted); margin: 4px 0 0; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; display: grid; gap: 2px; }
.tile .n { font: 700 30px/1.1 var(--display); font-variant-numeric: tabular-nums; }
.tile .l { font-weight: 600; } .tile .d { color: var(--muted); font-size: 13px; }
.tile.wait .n { color: var(--muted); font-size: 18px; }
section { display: grid; gap: 10px; min-width: 0; align-content: start; }
.chart { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px; overflow-x: auto; }
.chart svg { display: block; width: 100%; min-width: 520px; height: auto; }
.chart text { fill: var(--muted); font: 11px var(--body); }
.legend { display: flex; gap: 16px; flex-wrap: wrap; color: var(--muted); font-size: 13px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
td, th { padding: 7px 4px; border-bottom: 1px solid var(--line); text-align: left; }
th { color: var(--muted); font-weight: 600; font-size: 13px; } td.n, th.n { text-align: right; }
.bar { height: 6px; background: var(--soft); border-radius: 3px; overflow: hidden; margin-top: 4px; }
.bar span { display: block; height: 100%; background: var(--accent); }
.note { color: var(--muted); font-size: 13px; max-width: 65ch; }
</style>
<main>
  <header><h1>PhraseBook usage</h1><p class="sub">The last ${days} days, to ${made_long}. Counts from GoatCounter: no cookies, no IDs.</p></header>
  <div class="tiles">${tiles}</div>
  <section><h2>Day by day</h2>
    <div class="legend"><span><i style="background:var(--accent)"></i>App opens</span><span><i style="background:var(--good)"></i>New users</span>${active_legend}</div>
    <div class="chart">${chart}</div></section>
  <div class="cols">
    <section><h2>Languages</h2><table><tr><th>Language</th><th class="n">Opens</th><th class="n">Downloads</th></tr>${languages}</table></section>
    <section><h2>Features</h2><table><tr><th>Feature</th><th class="n">Times</th></tr>${features}</table></section>
  </div>
  <p class="note">New users are first visits on a device (the welcome page). Active devices count each phone or computer once a day, week, or month, from ${active_from_long}; before then only opens were counted, and one person opening the app often counts many times. Your own devices aren't counted once opened with ?analytics=mine.</p>
</main>"""


def long_date(d: str) -> str:
    y, m, dd = map(int, d.split("-"))
    return date(y, m, dd).strftime("%B %-d, %Y")


def render(r: dict) -> str:
    esc = html.escape
    inst = r["installed"]
    share = round(100 * inst["installed"] / (inst["installed"] + inst["browser"])) if inst["installed"] + inst["browser"] else 0
    active_started = r["made"] >= r["active_from"]
    tile = lambda n, label, d, wait=False: f'<div class="tile{" wait" if wait else ""}"><span class="n">{n}</span><span class="l">{esc(label)}</span><span class="d">{esc(d)}</span></div>'
    tiles = [
        tile(r["new_users"]["week"], "New users this week", f'{r["new_users"]["period"]} in {r["days"]} days, {r["new_users"]["all"]} since the start'),
        tile(r["active"]["week"], "Active devices this week", f'{r["active"]["month"]} this month, about {r["active"]["day_avg"]} a day') if active_started and (r["active"]["week"] or r["active"]["month"])
        else tile("Counting", "Active devices", f'From {long_date(r["active_from"])}', wait=True),
        tile(r["opens"]["week"], "App opens this week", f'{r["opens"]["period"]} in {r["days"]} days'),
        tile(f"{share}%", "Installed", "Opened from the Home Screen, not a browser tab"),
    ]
    # chart: bars for opens, a line for new users, and active devices where counted
    days = r["chart"]
    w, h, pad_l, pad_b, pad_t = 760, 220, 34, 26, 10
    top = max([1] + [d["opens"] for d in days] + [d["active"] for d in days] + [d["new"] for d in days])
    step = 10 ** max(0, len(str(top)) - 1)
    top = ((top + step - 1) // step) * step
    bw = (w - pad_l) / len(days)
    y = lambda v: pad_t + (h - pad_t - pad_b) * (1 - v / top)
    parts = [f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="App opens and new users per day">']
    for t in range(0, top + 1, max(1, top // 4)):
        parts.append(f'<line x1="{pad_l}" x2="{w}" y1="{y(t):.1f}" y2="{y(t):.1f}" stroke="var(--line)"/><text x="{pad_l - 6}" y="{y(t) + 4:.1f}" text-anchor="end">{t}</text>')
    for i, d in enumerate(days):
        x = pad_l + i * bw
        if d["opens"]:
            parts.append(f'<rect x="{x + bw * .15:.1f}" y="{y(d["opens"]):.1f}" width="{bw * .7:.1f}" height="{y(0) - y(d["opens"]):.1f}" rx="2" fill="var(--accent)" opacity=".75"><title>{d["day"]}: {d["opens"]} opens</title></rect>')
        if i % max(1, len(days) // 6) == 0:
            parts.append(f'<text x="{x + bw / 2:.1f}" y="{h - 8}" text-anchor="middle">{date.fromisoformat(d["day"]).strftime("%b %-d")}</text>')
    for key, color in (("new", "var(--good)"), ("active", "var(--fg)")):
        pts = [(pad_l + i * bw + bw / 2, y(d[key])) for i, d in enumerate(days) if key == "new" or d["day"] >= r["active_from"]]
        if key == "active" and not any(d["active"] for d in days):
            continue
        parts.append(f'<polyline fill="none" stroke="{color}" stroke-width="2" points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in pts)}"/>')
        parts += [f'<circle cx="{a:.1f}" cy="{b:.1f}" r="2.5" fill="{color}"/>' for a, b in pts[-1:]]
    parts.append("</svg>")
    big = max([1] + [l["opens"] for l in r["languages"]])
    langs = "".join(f'<tr><td>{esc(l["name"])}<div class="bar"><span style="width:{100 * l["opens"] / big:.0f}%"></span></div></td><td class="n">{l["opens"]}</td><td class="n">{l["downloads"] or ""}</td></tr>' for l in r["languages"]) or '<tr><td colspan="3">No opens yet</td></tr>'
    feats = "".join(f'<tr><td>{esc(f["name"])}</td><td class="n">{f["n"]}</td></tr>' for f in r["features"])
    return string.Template(PAGE).substitute({"days": r["days"], "made_long": long_date(r["made"]), "tiles": "".join(tiles), "chart": "".join(parts),
                   "active_legend": '<span><i style="background:var(--fg)"></i>Active devices</span>' if any(d["active"] for d in days) else "",
                   "languages": langs, "features": feats, "active_from_long": long_date(r["active_from"])})


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default="usage-report.html")
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--json", help="also write the numbers to this file")
    a = ap.parse_args()
    report = build(a.days)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(render(report))
    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=1)
    print(f"wrote {a.out}: {report['new_users']['week']} new users this week, {report['opens']['week']} opens")
