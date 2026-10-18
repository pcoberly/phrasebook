"""Generate the audio for every phrase in every language, then describe each language pack.

For each language in languages.json this makes a female (audio/<lang>/f/) and a male
(audio/<lang>/m/) MP3 per phrase using Microsoft's neural voices (edge-tts). Only phrases
that are new, or whose text/voice/rate changed, are generated.

It then writes lang/<lang>/pack.json (a hash for every file in the language), which the
app uses to download or update just that language, and records each language's size in
languages.json.

Usage:  python generate_audio.py [--lang ja] [--force]
"""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path

import edge_tts

ROOT = Path(__file__).parent
LANGUAGES = ROOT / "languages.json"
SHARED = ROOT / "phrases.json"
AUDIO = ROOT / "audio"
HASHES = AUDIO / "hashes.json"

RATE = "-20%"
VOLUME = "+50%"  # the default output is quiet on a phone


def spoken(text: str) -> str:
    """The placeholder dots in phrases like "I would like..." are not spoken."""
    return text.replace("...", "").replace("…", "").strip()


def write_json(path: Path, data, **kwargs):
    path.write_text(json.dumps(data, ensure_ascii=False, **kwargs) + "\n", encoding="utf-8", newline="\n")


async def make_audio(code: str, language: dict, texts: dict, shared_ids: list, hashes: dict, force: bool) -> int:
    made = 0
    for folder, voice in language["voices"].items():
        (AUDIO / code / folder).mkdir(parents=True, exist_ok=True)
        for phrase_id in shared_ids:
            if phrase_id not in texts:
                continue
            entry = texts[phrase_id]
            # a phrase with a gap ("Which train for...?") can give the audio a "spoken" version with an example filled in
            text = spoken(entry.get("spoken", entry["text"]))
            digest = hashlib.sha1(f"{voice}|{RATE}|{VOLUME}|{text}".encode("utf-8")).hexdigest()
            out = AUDIO / code / folder / f"{phrase_id}.mp3"
            hkey = f"{code}/{folder}/{phrase_id}"
            if force or not out.exists() or hashes.get(hkey) != digest:
                for attempt in range(5):  # the service sometimes answers 503 under load
                    try:
                        await edge_tts.Communicate(text, voice, rate=RATE, volume=VOLUME).save(str(out))
                        break
                    except Exception as err:
                        if attempt == 4:
                            raise
                        print(f"retrying {hkey} ({err.__class__.__name__})")
                        await asyncio.sleep(2 * (attempt + 1))
                hashes[hkey] = digest
                write_json(HASHES, hashes, indent=1)
                made += 1
                print(f"made {hkey}: {text}")
    return made


def build_pack(code: str, texts: dict, shared_ids: list) -> int:
    """List every file a phone needs for this language, each with a short content hash."""
    paths = [ROOT / "lang" / code / "phrases.json", ROOT / "lang" / code / "guide.html"]
    for folder in ("f", "m"):
        paths += [AUDIO / code / folder / f"{i}.mp3" for i in shared_ids if i in texts]
    files, total = {}, 0
    for path in paths:
        if path.exists():
            data = path.read_bytes()
            files[path.relative_to(ROOT).as_posix()] = hashlib.sha1(data).hexdigest()[:12]
            total += len(data)
    write_json(ROOT / "lang" / code / "pack.json", {"bytes": total, "files": files}, indent=1)
    return total


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", help="only generate audio for this language code")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    languages = json.loads(LANGUAGES.read_text(encoding="utf-8"))
    shared_ids = [p["id"] for p in json.loads(SHARED.read_text(encoding="utf-8"))]
    hashes = json.loads(HASHES.read_text(encoding="utf-8")) if HASHES.exists() else {}

    for language in languages:
        code = language["code"]
        texts = json.loads((ROOT / "lang" / code / "phrases.json").read_text(encoding="utf-8"))
        missing = [i for i in shared_ids if i not in texts]
        if missing:
            print(f"{code}: no entry yet for {', '.join(missing)}")
        made = 0
        if not args.lang or args.lang == code:
            made = await make_audio(code, language, texts, shared_ids, hashes, args.force)
        language["bytes"] = build_pack(code, texts, shared_ids)
        print(f"{code}: {made} generated, pack is {language['bytes'] / 1e6:.2f} MB")

    write_json(LANGUAGES, languages, indent=2)


asyncio.run(main())
