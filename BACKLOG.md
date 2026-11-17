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

## Why PhraseBook
A section on why PhraseBook was made and the thinking behind it (free, offline, polite phrases, privacy), in your own words. Probably on the About page, translated into German, French and Spanish like the help.

## Donations
A voluntary "☕ Support PhraseBook" link, which keeps the app in the free, non-commercial categories (GitHub Pages, GoatCounter) as long as it stays a gift: everyone gets the same app, and a donation never unlocks anything.

- **Where to take them:** GitHub Sponsors (0% for personal accounts, one-off or monthly) or Ko-fi (0% on one-off donations; only the card or PayPal fee). Liberapay (non-profit, 0%) and Buy Me a Coffee (5%) are the alternatives.
- **In the app:** a row in the More menu, opening the donation page, with one quiet line such as "PhraseBook is free. If it helped on your trip, you can support it." No pop-ups or reminders.
- **Before it goes in:** set up the donation page and send the link. Donations to a person count as income, not a charitable gift; check how small amounts are taxed.
- About 15 minutes once the link exists.

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

