"""Check the phrase data and the app's version before a release. Prints each problem and exits 1 if there are any.

It checks that every language has an entry with text for every shared phrase (and none for a phrase that does
not exist, which is usually a mistyped id), that each language has its guide and its two voices, that every
phrase has audio, and that the version in app.js matches the one in sw.js.

It also reports download sizes and warns (without failing) when one passes its limit in SIZE_LIMITS. On GitHub the
warning shows on the check's summary, so a size problem gets noticed whoever made the change.

Usage:  python check_data.py
"""
import collections
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent

# Where a size starts to matter, about half way to where it would hurt (MB). Raise one only on purpose.
SIZE_LIMITS = {
    "app": (0.5, "The app itself", "everyone downloads it, and it slows opening on a weak signal"),
    "pack": (5, "The largest language", "each language is a download, often on hotel Wi-Fi"),
    "first": (8, "A new user's first download", "the app, English audio and one language, the first impression"),
    "site": (500, "The published site", "GitHub Pages allows 1 GB"),
    "repo": (500, "The repository with its history", "GitHub recommends staying under about 1 GB"),
}


def sizes():
    """Download sizes in MB, and a warning for each one over its limit."""
    def tree(path):
        return sum(f.stat().st_size for f in (ROOT / path).rglob("*") if f.is_file())
    shell = re.search(r"const SHELL = \[(.*?)\];", (ROOT / "sw.js").read_text(encoding="utf-8")).group(1)
    shell_files = [f.strip().strip('"') for f in shell.split(",") if f.strip()]
    app = sum((ROOT / ("index.html" if f == "./" else f)).stat().st_size for f in shell_files
              if (ROOT / ("index.html" if f == "./" else f)).exists()) / 1e6
    languages = json.loads((ROOT / "languages.json").read_text(encoding="utf-8"))
    packs = {l["code"]: l.get("bytes", 0) / 1e6 for l in languages}
    english = json.loads((ROOT / "lang/en/pack.json").read_text(encoding="utf-8"))["bytes"] / 1e6
    biggest = max(packs, key=packs.get)
    site = app + (tree("audio") + tree("lang")) / 1e6
    repo = None  # only measurable with the full history (a CI checkout is shallow)
    try:
        shallow = subprocess.run(["git", "rev-parse", "--is-shallow-repository"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        if shallow == "false":
            out = subprocess.run(["git", "count-objects", "-v"], cwd=ROOT, capture_output=True, text=True).stdout
            kb = {k: int(v) for k, v in (line.split(": ") for line in out.splitlines() if ": " in line and line.split(": ")[1].isdigit())}
            repo = (kb.get("size", 0) + kb.get("size-pack", 0)) / 1e3
    except OSError:
        pass
    measured = {"app": app, "pack": packs[biggest], "first": app + english + packs[biggest], "site": site, "repo": repo}
    line = (f"Sizes: app {app:.2f} MB, languages {min(packs.values()):.1f}–{packs[biggest]:.1f} MB (largest {biggest}), "
            f"first download {measured['first']:.1f} MB, site {site:.0f} MB" + (f", repository {repo:.0f} MB" if repo is not None else ""))
    warnings = []
    for key, value in measured.items():
        limit, what, why = SIZE_LIMITS[key]
        if value is not None and value > limit:
            name = f"{what} ({biggest})" if key == "pack" else what
            warnings.append(f"{name} is {value:.1f} MB, over the {limit} MB limit: {why}")
    return line, warnings


def t_calls(text: str):
    """The inside of each t(...) call in app.js, found by matching brackets outside quotes."""
    for m in re.finditer(r"\bt\(", text):
        depth, i, quote = 1, m.end(), None
        while i < len(text) and depth:
            c = text[i]
            if quote:
                if c == "\\": i += 1
                elif c == quote: quote = None
            elif c in "\"'`": quote = c
            elif c == "(": depth += 1
            elif c == ")": depth -= 1
            i += 1
        yield text[m.end():i - 1]


def main() -> int:
    problems = []
    shared = json.loads((ROOT / "phrases.json").read_text(encoding="utf-8"))
    ids = [p.get("id") for p in shared]
    for i, n in collections.Counter(ids).items():
        if n > 1:
            problems.append(f"phrases.json: id {i!r} is used {n} times")
    for p in shared:
        for field in ("id", "en", "cat"):
            if not p.get(field):
                problems.append(f"phrases.json: {p} has no {field}")

    languages = json.loads((ROOT / "languages.json").read_text(encoding="utf-8"))
    codes = [l.get("code") for l in languages]
    for c, n in collections.Counter(codes).items():
        if n > 1:
            problems.append(f"languages.json: code {c!r} is used {n} times")
    for lang in languages:
        code = lang.get("code")
        for field in ("code", "name", "native", "ttsLang"):
            if not lang.get(field):
                problems.append(f"languages.json: {code} has no {field}")
        if sorted(lang.get("voices", {})) != ["f", "m"]:
            problems.append(f"languages.json: {code} needs a female (f) and a male (m) voice")
        folder = ROOT / "lang" / code
        if not (folder / "guide.html").exists():
            problems.append(f"lang/{code}/guide.html is missing")
        try:
            texts = json.loads((folder / "phrases.json").read_text(encoding="utf-8"))
        except (OSError, ValueError) as err:
            problems.append(f"lang/{code}/phrases.json can't be read: {err}")
            continue
        for i in ids:
            entry = texts.get(i)
            if entry is None:
                problems.append(f"lang/{code}/phrases.json: no entry for {i!r}")
            elif not entry.get("text"):
                problems.append(f"lang/{code}/phrases.json: {i!r} has no text")
            elif "female" in entry and not (isinstance(entry["female"], dict) and (entry["female"].get("text") or entry["female"].get("say"))):
                problems.append(f"lang/{code}/phrases.json: {i!r} has a female form with no text or say")
            else:
                for voice in ("f", "m"):
                    if not (ROOT / "audio" / code / voice / f"{i}.mp3").exists():
                        problems.append(f"audio/{code}/{voice}/{i}.mp3 is missing (run generate_audio.py)")
        for k in texts:
            if k not in ids:
                problems.append(f"lang/{code}/phrases.json: {k!r} is not in phrases.json (a mistyped id?)")

    # English audio, shared by every language for Play all
    for i in ids:
        for voice in ("f", "m"):
            if not (ROOT / "audio" / "en" / voice / f"{i}.mp3").exists():
                problems.append(f"audio/en/{voice}/{i}.mp3 is missing (run generate_audio.py)")
    if not (ROOT / "lang" / "en" / "pack.json").exists():
        problems.append("lang/en/pack.json is missing (run generate_audio.py)")

        # notes, "sounds like" spellings and guides written for speakers of another language (lang/<code>/for-<base>/)
        for folder in sorted(folder.glob("for-*")):
            base = folder.name[4:]
            if base != "en" and not any(l.get("code") == base and l.get("base") for l in languages):
                problems.append(f"{folder.relative_to(ROOT)}: {base!r} is not marked \"base\" in languages.json")
            notes_file = folder / "notes.json"
            if notes_file.exists():
                try:
                    notes = json.loads(notes_file.read_text(encoding="utf-8"))
                except ValueError as err:
                    problems.append(f"{notes_file.relative_to(ROOT)} can't be read: {err}")
                    notes = {}
                for k, entry in notes.items():
                    if k not in ids:
                        problems.append(f"{notes_file.relative_to(ROOT)}: {k!r} is not in phrases.json (a mistyped id?)")
                    elif set(entry) - {"say", "note", "tones", "female"}:
                        problems.append(f"{notes_file.relative_to(ROOT)}: {k!r} has {sorted(set(entry) - {'say', 'note', 'tones', 'female'})}, which only the language's own file can set")

    # the app's own words: each language you can know translates them in lang/<code>/for-<code>/ui.json; one it
    # misses shows in English, so that is a warning rather than a problem
    app_text = (ROOT / "app.js").read_text(encoding="utf-8")
    keys = set(re.findall(r'data-t(?:-aria)?="([^"]+)"', (ROOT / "index.html").read_text(encoding="utf-8")))
    for call in t_calls(app_text):  # every quoted text in a t(...) call, such as both sides of t(many ? "..." : "...")
        keys |= set(re.findall(r'"((?:[^"\\]|\\.)*)"', call.split(", {")[0]))
    for name, desc in re.findall(r'badge\("[^"]+", "[^"]+", "((?:[^"\\]|\\.)*)", "((?:[^"\\]|\\.)*)"\)', app_text):  # badges, passed to t()
        keys |= {name, desc}
    for steps in re.findall(r"steps = \[(.*?)\];", app_text):  # the install steps, passed to t() one by one
        keys |= set(re.findall(r'"((?:[^"\\]|\\.)*)"', steps))
    keys |= {re.sub(r"\\(.)", r"\1", k) for k in keys}
    keys |= {l["name"] for l in languages} | {"English"} | {c.replace("-", " ").title() for c in {p.get("cat") for p in shared}}
    for ui_file in sorted(ROOT.glob("lang/*/for-*/ui.json")):
        have = json.loads(ui_file.read_text(encoding="utf-8"))
        missing = sorted(k for k in keys if k not in have and "\\" not in k)
        for k in missing:
            print(f"warning: {ui_file.relative_to(ROOT)} has no translation for {k!r}")

    app = re.search(r'const VERSION = "([^"]+)"', (ROOT / "app.js").read_text(encoding="utf-8"))
    sw = re.search(r'const CACHE = "([^"]+)"', (ROOT / "sw.js").read_text(encoding="utf-8"))
    if not app or not sw or app.group(1) != sw.group(1):
        problems.append(f"VERSION in app.js ({app and app.group(1)}) and CACHE in sw.js ({sw and sw.group(1)}) must match")

    # a phrase with a gap can show its audio's example filled in: "filled" marks exactly one example, ⟦like this⟧
    for lang in languages:
        try:
            texts = json.loads((ROOT / "lang" / lang["code"] / "phrases.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for pid, e in texts.items():
            for form in (e, e.get("female") or {}):
                filled = form.get("filled")
                if filled is None:
                    continue
                gap = re.search(r"\.\.\.|…", form.get("text", e.get("text", "")))
                if not gap or filled.count("⟦") != 1 or filled.count("⟧") != 1 or not re.search(r"⟦[^⟦⟧]+⟧", filled):
                    problems.append(f"lang/{lang['code']}/phrases.json: {pid} \"filled\" must mark one example, ⟦like this⟧, in a phrase with a gap")

    # the coverage map on the About page, drawn for the languages there are now
    try:
        drawn = re.search(r'data-languages="([^"]*)"', (ROOT / "map.svg").read_text(encoding="utf-8")).group(1).split()
        if sorted(drawn) != sorted(l["code"] for l in languages):
            problems.append("map.svg was drawn for other languages: run python3 tools/make_map.py")
    except (OSError, AttributeError):
        problems.append("map.svg is missing: run python3 tools/make_map.py")

    # Help: English with the app, and one in each other language you can speak, beside its interface text
    for path in ["help.html"] + [f"lang/{l['code']}/for-{l['code']}/help.html" for l in languages if l.get("base")]:
        if not (ROOT / path).exists():
            problems.append(f"{path} is missing (the Help page in that language)")

    # What's new (changes.json): newest first, no version later than this one, every line in every language you can speak
    try:
        changes = json.loads((ROOT / "changes.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as err:
        changes = []
        problems.append(f"changes.json can't be read: {err}")
    current = int(app.group(1).rsplit("v", 1)[1]) if app else 0
    bases = ["en"] + [l["code"] for l in languages if l.get("base")]
    codes = {l["code"] for l in languages}
    versions = [c.get("v") for c in changes]
    if versions != sorted(versions, reverse=True) or len(set(versions)) != len(versions):
        problems.append("changes.json: versions must be listed newest first, each once")
    for c in changes:
        if not isinstance(c.get("v"), int) or c["v"] > current:
            problems.append(f"changes.json: version {c.get('v')!r} is not a version up to {current}")
        if not re.fullmatch(r"\d{4}-\d\d-\d\d", str(c.get("date", ""))):
            problems.append(f"changes.json: v{c.get('v')} needs a date like 2026-11-03")
        for item in c.get("items") or [None]:
            if isinstance(item, dict) and "langs" in item:
                for code in set(item["langs"]) - codes:
                    problems.append(f"changes.json: v{c.get('v')} names a language that isn't in languages.json: {code}")
            elif not isinstance(item, dict) or any(not item.get(b) for b in bases):
                problems.append(f"changes.json: v{c.get('v')} has a line missing one of {', '.join(bases)}")

    size_line, size_warnings = sizes()
    print(size_line)
    for w in size_warnings:
        print(f"warning: size: {w}")
        if os.environ.get("GITHUB_ACTIONS"):
            print(f"::warning title=Download size::{w}")

    for p in problems:
        print(p)
    print(f"{len(problems)} problem(s) in {len(ids)} phrases and {len(languages)} languages" if problems else
          f"OK: {len(ids)} phrases in {len(languages)} languages, version {app.group(1)}")
    return 1 if problems else 0


sys.exit(main())
