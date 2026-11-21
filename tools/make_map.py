"""Draw map.svg, the coverage map on the About page: python3 tools/make_map.py

Each country is colored by coverage.py's verdict for it (its own language is in PhraseBook, English included; a
PhraseBook language is widely understood there; English is official there; not yet), with the headline share and a
legend in the image itself, in English. Run it after adding a language (check_data.py says when it is out of date).
The shapes are Natural Earth's 1:110m countries (public domain), as TopoJSON in tools/world-110m.json.
"""
import contextlib
import io
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
with contextlib.redirect_stdout(io.StringIO()):  # coverage.py prints its report when loaded
    import coverage

# the map's names for countries that coverage.py names differently
ALIAS = {
    "United States of America": "United States", "Dem. Rep. Congo": "DR Congo", "Eq. Guinea": "Equatorial Guinea",
    "S. Sudan": "South Sudan", "Bosnia and Herz.": "Bosnia and Herzegovina", "Macedonia": "North Macedonia",
    "Solomon Is.": "Solomon Islands", "eSwatini": "Eswatini", "Vanuatu": "Other Pacific islands",
}
# shapes that coverage.py doesn't list on their own: the country they go with
WITH = {"W. Sahara": "Morocco", "N. Cyprus": "Turkey", "Somaliland": "Somalia", "Kosovo": "Serbia", "Palestine": "Israel",
        "Falkland Is.": "United Kingdom", "Fr. S. Antarctic Lands": "France", "New Caledonia": "France", "Puerto Rico": "United States",
        "Greenland": "Greenland"}


def statuses():
    out = {}
    for name, _, _, main, wide in coverage.C:
        k = "app" if coverage.covered(main, coverage.APP) else "wide" if coverage.covered(wide, coverage.APP) else "en" if "en" in main.split() else "none"
        out[name] = k
    return out


def share():
    """The headline: people living where a PhraseBook language, or English, is the everyday or an official language."""
    s = statuses()
    pop = {name: p for name, _, p, _, _ in coverage.C}
    reach = sum(pop[n] for n, k in s.items() if k != "none")
    own = sum(pop[n] for n, k in s.items() if k == "app")
    return reach / coverage.WORLD, own / coverage.WORLD


def project(lon, lat):
    """Natural Earth projection (Šavrič et al.), scaled to a 1000-wide frame."""
    p = math.radians(lat)
    l = math.radians(lon)
    p2 = p * p
    p4 = p2 * p2
    x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)))
    y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))
    return x, y


def main():
    topo = json.loads((ROOT / "tools" / "world-110m.json").read_text(encoding="utf-8"))
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:  # delta-encoded, quantized
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append(project(x * sx + tx, y * sy + ty))
        arcs.append(pts)
    # frame: the projected world, cropped below 58°S (no land worth showing there)
    xmin, xmax = project(-180, 0)[0], project(180, 0)[0]
    ytop, ybot = project(0, 84)[1], project(0, -58)[1]
    W = 1000
    k = W / (xmax - xmin)
    H = round((ytop - ybot) * k)
    pt = lambda p: (round((p[0] - xmin) * k), round((ytop - p[1]) * k))  # whole units: about a third of a pixel on a phone

    def ring(idx):
        pts = []
        for i in idx:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            pts += a if not pts else a[1:]
        out, last = [], None
        for p in map(pt, pts):  # drop points closer than about a pixel to the last one kept
            if last is None or abs(p[0] - last[0]) + abs(p[1] - last[1]) >= 2:
                out.append(p)
                last = p
        if len(out) < 3:
            return ""
        # a shape that crosses the 180° line jumps from one edge of the map to the other: lift the pen there
        d, prev = "", None
        for x, y in out:
            d += ("M" if prev is None or abs(x - prev[0]) > W / 2 else "L") + f"{x:g},{y:g}"
            prev = (x, y)
        return d + "Z"

    s = statuses()
    paths = {"app": [], "wide": [], "en": [], "none": []}
    unknown = []
    for g in topo["objects"]["countries"]["geometries"]:
        name = g["properties"]["name"]
        key = WITH.get(name, ALIAS.get(name, name))
        status = s.get(key)
        if status is None:
            unknown.append(name)
            status = "none"
        polys = [g["arcs"]] if g["type"] == "Polygon" else g["arcs"]
        paths[status] += [ring(r) for poly in polys for r in poly]
    if unknown:
        print("not in coverage.py (drawn as not yet):", ", ".join(unknown))
    reach, own = share()
    legend = [("app", "Their own language"), ("wide", "Widely understood"), ("en", "English is official"), ("none", "Not yet")]
    items = []
    for n, (cls, label) in enumerate(legend):  # two rows of two, big enough to read on a phone
        x, y = 24 + (n % 2) * 470, H + 144 + (n // 2) * 50
        items.append(f'<rect class="{cls}" x="{x}" y="{y - 28}" width="32" height="32" rx="7"/><text x="{x + 46}" y="{y}">{label}</text>')
    langs = " ".join(sorted(l["code"] for l in json.loads((ROOT / "languages.json").read_text(encoding="utf-8"))))
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" data-languages="{langs}" viewBox="0 0 {W} {H + 222}" role="img" aria-label="World map: PhraseBook has the words for {reach:.0%} of the world">
<title>PhraseBook has the words for {reach:.0%} of the world</title>
<style>
.app{{fill:#b3261e}}.wide{{fill:#e3958e}}.en{{fill:#7f93ab}}.none{{fill:#e2dbd3}}path{{stroke:#faf8f5;stroke-width:.8;stroke-linejoin:round}}
text{{font:32px -apple-system,system-ui,sans-serif;fill:#6b645e}}.big{{font-size:44px;font-weight:700;fill:#1d1b1a}}
@media (prefers-color-scheme:dark){{.app{{fill:#ff8a80}}.wide{{fill:#9c4e48}}.en{{fill:#5f7390}}.none{{fill:#3a3532}}path{{stroke:#161413}}text{{fill:#a39b94}}.big{{fill:#f1ece7}}}}
</style>
{"".join(f'<path class="{c}" d="{"".join(p)}"/>' for c, p in paths.items())}
<text class="big" x="24" y="{H + 40}">The words for {reach:.0%} of the world</text>
<text x="24" y="{H + 84}">{own:.0%} of people in their own language</text>
{"".join(items)}
</svg>
"""
    (ROOT / "map.svg").write_text(svg, encoding="utf-8")
    print(f"wrote map.svg: {len(svg) / 1000:.0f} KB, {reach:.0%} of the world ({own:.0%} in their own language)")


if __name__ == "__main__":
    main()
