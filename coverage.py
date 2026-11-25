"""How much of the world PhraseBook covers, for an English speaker: python3 coverage.py
It reads the languages in languages.json; add a language's code to a country below when it is spoken there.
Populations: approximate 2024 figures in millions (UN estimates, rounded).
Languages: an app language counts for a country when it is an official or national language there, or the everyday
language most people use (main). "wide" lists app languages that are a widely understood second language there.
EN = English is the everyday language most people speak (the United States, the United Kingdom, Australia...): it is
PhraseBook's own language, so those countries count as covered. en = English is an official language but most people
speak something else day to day (India, Nigeria...): English works there, but it is not their own language.
In the Baltic states English counts as widely understood, not Russian: many understand Russian, but for many it is
the language of the Soviet occupation, and English goes over better. Croatian (hr) counts for Serbia, Bosnia and Montenegro too: Croatian, Serbian, Bosnian and Montenegrin are one language
with four standard names."""

import json
from pathlib import Path

CODES = {"pt-br": "pt", "pt-pt": "pt"}  # both Portugueses count as pt
APP = {CODES.get(l["code"], l["code"]) for l in json.loads((Path(__file__).parent / "languages.json").read_text(encoding="utf-8"))} | {"EN"}

# country, region, population (M), main languages, widely understood
C = [
 # Africa
 ("Nigeria", "Africa", 228, "en", ""), ("Ethiopia", "Africa", 130, "am", ""), ("Egypt", "Africa", 116, "ar", "en"),
 ("DR Congo", "Africa", 109, "fr sw", ""), ("Tanzania", "Africa", 69, "sw en", ""), ("South Africa", "Africa", 64, "en zu", ""),
 ("Kenya", "Africa", 56, "sw en", ""), ("Sudan", "Africa", 50, "ar en", ""), ("Uganda", "Africa", 50, "en sw", ""),
 ("Algeria", "Africa", 47, "ar", "fr"), ("Morocco", "Africa", 38, "ary ar", "fr"), ("Angola", "Africa", 38, "pt", ""),
 ("Ghana", "Africa", 34, "en", ""), ("Mozambique", "Africa", 34, "pt", ""), ("Madagascar", "Africa", 31, "fr", ""),
 ("Côte d'Ivoire", "Africa", 31, "fr", ""), ("Cameroon", "Africa", 29, "fr en", ""), ("Niger", "Africa", 27, "fr", ""),
 ("Mali", "Africa", 24, "fr", ""), ("Burkina Faso", "Africa", 23, "fr", ""), ("Malawi", "Africa", 21, "en", ""),
 ("Zambia", "Africa", 21, "en", ""), ("Chad", "Africa", 19, "fr ar", ""), ("Somalia", "Africa", 19, "ar", ""),
 ("Senegal", "Africa", 18, "fr", ""), ("Zimbabwe", "Africa", 17, "en", ""), ("Guinea", "Africa", 15, "fr", ""),
 ("Rwanda", "Africa", 14, "fr sw en", ""), ("Benin", "Africa", 14, "fr", ""), ("Burundi", "Africa", 14, "fr", "sw"),
 ("Tunisia", "Africa", 12, "ar", "fr"), ("South Sudan", "Africa", 12, "en", "ar"), ("Togo", "Africa", 9, "fr", ""),
 ("Sierra Leone", "Africa", 9, "en", ""), ("Libya", "Africa", 7, "ar", ""), ("Congo", "Africa", 6, "fr", ""),
 ("Central African Rep.", "Africa", 5, "fr", ""), ("Liberia", "Africa", 5, "EN", ""), ("Mauritania", "Africa", 5, "ar", "fr"),
 ("Eritrea", "Africa", 4, "ar", "en"), ("Namibia", "Africa", 3, "en", ""), ("Gambia", "Africa", 3, "en", ""),
 ("Botswana", "Africa", 3, "en", ""), ("Gabon", "Africa", 2.5, "fr", ""), ("Lesotho", "Africa", 2.3, "en", ""),
 ("Guinea-Bissau", "Africa", 2.2, "pt", ""), ("Equatorial Guinea", "Africa", 1.9, "es fr pt", ""), ("Mauritius", "Africa", 1.3, "en fr", ""),
 ("Eswatini", "Africa", 1.2, "en", "zu"), ("Djibouti", "Africa", 1.2, "fr ar", ""), ("Comoros", "Africa", 0.9, "fr ar", ""),
 ("Cabo Verde", "Africa", 0.5, "pt", ""), ("São Tomé and Príncipe", "Africa", 0.2, "pt", ""), ("Seychelles", "Africa", 0.1, "en fr", ""),
 # Americas
 ("United States", "Americas", 341, "EN", ""), ("Brazil", "Americas", 212, "pt", ""), ("Mexico", "Americas", 130, "es", ""),
 ("Colombia", "Americas", 53, "es", ""), ("Argentina", "Americas", 46, "es", ""), ("Canada", "Americas", 40, "EN fr", ""),
 ("Peru", "Americas", 34, "es", ""), ("Venezuela", "Americas", 29, "es", ""), ("Chile", "Americas", 20, "es", ""),
 ("Guatemala", "Americas", 18, "es", ""), ("Ecuador", "Americas", 18, "es", ""), ("Bolivia", "Americas", 12, "es", ""),
 ("Haiti", "Americas", 12, "fr", ""), ("Dominican Rep.", "Americas", 11, "es", ""), ("Honduras", "Americas", 11, "es", ""),
 ("Cuba", "Americas", 11, "es", ""), ("Paraguay", "Americas", 7, "es", ""), ("Nicaragua", "Americas", 7, "es", ""),
 ("El Salvador", "Americas", 6, "es", ""), ("Costa Rica", "Americas", 5, "es", ""), ("Panama", "Americas", 4.5, "es", ""),
 ("Uruguay", "Americas", 3.4, "es", ""), ("Puerto Rico", "Americas", 3.2, "es en", ""), ("Jamaica", "Americas", 2.8, "EN", ""),
 ("Trinidad and Tobago", "Americas", 1.5, "EN", ""), ("Guyana", "Americas", 0.8, "EN", ""), ("Suriname", "Americas", 0.6, "nl", ""),
 ("Belize", "Americas", 0.4, "EN", "es"), ("Bahamas", "Americas", 0.4, "EN", ""), ("Guadeloupe and Martinique", "Americas", 0.7, "fr", ""),
 ("Barbados", "Americas", 0.3, "EN", ""), ("French Guiana", "Americas", 0.3, "fr", ""), ("Curaçao and Aruba", "Americas", 0.3, "nl", "es en"),
 ("Other Caribbean (English)", "Americas", 0.9, "EN", ""), ("Greenland", "Americas", 0.06, "", "da"),
 # Asia
 ("India", "Asia", 1451, "hi en", ""), ("China", "Asia", 1419, "zh", ""), ("Indonesia", "Asia", 283, "id", ""),
 ("Pakistan", "Asia", 251, "en", "hi"), ("Bangladesh", "Asia", 174, "", ""), ("Japan", "Asia", 124, "ja", ""),
 ("Philippines", "Asia", 116, "tl en", ""), ("Vietnam", "Asia", 101, "vi", ""), ("Thailand", "Asia", 72, "th", ""),
 ("Myanmar", "Asia", 54, "", ""), ("South Korea", "Asia", 52, "ko", ""), ("Afghanistan", "Asia", 43, "fa", ""),
 ("Uzbekistan", "Asia", 36, "", "ru"), ("Malaysia", "Asia", 35, "en zh", "id"), ("Nepal", "Asia", 31, "", "en hi"),
 ("North Korea", "Asia", 26, "ko", ""), ("Taiwan", "Asia", 23, "zh", ""), ("Sri Lanka", "Asia", 23, "si", "en"),
 ("Kazakhstan", "Asia", 20, "ru", ""), ("Cambodia", "Asia", 18, "km", ""), ("Tajikistan", "Asia", 10.6, "", "ru fa"),
 ("Hong Kong", "Asia", 7.4, "zh en", ""), ("Papua New Guinea", "Oceania", 10.6, "en", ""), ("Laos", "Asia", 7.8, "lo", "th"),
 ("Kyrgyzstan", "Asia", 7.2, "ru", ""), ("Turkmenistan", "Asia", 7.5, "", "ru"), ("Singapore", "Asia", 5.9, "en zh", "id"),
 ("Mongolia", "Asia", 3.5, "", "ru"), ("Timor-Leste", "Asia", 1.4, "pt", "id"), ("Bhutan", "Asia", 0.8, "", "en"),
 ("Macau", "Asia", 0.7, "zh pt", ""), ("Maldives", "Asia", 0.5, "", "en"), ("Brunei", "Asia", 0.5, "", "id en"),
 # Europe
 ("Russia", "Europe", 144, "ru", ""), ("Germany", "Europe", 84, "de", ""), ("United Kingdom", "Europe", 69, "EN", ""),
 ("France", "Europe", 66, "fr", ""), ("Italy", "Europe", 59, "it", ""), ("Spain", "Europe", 48, "es", ""),
 ("Poland", "Europe", 38, "pl", ""), ("Ukraine", "Europe", 38, "uk", ""), ("Romania", "Europe", 19, "ro", ""),
 ("Netherlands", "Europe", 18, "nl", "en"), ("Belgium", "Europe", 11.8, "nl fr de", ""), ("Sweden", "Europe", 10.6, "sv", "en"),
 ("Czechia", "Europe", 10.7, "cs", ""), ("Greece", "Europe", 10.3, "el", ""), ("Portugal", "Europe", 10.4, "pt", ""),
 ("Hungary", "Europe", 9.6, "hu", ""), ("Belarus", "Europe", 9, "ru", ""), ("Austria", "Europe", 9.1, "de", ""),
 ("Switzerland", "Europe", 8.9, "de fr it", ""), ("Serbia", "Europe", 6.6, "hr", ""), ("Bulgaria", "Europe", 6.4, "bg", ""),
 ("Denmark", "Europe", 6, "da", "en"), ("Finland", "Europe", 5.6, "fi sv", "en"), ("Slovakia", "Europe", 5.5, "", "cs"),
 ("Norway", "Europe", 5.6, "nb", "en"), ("Ireland", "Europe", 5.3, "EN", ""), ("Croatia", "Europe", 3.9, "hr", ""),
 ("Georgia", "Europe", 3.8, "", "ru"), ("Bosnia and Herzegovina", "Europe", 3.2, "hr", ""), ("Moldova", "Europe", 2.4, "ro", "ru"),
 ("Albania", "Europe", 2.8, "", "it"), ("Armenia", "Europe", 3, "", "ru"), ("Azerbaijan", "Europe", 10.3, "", "ru tr"),
 ("Lithuania", "Europe", 2.9, "", "EN"), ("Slovenia", "Europe", 2.1, "", ""), ("North Macedonia", "Europe", 1.8, "", "bg hr"),
 ("Latvia", "Europe", 1.9, "", "EN"), ("Estonia", "Europe", 1.4, "", "EN"), ("Cyprus", "Europe", 1.4, "el tr", "en"),
 ("Luxembourg", "Europe", 0.7, "fr de", ""), ("Montenegro", "Europe", 0.6, "hr", ""), ("Malta", "Europe", 0.5, "en", "it"),
 ("Iceland", "Europe", 0.4, "", "da en"), ("Andorra, Monaco, San Marino, Liechtenstein", "Europe", 0.2, "es fr it de", ""),
 # Middle East
 ("Iran", "Middle East", 91, "fa", ""), ("Turkey", "Middle East", 87, "tr", ""), ("Iraq", "Middle East", 46, "ar", ""),
 ("Saudi Arabia", "Middle East", 34, "ar", "en"), ("Yemen", "Middle East", 40, "ar", ""), ("Syria", "Middle East", 24, "ar", ""),
 ("Jordan", "Middle East", 11.5, "ar", ""), ("United Arab Emirates", "Middle East", 11, "ar", "en"), ("Israel", "Middle East", 9.9, "he ar", "en"),
 ("Palestine", "Middle East", 5.5, "ar", ""), ("Lebanon", "Middle East", 5.8, "ar", "fr en"), ("Oman", "Middle East", 5.3, "ar", "en"),
 ("Kuwait", "Middle East", 4.9, "ar", "en"), ("Qatar", "Middle East", 3, "ar", "en"), ("Bahrain", "Middle East", 1.6, "ar", "en"),
 # Oceania
 ("Australia", "Oceania", 27, "EN", ""), ("New Zealand", "Oceania", 5.2, "EN", ""), ("Fiji", "Oceania", 0.9, "en", ""),
 ("Solomon Islands", "Oceania", 0.8, "en", ""), ("New Caledonia and French Polynesia", "Oceania", 0.6, "fr", ""),
 ("Other Pacific islands", "Oceania", 1.6, "en", ""),
]

