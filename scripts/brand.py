"""Generate the KeyWitness brand SVGs: the mark, the wordmark logos and the
favicon. The wordmark is outlined from Atkinson Hyperlegible Next at weight
650, so the files render the same everywhere without the font installed.

    python scripts/brand.py

Needs fontTools (a design-time tool, not an app dependency) and the woff2 at
web/app/fonts/atkinson-next.woff2.
"""

import pathlib

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
FONT = WEB / "app" / "fonts" / "atkinson-next.woff2"

NAVY = "#0e1a2b"
IVORY = "#f2ead8"
TEAL = "#2fb7a1"


def mark_body(line: str, accent: str) -> str:
    """The mark on a 64 by 64 grid: a doorway arch on a threshold, and a
    keyhole whose slot turns up into a check (the witness mark)."""
    return (
        f'<path d="M19 51 V27 A13 13 0 0 1 45 27 V51" fill="none" stroke="{line}" stroke-width="3.6" '
        f'stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="M13.5 51.5 H50.5" stroke="{line}" stroke-width="3.6" stroke-linecap="round"/>'
        f'<circle cx="30.6" cy="26.4" r="5.6" fill="{accent}"/>'
        f'<path d="M30.6 29.5 V42.2 L39.8 32.6" fill="none" stroke="{accent}" stroke-width="4.4" '
        f'stroke-linecap="round" stroke-linejoin="round"/>'
    )


def tile(x: float = 0, y: float = 0) -> str:
    return (f'<g transform="translate({x} {y})"><rect width="64" height="64" rx="14" fill="{NAVY}"/>'
            f'{mark_body(IVORY, TEAL)}</g>')


def wordmark(text: str, size: float, fill: str) -> tuple:
    font = TTFont(str(FONT))
    if "fvar" in font:
        font = instantiateVariableFont(font, {"wght": 650})
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upem = font["head"].unitsPerEm
    scale = size / upem
    x = 0.0
    paths = []
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))
        d = pen.getCommands()
        if d:
            paths.append(d)
        x += glyphs[name].width * scale
    return f'<path fill="{fill}" d="{" ".join(paths)}"/>', x


def svg(width: float, height: float, body: str, title: str) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {height:.0f}" '
            f'width="{width:.0f}" height="{height:.0f}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{body}</svg>\n')


def main():
    out = WEB / "public" / "brand"
    out.mkdir(parents=True, exist_ok=True)
    mark = svg(64, 64, tile(), "KeyWitness")
    (out / "keywitness-mark.svg").write_text(mark, encoding="ascii", newline="\n")
    (WEB / "public" / "favicon.svg").write_text(mark, encoding="ascii", newline="\n")
    (WEB / "app" / "icon.svg").write_text(mark, encoding="ascii", newline="\n")
    line = svg(64, 64, mark_body(NAVY, TEAL), "KeyWitness")
    (out / "keywitness-mark-line.svg").write_text(line, encoding="ascii", newline="\n")
    for name, fill in (("keywitness-logo.svg", NAVY), ("keywitness-logo-reverse.svg", IVORY)):
        word, width = wordmark("KeyWitness", 34, fill)
        body = tile() + f'<g transform="translate(80 44)">{word}</g>'
        (out / name).write_text(svg(80 + width + 4, 64, body, "KeyWitness"), encoding="ascii", newline="\n")
    print("wrote", ", ".join(p.name for p in sorted(out.iterdir())), "and the favicon")


if __name__ == "__main__":
    main()
