# Backlog

Ideas we've discussed but not built yet.

## Announcement banner
A banner for news such as a new language, a language checked by a native speaker, or a feature people might miss.

- Messages live in `announcements.json`: an id, the text in each base language (en, de, fr, es), an optional end date, and optionally the learning languages it's for.
- Each message shows until it's dismissed, and the dismissal is remembered on the device. Show one at a time, on the List only, never during a quiz or Play all.
- Messages ship with the app (cached by the service worker), so nothing extra is fetched and it works offline.
- Keep it rare so it stays worth reading.

## New languages
Ranked by how much of the world each would add (`python3 coverage.py`), weighed against travel value. With its 39 languages, English among them, PhraseBook covers 87% of the world's people in their own language (97% counting where English is official). Swedish, Norwegian, Finnish and Bulgarian are done (v95), which takes Europe to 95%; Polish, Czech, Greek, Croatian, Hungarian and Romanian are done (v94); Hindi, Amharic and Danish (v93); Persian and Ukrainian (v92). All of these are learn-only, have a female and a male voice in edge-tts, and add about 2.5 MB each to the site (nothing to anyone's download unless they pick it). Each starts as a draft and joins the native-speaker review list. No edge-tts voice exists for Hausa or Yoruba, so Nigeria stays English.

**Next**
1. **Bengali** (+2 points of the world). Bangladesh, 174 million, plus about 100 million in West Bengal. Little tourism. Voices: bn-BD.
2. **Nepali** (trekking; Hindi is already widely understood there) and **Sinhala** (Sri Lanka). Voices: ne-NP, si-LK.
3. **Small European languages:** Slovenian, Macedonian, Albanian, Lithuanian, Latvian, Estonian, Icelandic. All have voices; each adds 0.4 to 3 million. Slovenia is Europe's only country with no PhraseBook language; the others already show as widely understood (Russian, Italian, Bulgarian, Danish).

**Low value now.**
4. **Afrikaans** (+3 million, Namibia only). South Africa is already covered by Zulu and English. Probably drop. Voices: af-ZA.

Also possible later: Burmese (54 million, little travel for now), Urdu (Pakistan; spoken Hindi is understood, but Urdu has its own script), Georgian, Armenian, Azerbaijani.

## More people who can use PhraseBook
Today the app can be used in English, Spanish, French or German (about 2.4 billion speakers, roughly 3 in 10 people). A Vietnamese speaker, for example, can't use it in Vietnamese. With English to learn (v91), coverage is the same 64% of the world whichever of the four you speak.

