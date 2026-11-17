# Backlog

Ideas we've discussed but not built yet.

## Announcement banner
A banner for news such as a new language, a language checked by a native speaker, or a feature people might miss.

- Messages live in `announcements.json`: an id, the text in each base language (en, de, fr, es), an optional end date, and optionally the learning languages it's for.
- Each message shows until it's dismissed, and the dismissal is remembered on the device. Show one at a time, on the List only, never during a quiz or Play all.
- Messages ship with the app (cached by the service worker), so nothing extra is fetched and it works offline.
- Keep it rare so it stays worth reading.

## Arabic
Right-to-left support is already there from Hebrew. Like Hebrew, Arabic needs men's and women's forms. Decide between Modern Standard Arabic and a spoken dialect (Egyptian or Levantine) first.

## Favourites
Use the star, kept free when skipping got the check circle, to mark favourite phrases, with a way to practise only those.

## Native-speaker review
Every language marked `draft` needs checking by a native speaker: Korean, Hebrew, Indonesian, Tagalog, Thai, Russian and Turkish, plus the German and French notes and guides. Check first the ambulance numbers in the "I need a doctor" notes, then the Thai tone marks and the Khmer and Lao spellings.

## Speaking practice
Practise saying a phrase, in two steps.

1. **Record and compare (build first).** A microphone button on the cards, beside 🔊: record yourself saying the phrase, then hear the native audio and your attempt one after the other, and judge by ear ("shadowing"). It works offline, in every language and on iPhone and Android, and nothing leaves the phone. About an hour.
2. **"Did it understand you?" (optional, later).** Run the phone's speech recognition (Chrome uses Google's, Safari Apple's) and compare what it heard with the phrase: a match, a near miss, or "it heard something else", showing what it heard. It needs a connection, since the recording goes to Google or Apple. Khmer, Lao and probably Tagalog may not be supported, and one-syllable words like the numbers are unreliable, so match generously. Test it in the iPhone Home Screen app first, where support has been patchy. A few hours.

Not planned: sound-by-sound scoring like Duolingo's needs a paid cloud service and a server, which would end PhraseBook being free, offline and private.

## A "More" menu instead of Settings
Settings now mixes real settings with things that aren't (install steps, Share, Send feedback, What's new). Turn the ⚙ tab into **More** (☰) that opens a short menu of large rows:

- **Settings:** only the real settings (your language, learning, audio, quiz, left out of practice, Play all).
- **What's new**, **Send feedback**, **Share this app**.
- **Install on this device:** shown only while the app isn't installed.
- **About:** version and privacy.
- **Help:** once the help page below exists.

About an hour.

## Help page
A short page on how to use the app: the List, Cards, Quiz, Play all, search, the ✓ circle that leaves a phrase out, the guide, and that it works offline once a language is downloaded. Small pictures or icons beside each part. Written in English, German, French and Spanish. It fits in the More menu, but could also be linked from Settings or the welcome screen before that. An hour or two, mostly the writing.
