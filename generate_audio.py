"""Generate an MP3 for every phrase in phrases.json using Microsoft's neural voices (edge-tts).

Makes a female (audio/f/) and a male (audio/m/) version of each phrase.
Only phrases that are new, or whose Vietnamese text/voice/rate changed, are generated.
Usage:  python generate_audio.py [--force]
"""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path

import edge_tts

ROOT = Path(__file__).parent
PHRASES = ROOT / "phrases.json"
AUDIO = ROOT / "audio"
HASHES = AUDIO / "hashes.json"


# folder name -> voice. The app plays audio/<folder>/<phrase id>.mp3
VOICES = {"f": "vi-VN-HoaiMyNeural", "m": "vi-VN-NamMinhNeural"}
RATE = "-20%"


def spoken(vi: str) -> str:
    return vi.replace("...", "").strip()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    phrases = json.loads(PHRASES.read_text(encoding="utf-8"))
    hashes = json.loads(HASHES.read_text(encoding="utf-8")) if HASHES.exists() else {}
    AUDIO.mkdir(exist_ok=True)

    made = 0
    for folder, voice in VOICES.items():
        (AUDIO / folder).mkdir(exist_ok=True)
        for p in phrases:
            text = spoken(p["vi"])
            digest = hashlib.sha1(f"{voice}|{RATE}|{text}".encode("utf-8")).hexdigest()
            out = AUDIO / folder / f"{p['id']}.mp3"
            hkey = f"{folder}/{p['id']}"
            if args.force or not out.exists() or hashes.get(hkey) != digest:
                for attempt in range(5):  # the service sometimes answers 503 under load
                    try:
                        await edge_tts.Communicate(text, voice, rate=RATE).save(str(out))
                        break
                    except Exception as err:
                        if attempt == 4:
                            raise
                        print(f"retrying {hkey} ({err.__class__.__name__})")
                        await asyncio.sleep(2 * (attempt + 1))
                hashes[hkey] = digest
                HASHES.write_text(json.dumps(hashes, indent=1), encoding="utf-8")
                made += 1
                print(f"made {folder}/{out.name}: {text}")

    HASHES.write_text(json.dumps(hashes, indent=1), encoding="utf-8")
    print(f"{made} generated, {len(phrases)} phrases x {len(VOICES)} voices")


asyncio.run(main())
