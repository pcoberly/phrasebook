# PhraseBook

An offline phrase book for the iPhone: flashcards, a multiple-choice quiz, a study list and a
pronunciation guide, with native-speaker-style audio. It is a static web app (a PWA) hosted on
GitHub Pages, so it needs no App Store account. Live at https://pcoberly.github.io/phrasebook/

## How it is laid out

| Path | What it is |
| --- | --- |
| `phrases.json` | The phrases every language shares: `id`, English, topic (`cat`) |
| `languages.json` | The languages on offer: name, code, voices, size (size is filled in by the script) |
| `lang/<code>/phrases.json` | That language's text for each phrase `id`: `text`, `say` (pronunciation), optional `tones`, `note`, and `spoken` |
| `lang/<code>/guide.html` | That language's pronunciation guide |
| `lang/<code>/pack.json` | Generated: a hash for every file in the language (do not edit) |
| `audio/<code>/f/`, `audio/<code>/m/` | Generated: female and male MP3 for each phrase |
| `app.js`, `index.html`, `style.css`, `sw.js`, `manifest.webmanifest`, `icon-v3-*.png` | The app itself |

A device downloads the app plus only the languages chosen in Settings. Each language is a "pack"
stored in its own cache (`lang-<code>`) and removable from Settings. The app compares `pack.json`
with what it holds, so an update downloads only the files that changed.

## First open

A brand-new person sees a welcome screen that asks which language to learn, and nothing is downloaded until they
choose. Someone who already has a language on the device skips it. A link ending `?lang=ja` (any language code
from `languages.json`) opens straight into that language and is then tidied out of the address bar, so you can
send a friend a link for the language they want.

## Common jobs

**Add or change a phrase.** Add it to `phrases.json` (once), then add an entry with the same `id`
to every `lang/<code>/phrases.json`. Then run `python generate_audio.py` (needs `pip install edge-tts`).
It makes only the missing or changed audio and rewrites each `pack.json`.

**Add a language.** Add it to `languages.json` (copy a neighbour; pick `edge-tts` voices with
`python -m edge_tts --list-voices`), create `lang/<code>/phrases.json` and `guide.html`, and run
`python generate_audio.py`.

**Release.** If any app file changed (`app.js`, `style.css`, `index.html`, `sw.js`, icons), bump the
version: `CACHE` in `sw.js` and `VERSION` in `app.js`, to the same new number. Phrase and audio changes need no bump.
Then run the checks below, commit and push to `main`; GitHub Pages rebuilds in a minute or two.

**Check before a release.** `python check_data.py` finds missing or mistyped phrase ids, empty text, missing audio
or guides, and a version mismatch between `app.js` and `sw.js`. `node tests/sw-test.js` runs the service worker
against a fake network and cache (online, offline, slow connection, audio byte ranges).

## Things to know

- Nobody should ever need to delete and re-save the bookmark. Whenever the app opens or returns to the foreground
  with a connection it fetches the newest app files (the service worker asks the server every time, bypassing GitHub
  Pages' 10-minute cache), the newest phrase list, and only the language files that changed. A page that has been
  open since before a release reloads itself, or shows "A new version is ready. Tap here to reload." mid-quiz.
  The app compares its own `VERSION` with `CACHE` in the server's `sw.js`, and only a higher number counts as an
  update. It reloads by itself once per version, so a release that is still reaching GitHub's servers can't make it
  reload over and over. Offline it just shows what is stored, and on a connection too slow to answer within 3 seconds
  it opens from what is stored and picks up the newer files in the background.
- Downloading a language also asks the browser to keep it (`navigator.storage.persist()`); otherwise Safari may clear
  a website's storage after a week or so unused. A Home Screen app is not affected.
- The one thing iOS will not update remotely is the Home Screen icon (it is cached by URL), so a new icon needs a new
  filename and a one-off re-add. Avoid changing the icon.
- Service workers need HTTPS or `localhost`; opening `index.html` as a file will not work. Test locally with
  `python -m http.server 8765` and open http://localhost:8765.
- On an iPhone, Add to Home Screen works from Safari, and from Chrome, Edge and Firefox on iOS 16.4 or newer
  (Share menu → Add to Home Screen). Older iOS versions only allow it from Safari. The in-app install steps
  (Settings → About) pick the right wording for the device.
