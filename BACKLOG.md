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
Every language marked `draft` needs checking by a native speaker: Korean, Hebrew, Indonesian, Tagalog, Thai and Russian, plus the German and French notes and guides. The Thai tone marks and the Khmer and Lao spellings matter most.

## Speaking practice
Practise saying a phrase, in two steps.

1. **Record and compare (build first).** A microphone button on the cards, beside 🔊: record yourself saying the phrase, then hear the native audio and your attempt one after the other, and judge by ear ("shadowing"). It works offline, in every language and on iPhone and Android, and nothing leaves the phone. About an hour.
2. **"Did it understand you?" (optional, later).** Run the phone's speech recognition (Chrome uses Google's, Safari Apple's) and compare what it heard with the phrase: a match, a near miss, or "it heard something else", showing what it heard. It needs a connection, since the recording goes to Google or Apple. Khmer, Lao and probably Tagalog may not be supported, and one-syllable words like the numbers are unreliable, so match generously. Test it in the iPhone Home Screen app first, where support has been patchy. A few hours.

Not planned: sound-by-sound scoring like Duolingo's needs a paid cloud service and a server, which would end PhraseBook being free, offline and private.

## Search
Find a phrase without scrolling, for when you need to say something now.

- **Where:** a 🔍 button at the end of the List's controls row. Tapping it turns that row into a search box, with the topic, direction and listening-only controls set aside until you close it with ✕. List only; Cards and Quiz are for practice.
- **What it matches:** your own language first ("toilet", or "Toilette" in German), then the phrase itself and its sounds-like spelling ("xin", "kráp"). Ignore accents and case ("cafe" finds "café"), and match the start of words ("pharm" finds the pharmacy). Leave the notes out, as they'd add noise.
- **Results:** the List filters as you type, with the matches highlighted, and 🔊 still plays. Search every topic whatever is chosen, and say so in the box ("Search all phrases"). Play all plays just the results. With no match, say so rather than showing an empty page.
- About an hour or two.