WORLD = 8160  # 2024, millions


def covered(langs, app):
    return any(l in app  for l in langs.split())


def report(app, label):
    print(f"\n=== {label} ===")
    regions = {}
    tot = {"app": [0, 0], "wide": [0, 0], "en": [0, 0], "none": [0, 0]}
    for name, reg, pop, main, wide in C:
        r = regions.setdefault(reg, {"app": [0, 0], "wide": [0, 0], "en": [0, 0], "none": [0, 0], "all": [0, 0], "missing": []})
        if covered(main, app):
            k = "app"
        elif covered(wide, app):
            k = "wide"
        elif "en" in main.split():
            k = "en"
        else:
            k = "none"
            r["missing"].append((pop, name))
        for d in (r[k], tot[k], r["all"]):
            d[0] += 1
            d[1] += pop
    listed = sum(p for _, _, p, _, _ in C)
    print(f"countries listed {len(C)}, population listed {listed:.0f} M of {WORLD} M")
    a, w, e, n = tot["app"], tot["wide"], tot["en"], tot["none"]
    print(f"a PhraseBook language (English included) is official/main: {a[0]} countries, {a[1]/1000:.2f} bn ({a[1]/WORLD:.0%})")
    print(f"+ widely understood: {a[0]+w[0]} countries, {(a[1]+w[1])/1000:.2f} bn ({(a[1]+w[1])/WORLD:.0%})")
    print(f"+ English is official: {a[0]+w[0]+e[0]} countries, {(a[1]+w[1]+e[1])/1000:.2f} bn ({(a[1]+w[1]+e[1])/WORLD:.0%})")
    print(f"not covered: {n[0]} countries, {n[1]/1000:.2f} bn")
    for reg, r in regions.items():
        allp = r["all"][1]
        print(f"  {reg:12} app {r['app'][0]:3}/{r['all'][0]:3} countries, {r['app'][1]/allp:.0%} of people; "
              f"+wide {(r['app'][1]+r['wide'][1])/allp:.0%}; +English {(r['app'][1]+r['wide'][1]+r['en'][1])/allp:.0%}; "
              f"missing: {', '.join(n for p, n in sorted(r['missing'], reverse=True)[:5])}")


report(APP, "PhraseBook's languages, for an English speaker")
