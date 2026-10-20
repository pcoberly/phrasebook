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
            else:
                for voice in ("f", "m"):
                    if not (ROOT / "audio" / code / voice / f"{i}.mp3").exists():
                        problems.append(f"audio/{code}/{voice}/{i}.mp3 is missing (run generate_audio.py)")
        for k in texts:
            if k not in ids:
                problems.append(f"lang/{code}/phrases.json: {k!r} is not in phrases.json (a mistyped id?)")

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