- **More "I speak" languages.** The phrases exist in all 39 languages already. Each new one needs the app's menus and messages translated (`ui.json`), a help page, and notes written for its speakers. Biggest gains in people who could use the app: Chinese, Portuguese, Arabic, then Indonesian, Japanese, Vietnamese.
- **Smaller "I speak" languages (next up): Vietnamese first.** Let speakers of other languages use the app in their own language, with sounds-like spellings and notes written for them in a few target languages to start. Design agreed so far (not built):
  - **First: Vietnamese, with American English and German in full.** Japanese and Chinese are later additions, one at a time. German isn't only for tourism: Germany has one of Europe's largest Vietnamese communities (about 200,000), with strong family, study and work ties.
  - **Nothing hidden.** Every other language stays available to a Vietnamese speaker: the phrase in Vietnamese, the target text and the audio, but no Vietnamese sounds-like spelling or notes (romanisation such as pinyin or romaji where one exists). A line says which languages have Vietnamese spellings, e.g. "Sounds-like spellings in Vietnamese: English, German. More to come." Hiding them would decide for people where they're going. Fully written languages can be listed first.
  - **The work:** the app in Vietnamese (`ui.json`, welcome, About, help page, What's new), as for de/fr/es today. The phrase meanings already exist (the Vietnamese phrases). Then `lang/en-us/for-vi/` and `lang/de/for-vi/`: 80 sounds-like spellings each, notes and a guide, all in Vietnamese. Roughly an hour or two for the app text, a few hours for the two targets once the spelling conventions are settled.
  - **Sounds-like spellings in Vietnamese: decide the conventions first,** write them in the guide, and reuse them for Japanese and Chinese later.
    - Tones: leave tone marks off, so the reader doesn't add a tone that isn't there, and say so in the guide.
    - Syllables: split respellings into syllables, as Vietnamese is written (e.g. "thanh-kiu").
    - Consonant clusters: English "str" and German "Pf" and "Schm" don't exist in Vietnamese. Choose a convention (e.g. a short vowel between the letters) or let the audio carry them.
    - Word endings: Vietnamese words end in only a few consonants, so final s, l and z need a convention.
    - Letters read differently from English (d, đ, x, ph, tr): pick one reading, probably the northern standard, and explain it.
    - Stress: keep the CAPS for the stressed syllable.
  - **Before launch:** have a Vietnamese speaker check the conventions and a sample of spellings before all 160 are written, and later the menus. Unlike a learnable language, the whole app would be in Vietnamese, so this matters more. It launches as a draft. (No reviewer yet; findable.)
  - **Candidates after Vietnamese**, by outbound travel and weak English: Japanese (katakana suits sounds-like spellings well), Korean (hangul too), Brazilian Portuguese (cheap, close to the Spanish work), Chinese (most travellers, but characters fit sounds-like spellings badly; use pinyin), Russian, Arabic. Check outbound-travel numbers and top destinations before choosing each one's full targets.
- **British English to learn.** English to learn is American (en-us). A British version (en-gb) would mostly be a copy with the bill, the toilets, return tickets and British voices.

## Translate anything (online only)
When search finds nothing ("No phrase matches 'where is the ferry'"), offer "Translate it with Google Translate ↗": a link carrying the two languages and the text, which opens Google Translate (its app, if installed) ready-translated, with its own audio.

- **A link, not built in:** Google's and DeepL's APIs need a key, which would be public in the app (anyone could run up the bill) unless hidden behind a server, ending "free, no server". Chrome's built-in translator is desktop only; nothing on iPhone. A typed translation would also have no native audio, sounds-like spelling or politeness check.
- **Offline:** hide the link, or say it needs a connection.
- **Privacy:** the text goes to Google only when the person taps; say so on the About page.
- **Language codes:** map the few that differ (Norwegian, the two Portugueses, Chinese; Moroccan Arabic probably falls back to Standard Arabic). Check each.
- About 30 minutes, plus a test in the list suite. Later it pairs with Custom phrases: look it up, then save it to your own list.

## Favourites
Use the star, kept free when skipping got the check circle, to mark favourite phrases, with a way to practise only those.

## Native-speaker review
Every language marked `draft` needs checking by a native speaker: Korean, Hebrew, Indonesian, Tagalog, Thai, Russian, Turkish, Arabic, Moroccan Arabic, both Portugueses, Swahili, Zulu, Persian, Ukrainian, Hindi, Amharic, Danish, Polish, Czech, Greek, Croatian, Hungarian, Romanian, Swedish, Norwegian, Finnish and Bulgarian, plus the German and French notes and guides. The Spanish side (the app in Spanish, and the notes, guides and sounds-like spellings written for Spanish speakers) can be checked by you, since your Spanish is good: a quick pass on a phone, a few languages at a time. For Moroccan Arabic, first listen to whether the ar-MA voices sound like Darija or like Standard Arabic read aloud. Check first the ambulance numbers in the "I need a doctor" notes, then the Thai tone marks and the Khmer and Lao spellings.

## Speaking practice
Practise saying a phrase, in two steps.

1. **Record and compare (build first).** A microphone button on the cards, beside 🔊: record yourself saying the phrase, then hear the native audio and your attempt one after the other, and judge by ear ("shadowing"). It works offline, in every language and on iPhone and Android, and nothing leaves the phone. About an hour.
2. **"Did it understand you?" (optional, later).** Run the phone's speech recognition (Chrome uses Google's, Safari Apple's) and compare what it heard with the phrase: a match, a near miss, or "it heard something else", showing what it heard. It needs a connection, since the recording goes to Google or Apple. Khmer, Lao and probably Tagalog may not be supported, and one-syllable words like the numbers are unreliable, so match generously. Test it in the iPhone Home Screen app first, where support has been patchy. A few hours.

Not planned: sound-by-sound scoring like Duolingo's needs a paid cloud service and a server, which would end PhraseBook being free, offline and private.

## Donations
A voluntary "☕ Support PhraseBook" link, which keeps the app in the free, non-commercial categories (GitHub Pages, GoatCounter) as long as it stays a gift: everyone gets the same app, and a donation never unlocks anything.

- **Where to take them:** GitHub Sponsors (0% for personal accounts, one-off or monthly) or Ko-fi (0% on one-off donations; only the card or PayPal fee). Liberapay (non-profit, 0%) and Buy Me a Coffee (5%) are the alternatives.
- **In the app:** a row in the More menu, opening the donation page, with one quiet line such as "PhraseBook is free. If it helped on your trip, you can support it." No pop-ups or reminders.
- **Before it goes in:** set up the donation page and send the link. Donations to a person count as income, not a charitable gift; check how small amounts are taxed.
- About 15 minutes once the link exists.

## LinkedIn post
A post introducing PhraseBook.

- **The story:** why you built it (the About page's words: the smile when a local hears you try), and what makes it different: free, ad-free, owl-free and streak-free, works offline, polite phrases.
- **Hear it, then say it:** every phrase has natural-sounding audio in a woman's and a man's voice (and the woman's form where a phrase changes with the speaker), plus a "sounds like" spelling written for your own language. Play all reads the list aloud, English then the language, for hands-free listening on a walk, a flight or a drive, with the screen locked. All of it works offline.
- **How much of the world it covers** (`python3 coverage.py` recalculates; approximate, 2024 populations; the map page shows it). English, the app's own language, counts where it is the everyday language (the United States, the United Kingdom, Australia...). With the 39 languages: about 146 countries and territories and 7.1 billion people, 87% of the world; adding the places where English is official but most people speak something else (Nigeria, Pakistan...), 97%. By region: the Americas 100%, the Middle East 100%, Europe 95%, Asia 87%, Africa 76% (100% with English), Oceania 70%. Lines that work: "PhraseBook has the words for 97% of the world" (the map page's headline), "Speak with nearly 9 in 10 people on Earth in their own language", "from Marrakech to Mombasa, São Paulo to Seoul". Also good for other posts and the About page.
- **Show it:** two or three phone screenshots (the List with audio and sounds-like spellings, a card, the welcome page) or a short screen recording.
- **The link,** and an ask: try it before your next trip, share it, and if you're a native speaker of a draft language, help check it (see Native-speaker review).
- Best after the app has settled for a while; I can draft the post and make the screenshots when you're ready.

## Download size levers
Not needed yet: `check_data.py` prints the sizes on every run and warns on GitHub when one passes its limit (a language 5 MB, a first download 8 MB). Audio is nearly all of it, about 30 KB per phrase per language, so a language reaches 5 MB at about 170 phrases. If a limit is hit, in rough order of effort:

- **Lower audio bitrate:** re-encode at a lower bitrate (speech stays clear). Saves about a third. Regenerate everything, then re-apply the hand fixes in `audio/hashes.json` (Russian male "cold", Turkish male "three").
- **A more compact format (Opus):** about half the size. Test on older iPhones first, since Safari's support came late.
- **The second voice as an option:** download only one voice unless the user asks for both. Halves each language.
- **Trim What's new:** keep only recent versions in `changes.json`.

# Long term

Bigger ideas, mostly content. Each needs a design decision before building.

## Custom phrases
Add your own phrases, such as your hotel's address, a dietary need, or something you say often.

- **The hard part is the translation and the audio.** A translation service costs money and needs a connection, so the free, offline answer is: you type the phrase in your language and its translation (from a friend, a guide or a translation app), and the phone's own voice reads it aloud. Device voices vary by phone and language, and some (Khmer, Lao) may have none, so show the text large to point at instead.
- Stored on the device, with your progress like any other phrase, in a "My phrases" topic. Export and import so they survive a new phone.
- Later, perhaps: "suggest this phrase for everyone" sends it to you as feedback to add properly.

## Add-on packs
Optional topic packs, downloaded like languages and only when wanted: business, conversation and small talk, medical and pharmacy, dietary needs, hiking and outdoors, family travel.

- Each pack is a set of phrases with text, sounds-like spellings, notes and audio in every language, so the work is mostly writing and checking content (17 languages × the pack).
- Start with one pack in a few languages to settle the format, then grow.
- Packs show up as topics, so the List, Cards, Quiz, search and Play all work on them unchanged.

## Conversation mode
Practise common exchanges as a back-and-forth: ordering a coffee, checking in, taking a taxi, buying at a market, small talk ("Where are you from?" "I'm from …").

- A short scripted dialogue per situation, with two roles. The app speaks the other person's lines; you say yours, then hear the right answer. Swap roles to practise understanding the replies too.
- Builds on the existing phrases and audio, plus new reply lines (the shopkeeper's answers, the prices, "anything else?").
- Pairs well with record and compare (Speaking practice): record your line, then hear yours and the native one.
- Mostly content: a handful of dialogues × 17 languages, with audio for both roles.

## Paid options
Keep the core free; offer the bigger extras (add-on packs, conversation mode, perhaps custom phrases) as small one-off purchases. Before the first sale:

- **Hosting:** GitHub Pages and GoatCounter's free plan are for non-commercial use. Move the site to a host that allows commercial use, such as Cloudflare Pages (free), and count visits with Cloudflare alone or a paid GoatCounter plan (about $5 a month).
- **Payment:** as a web app there is no App Store cut. A merchant of record such as Lemon Squeezy or Paddle takes the card payment and handles sales tax and VAT in every country, for about 5% plus a small fee per sale.
- **Unlocking:** the purchase gives a licence code that the app checks offline with a digital signature only the seller can make, so it keeps working without a connection or an account.
- **Paid content:** the repository is public, so paid files there could be found. Either accept that (most people won't look, and the price is small) or serve paid packs from a small private download service, such as Cloudflare's free tier.
- **Quality first:** have native speakers check the content before charging for it (see Native-speaker review).

## Tab bar when the app grows
The bottom bar holds five tabs comfortably, and it's full (List, Cards, Quiz, Guide, More). When something needs a sixth (likely conversation mode, or speaking practice if it becomes its own screen), regroup by what someone is trying to do:

- **Phrases:** "I need to say something now": the List, search, 🔊 and Play all. Keep it one tap away; it's the moment that matters on a trip.
- **Practice:** "I'm learning": Cards, Quiz, and later speaking practice and conversations, chosen from a row of options at the top. New ways to practise go here, never into a new tab.
- **Guide:** as now.
- **More:** as now.

Four tabs leaves room for a fifth if something big ever earns it. The cost is one extra tap to reach the quiz, fine for practice you sit down to do.

