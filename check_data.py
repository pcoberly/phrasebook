"""Check the phrase data and the app's version before a release. Prints each problem and exits 1 if there are any.

It checks that every language has an entry with text for every shared phrase (and none for a phrase that does
not exist, which is usually a mistyped id), that each language has its guide and its two voices, that every
phrase has audio, and that the version in app.js matches the one in sw.js.

Usage:  python check_data.py
"""
import collections
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent


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

    for p in problems:
        print(p)
    print(f"{len(problems)} problem(s) in {len(ids)} phrases and {len(languages)} languages" if problems else
          f"OK: {len(ids)} phrases in {len(languages)} languages, version {app.group(1)}")
    return 1 if problems else 0


sys.exit(main())
