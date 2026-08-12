#!/usr/bin/env python3
"""Generate the README artwork.

Ten SVGs — five assets in a light/dark pair — drawn from the same palette that
`src/app/globals.css` defines, so the README and the product cannot drift apart.

    python3 .github/assets/generate.py

Everything is plain SVG with system fonts. GitHub serves README images through
a proxy, so no external font, stylesheet or script would survive the trip.
"""

from pathlib import Path

OUT = Path(__file__).parent

FONT = (
    "Inter, 'Segoe UI Variable', 'Segoe UI', system-ui, -apple-system, "
    "'Helvetica Neue', Arial, sans-serif"
)
MONO = "'SF Mono', ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace"

# Semantic tokens, mirroring globals.css §2.2.
LIGHT = dict(
    name="light",
    canvas="#FFFFFF",
    surface="#F8F9FB",
    inset="#F0F1F5",
    border="#E1E4EA",
    hairline="#C7CCD6",
    text="#111827",
    subtext="#374151",
    muted="#6B7280",
    primary="#2F5DE8",
    primaryBright="#3D5AFE",
    primarySoft="#EAEFFD",
    accent="#0B7A73",
    accentBright="#0E9C93",
    accentSoft="#DEF3F1",
    danger="#B91C1C",
    dangerSoft="#FDECEC",
    chk1="#F0F1F5",
    chk2="#E4E7ED",
    glowA=("#3D5AFE", "0.10"),
    glowB=("#0E9C93", "0.09"),
)

DARK = dict(
    name="dark",
    canvas="#0B0D12",
    surface="#14171F",
    inset="#191D26",
    border="#1F2937",
    hairline="#374151",
    text="#F8F9FB",
    subtext="#E1E4EA",
    muted="#9AA1B0",
    primary="#6E90FF",
    primaryBright="#6E90FF",
    primarySoft="#161E33",
    accent="#2DD4C0",
    accentBright="#2DD4C0",
    accentSoft="#0F272A",
    danger="#F87171",
    dangerSoft="#2A1618",
    chk1="#191D26",
    chk2="#14171F",
    glowA=("#3D5AFE", "0.34"),
    glowB=("#0E9C93", "0.24"),
)


# ── primitives ──────────────────────────────────────────────────────────────


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def head(w, h, title, desc):
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"'
        f' width="{w}" height="{h}" role="img" aria-labelledby="ttl dsc">',
        f'  <title id="ttl">{esc(title)}</title>',
        f'  <desc id="dsc">{esc(desc)}</desc>',
    ]


def backdrop(w, h, p, rx=24):
    """Page-coloured card with a hairline edge and two soft brand glows."""
    ga, gaop = p["glowA"]
    gb, gbop = p["glowB"]
    return [
        "  <defs>",
        '    <radialGradient id="glowA" cx="0.5" cy="0.5" r="0.5">',
        f'      <stop offset="0%" stop-color="{ga}" stop-opacity="{gaop}"/>',
        f'      <stop offset="100%" stop-color="{ga}" stop-opacity="0"/>',
        "    </radialGradient>",
        '    <radialGradient id="glowB" cx="0.5" cy="0.5" r="0.5">',
        f'      <stop offset="0%" stop-color="{gb}" stop-opacity="{gbop}"/>',
        f'      <stop offset="100%" stop-color="{gb}" stop-opacity="0"/>',
        "    </radialGradient>",
        '    <clipPath id="frame">',
        f'      <rect x="0" y="0" width="{w}" height="{h}" rx="{rx}"/>',
        "    </clipPath>",
        "  </defs>",
        '  <g clip-path="url(#frame)">',
        f'    <rect width="{w}" height="{h}" fill="{p["canvas"]}"/>',
        # glow radius tracks the canvas, so a short band is not swamped by it
        f'    <circle cx="{w - 240}" cy="-40" r="{min(360, round(h * 1.5))}"'
        ' fill="url(#glowA)"/>',
        f'    <circle cx="140" cy="{h + 40}" r="{min(320, round(h * 1.3))}"'
        ' fill="url(#glowB)"/>',
        "  </g>",
        f'  <rect x="0.75" y="0.75" width="{w - 1.5}" height="{h - 1.5}" rx="{rx}"'
        f' fill="none" stroke="{p["border"]}" stroke-width="1.5"/>',
    ]


def text(x, y, s, size=14, fill="#000", weight=400, anchor="start", font=None,
         spacing=None, opacity=None):
    a = [f'x="{x}" y="{y}"', f'font-size="{size}"', f'fill="{fill}"']
    if weight != 400:
        a.append(f'font-weight="{weight}"')
    if anchor != "start":
        a.append(f'text-anchor="{anchor}"')
    if font:
        a.append(f'font-family="{font}"')
    if spacing:
        a.append(f'letter-spacing="{spacing}"')
    if opacity:
        a.append(f'opacity="{opacity}"')
    return f'  <text {" ".join(a)}>{esc(s)}</text>'


def rect(x, y, w, h, rx=0, fill="none", stroke=None, sw=1.5, dash=None, op=None):
    a = [f'x="{x}" y="{y}" width="{w}" height="{h}"']
    if rx:
        a.append(f'rx="{rx}"')
    a.append(f'fill="{fill}"')
    if stroke:
        a.append(f'stroke="{stroke}" stroke-width="{sw}"')
    if dash:
        a.append(f'stroke-dasharray="{dash}"')
    if op:
        a.append(f'opacity="{op}"')
    return f'  <rect {" ".join(a)}/>'


def line(x1, y1, x2, y2, stroke, sw=1.5, dash=None, cap="round"):
    a = [f'x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"',
         f'stroke="{stroke}" stroke-width="{sw}" stroke-linecap="{cap}"']
    if dash:
        a.append(f'stroke-dasharray="{dash}"')
    return f'  <line {" ".join(a)}/>'


def path(d, stroke=None, sw=1.5, fill="none", marker=None, dash=None, cap="round"):
    a = [f'd="{d}"', f'fill="{fill}"']
    if stroke:
        a.append(f'stroke="{stroke}" stroke-width="{sw}"'
                 f' stroke-linecap="{cap}" stroke-linejoin="round"')
    if dash:
        a.append(f'stroke-dasharray="{dash}"')
    if marker:
        a.append(f'marker-end="url(#{marker})"')
    return f'  <path {" ".join(a)}/>'


def circle(cx, cy, r, fill="none", stroke=None, sw=1.5, op=None):
    a = [f'cx="{cx}" cy="{cy}" r="{r}"', f'fill="{fill}"']
    if stroke:
        a.append(f'stroke="{stroke}" stroke-width="{sw}"')
    if op:
        a.append(f'opacity="{op}"')
    return f'  <circle {" ".join(a)}/>'


def marker(mid, color):
    return [
        f'    <marker id="{mid}" viewBox="0 0 10 8" refX="9" refY="4"'
        ' markerWidth="9" markerHeight="7" orient="auto-start-reverse">',
        f'      <path d="M0,0 L10,4 L0,8 z" fill="{color}"/>',
        "    </marker>",
    ]


def width_of(s, size, tracking=0.0):
    """Rough advance width for Inter-ish text — used only to size pills."""
    return len(s) * size * 0.56 + tracking * max(len(s) - 1, 0)


def pill(x, y, label, p, size=13, fill=None, stroke=None, color=None,
         weight=600, pad=15, h=32, font=None):
    w = round(width_of(label, size) + pad * 2)
    out = [rect(x, y, w, h, h // 2, fill or p["surface"],
                stroke or p["border"], 1.25)]
    out.append(text(x + w / 2, y + h / 2 + size * 0.36, label, size,
                    color or p["muted"], weight, "middle", font))
    return out, w


def eyebrow(x, y, label, p, color=None):
    return text(x, y, label.upper(), 11.5, color or p["muted"], 700,
                spacing="1.6")


def write(name, lines):
    body = "\n".join(lines) + "\n</svg>\n"
    (OUT / name).write_text(body, encoding="utf-8")
    print(f"  {name}  ({len(body)} bytes)")


# ── 1. hero ─────────────────────────────────────────────────────────────────


def hero(p):
    W, H = 1280, 440
    L = head(W, H, "PZGIF — GIF tools that never upload your file",
             "A GIF toolset that decodes, transforms and re-encodes entirely "
             "inside your own browser tab. Nothing is uploaded.")
    L += backdrop(W, H, p)

    # wordmark gradient + checkerboard for the preview tile
    L.insert(len(L) - 1, "  <defs>")
    L.insert(len(L) - 1,
             '    <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">')
    L.insert(len(L) - 1, f'      <stop offset="0%" stop-color="{p["primary"]}"/>')
    L.insert(len(L) - 1,
             f'      <stop offset="100%" stop-color="{p["accentBright"]}"/>')
    L.insert(len(L) - 1, "    </linearGradient>")
    L.insert(len(L) - 1,
             '    <pattern id="chk" width="16" height="16"'
             ' patternUnits="userSpaceOnUse">')
    L.insert(len(L) - 1, f'      <rect width="16" height="16" fill="{p["chk1"]}"/>')
    L.insert(len(L) - 1, f'      <rect width="8" height="8" fill="{p["chk2"]}"/>')
    L.insert(len(L) - 1,
             f'      <rect x="8" y="8" width="8" height="8" fill="{p["chk2"]}"/>')
    L.insert(len(L) - 1, "    </pattern>")
    L.insert(len(L) - 1, "  </defs>")

    # ── left column
    L.append(eyebrow(80, 98, "browser-native gif toolset", p, p["primary"]))
    L.append(f'  <text x="76" y="212" font-size="104" font-weight="800"'
             f' letter-spacing="-4.5" font-family="{FONT}">'
             f'<tspan fill="{p["text"]}">PZ</tspan>'
             f'<tspan fill="url(#mark)">GIF</tspan></text>')
    L.append(text(80, 262, "Nothing leaves your machine.", 27, p["text"], 650))
    L.append(text(80, 296, "Because nothing was ever sent.", 27, p["muted"], 400))

    x = 80
    for label in ("no upload", "no account", "no queue"):
        chip, w = pill(x, 336, label, p, 13.5, p["surface"], p["border"],
                       p["subtext"])
        L += chip
        x += w + 12

    # ── right column: a tab doing the work
    cx, cy, cw, ch = 744, 84, 456, 252
    L.append(rect(cx, cy, cw, ch, 18, p["surface"], p["border"], 1.5))
    L.append(line(cx, cy + 40, cx + cw, cy + 40, p["border"], 1.25, cap="butt"))
    for i, _ in enumerate(range(3)):
        L.append(circle(cx + 26 + i * 17, cy + 20, 4.5, p["hairline"]))
    L.append(rect(cx + 92, cy + 9, 232, 22, 11, p["inset"]))
    L.append(text(cx + 108, cy + 24.5, "pzgif.com/gif-compressor", 11.5,
                  p["muted"], 400, font=MONO))

    # preview tile
    px, py, pw, ph = cx + 26, cy + 66, 176, 112
    L.append(rect(px, py, pw, ph, 10, "url(#chk)", p["border"], 1.25))
    L.append(rect(px, py + ph - 26, pw, 26, 0, p["canvas"], op="0.82"))
    L.append(text(px + 12, py + ph - 9, "frame 82 / 120", 11, p["muted"], 500,
                  font=MONO))
    # a moving subject, drawn as three offset frames
    for i, opa in enumerate(("0.25", "0.5", "1")):
        L.append(circle(px + 52 + i * 30, py + 46, 13 - i * 1.5, p["primary"],
                        op=opa))

    # the numbers
    nx = cx + 226
    L.append(text(nx, cy + 84, "12.4 MB", 15, p["muted"], 500, font=MONO))
    L.append(line(nx, cy + 79, nx + 68, cy + 79, p["muted"], 1.25))
    L.append(text(nx, cy + 128, "3.1 MB", 34, p["accent"], 750))
    badge, _ = pill(nx, cy + 146, "−75%", p, 13, p["accentSoft"],
                    p["accentSoft"], p["accent"], 700, 12, 28)
    L += badge

    # real progress
    L.append(text(cx + 26, cy + 208, "encoding · gifski", 11.5, p["muted"],
                  500, font=MONO))
    L.append(text(cx + cw - 26, cy + 208, "68%", 11.5, p["accent"], 700, "end",
                  MONO))
    L.append(rect(cx + 26, cy + 220, cw - 52, 8, 4, p["inset"]))
    L.append(rect(cx + 26, cy + 220, round((cw - 52) * 0.68), 8, 4,
                  p["accentBright"]))

    # the promise, restated as a number
    L.append(circle(cx + 12, 384, 9, "none", p["accent"], 1.5))
    L.append(path(f"M {cx + 7},384 L {cx + 11},388 L {cx + 18},379",
                  p["accent"], 2))
    L.append(text(cx + 32, 389, "0 bytes uploaded", 15, p["accent"], 650,
                  font=MONO))
    return W, H, L


# ── 2. promise ──────────────────────────────────────────────────────────────


def promise(p):
    W, H = 1280, 372
    L = head(W, H, "Upload-based GIF sites versus PZGIF",
             "An upload-based site sends your whole file to its server. PZGIF "
             "keeps the file in the tab and never contacts a server.")
    L += backdrop(W, H, p)
    L.insert(len(L) - 1, "  <defs>")
    for m in (marker("aDanger", p["danger"]), marker("aAccent", p["accent"])):
        for ln in m:
            L.insert(len(L) - 1, ln)
    L.insert(len(L) - 1, "  </defs>")

    def cloud(x, y, s, color, sw=1.6):
        """A cloud outline whose bounding box is roughly 92×46 at s=1."""
        d = (f"M {x + 20 * s},{y + 44 * s} "
             f"a {17 * s},{17 * s} 0 0 1 {1 * s},{-33 * s} "
             f"a {23 * s},{23 * s} 0 0 1 {43 * s},{-5 * s} "
             f"a {15 * s},{15 * s} 0 0 1 {21 * s},{15 * s} "
             f"a {12 * s},{12 * s} 0 0 1 {-3 * s},{23 * s} z")
        return path(d, color, sw)

    panels = [
        dict(x=64, title="An upload-based GIF site", tone=p["border"],
             titleColor=p["muted"],
             bullets=["Their queue, their rate limit, their bad day.",
                      "A retention policy you have no way to audit."]),
        dict(x=680, title="PZGIF", tone=p["primary"], titleColor=p["text"],
             bullets=["Your device's memory is the only ceiling.",
                      "No copy to retain, so nothing to delete."]),
    ]
    for i, pan in enumerate(panels):
        x = pan["x"]
        L.append(rect(x, 56, 536, 260, 18, p["surface"], pan["tone"],
                      1.5 if i else 1.25))
        L.append(text(x + 28, 96, pan["title"], 19, pan["titleColor"], 700))
        for j, b in enumerate(pan["bullets"]):
            by = 250 + j * 30
            L.append(circle(x + 32, by - 5, 2.5, p["hairline"]))
            L.append(text(x + 46, by, b, 14.5, p["muted"], 450))

    # left illustration: file → cloud
    fx, fy = 96, 132
    L.append(path(f"M {fx},{fy} h 36 l 16,16 v 52 a 6,6 0 0 1 -6,6 h -46"
                  f" a 6,6 0 0 1 -6,-6 v -62 a 6,6 0 0 1 6,-6 z",
                  p["hairline"], 1.6, p["inset"]))
    L.append(path(f"M {fx + 36},{fy} v 16 h 16", p["hairline"], 1.6))
    L.append(text(fx + 26, fy + 96, "your file", 12, p["muted"], 600, "middle"))
    L.append(path(f"M {fx + 72},{fy + 42} C {fx + 116},{fy + 42}"
                  f" {fx + 132},{fy + 26} {fx + 176},{fy + 26}",
                  p["danger"], 1.8, marker="aDanger", dash="6 5"))
    L.append(text(fx + 124, fy + 16, "the whole file", 12, p["danger"], 650,
                  "middle"))
    L.append(cloud(fx + 190, fy - 14, 1.0, p["danger"]))
    L.append(text(fx + 236, fy + 74, "their server", 12, p["danger"], 600,
                  "middle"))

    # right illustration: tab keeps it, cloud never contacted
    tx, ty = 712, 128
    L.append(rect(tx, ty, 176, 92, 10, p["inset"], p["border"], 1.25))
    L.append(line(tx, ty + 24, tx + 176, ty + 24, p["border"], 1.25, cap="butt"))
    for k in range(3):
        L.append(circle(tx + 16 + k * 13, ty + 12, 3, p["hairline"]))
    L.append(rect(tx + 22, ty + 38, 132, 22, 6, p["accentSoft"]))
    L.append(text(tx + 88, ty + 53.5, "decode → encode", 11.5, p["accent"], 650,
                  "middle", MONO))
    L.append(rect(tx + 22, ty + 68, 132, 6, 3, p["surface"]))
    L.append(rect(tx + 22, ty + 68, 84, 6, 3, p["accentBright"]))
    L.append(text(tx + 88, ty + 108, "your tab", 12, p["accent"], 700, "middle"))
    L.append(path(f"M {tx + 196},{ty + 46} C {tx + 232},{ty + 46}"
                  f" {tx + 240},{ty + 22} {tx + 282},{ty + 22}",
                  p["hairline"], 1.6, dash="5 6"))
    L.append(cloud(tx + 296, ty - 8, 1.0, p["hairline"], 1.5))
    L.append(line(tx + 308, ty + 40, tx + 378, ty - 4, p["muted"], 2))
    L.append(text(tx + 342, ty + 70, "never contacted", 12, p["muted"], 600,
                  "middle"))

    # divider
    L.append(line(640, 84, 640, 156, p["border"], 1.25))
    L.append(line(640, 216, 640, 288, p["border"], 1.25))
    L.append(circle(640, 186, 21, p["canvas"], p["border"], 1.25))
    L.append(text(640, 190.5, "VS", 11.5, p["muted"], 800, "middle",
                  spacing="0.8"))
    return W, H, L


# ── 3. stats ────────────────────────────────────────────────────────────────


def stats(p):
    W, H = 1280, 138
    L = head(W, H, "PZGIF in three numbers",
             "Zero bytes leave the machine, nine tools share one engine, and "
             "all of it runs in a single Web Worker.")
    L += backdrop(W, H, p, rx=18)
    cells = [
        ("0", "bytes", "leave the machine, ever"),
        ("9", "tools", "plus a Discord preset cluster"),
        ("1", "worker", "the main thread never decodes a frame"),
    ]
    colw = W / 3
    for i, (num, unit, label) in enumerate(cells):
        cx = colw * i
        if i:
            L.append(line(cx, 30, cx, H - 30, p["border"], 1.25))
        L.append(text(cx + 48, 80, num, 50, p["accent"], 750))
        L.append(text(cx + 48 + width_of(num, 50) + 12, 80, unit, 20,
                      p["text"], 650))
        L.append(text(cx + 50, 106, label, 13.5, p["muted"], 450))
    return W, H, L


# ── 4. tools ────────────────────────────────────────────────────────────────


def glyph(kind, x, y, c, p):
    """A 22×22 mark drawn from (x, y) top-left."""
    g = []
    if kind == "compress":
        g.append(path(f"M {x + 2},{y + 6} L {x + 8},{y + 11} L {x + 2},{y + 16}", c, 1.8))
        g.append(path(f"M {x + 20},{y + 6} L {x + 14},{y + 11} L {x + 20},{y + 16}", c, 1.8))
        g.append(line(x + 11, y + 3, x + 11, y + 19, c, 1.8, dash="3 3"))
    elif kind == "resize":
        g.append(rect(x + 2, y + 2, 12, 12, 2, "none", c, 1.7))
        g.append(rect(x + 8, y + 8, 12, 12, 2, "none", c, 1.7, dash="3 2.5"))
    elif kind == "crop":
        g.append(path(f"M {x + 6},{y + 1} v 15 h 15", c, 1.8))
        g.append(path(f"M {x + 1},{y + 6} h 15 v 15", c, 1.8))
    elif kind == "speed":
        g.append(path(f"M {x + 3},{y + 5} L {x + 10},{y + 11} L {x + 3},{y + 17}", c, 1.8))
        g.append(path(f"M {x + 11},{y + 5} L {x + 18},{y + 11} L {x + 11},{y + 17}", c, 1.8))
    elif kind == "reverse":
        g.append(path(f"M {x + 4},{y + 13} a 7.5,7.5 0 1 1 3,5.5", c, 1.8))
        g.append(path(f"M {x + 1},{y + 7} L {x + 4},{y + 13.5} L {x + 10},{y + 10}",
                      c, 1.8))
    elif kind == "tofilm":  # gif → mp4: still frame out, play triangle in
        g.append(rect(x + 1, y + 6, 9, 10, 1.5, "none", c, 1.7))
        g.append(path(f"M {x + 12},{y + 11} h 4", c, 1.8))
        g.append(path(f"M {x + 15},{y + 5} l 6,6 l -6,6 z", c, 1.6, c))
    elif kind == "fromfilm":  # mp4 → gif: play triangle out, still frame in
        g.append(path(f"M {x + 1},{y + 5} l 6,6 l -6,6 z", c, 1.6, c))
        g.append(path(f"M {x + 9},{y + 11} h 4", c, 1.8))
        g.append(rect(x + 12, y + 6, 9, 10, 1.5, "none", c, 1.7))
    elif kind == "swap":
        g.append(rect(x + 1, y + 3, 11, 11, 2, "none", c, 1.7))
        g.append(rect(x + 10, y + 8, 11, 11, 2, p["surface"], c, 1.7))
    elif kind == "split":
        g.append(rect(x + 1, y + 6, 10, 10, 1.5, "none", c, 1.7))
        g.append(rect(x + 13, y + 2, 7, 7, 1.5, "none", c, 1.5))
        g.append(rect(x + 13, y + 13, 7, 7, 1.5, "none", c, 1.5))
    elif kind == "hub":
        for dx, dy in ((0, 0), (11, 0), (0, 11), (11, 11)):
            g.append(rect(x + 2 + dx, y + 2 + dy, 7, 7, 1.5, "none", c, 1.6))
    elif kind == "emoji":
        g.append(circle(x + 11, y + 11, 9, "none", c, 1.7))
        g.append(circle(x + 8, y + 9, 1.4, c))
        g.append(circle(x + 14, y + 9, 1.4, c))
        g.append(path(f"M {x + 7},{y + 14} a 5,4 0 0 0 8,0", c, 1.6))
    elif kind == "sticker":
        g.append(path(f"M {x + 2},{y + 4} a 2,2 0 0 1 2,-2 h 14 a 2,2 0 0 1 2,2"
                      f" v 9 l -7,7 h -9 a 2,2 0 0 1 -2,-2 z", c, 1.7))
        g.append(path(f"M {x + 20},{y + 13} h -5 a 2,2 0 0 0 -2,2 v 5", c, 1.6))
    elif kind == "banner":
        g.append(rect(x + 1, y + 6, 20, 10, 2, "none", c, 1.7))
        g.append(line(x + 4, y + 11, x + 12, y + 11, c, 1.5))
    elif kind == "avatar":
        g.append(circle(x + 11, y + 8, 4.5, "none", c, 1.7))
        g.append(path(f"M {x + 3},{y + 20} a 8,7 0 0 1 16,0", c, 1.7))
        g.append(circle(x + 11, y + 11, 10, "none", c, 1.3, op="0.45"))
    return g


def tools(p):
    W, H = 1280, 452
    L = head(W, H, "The nine PZGIF tools and the Discord preset cluster",
             "Edit: compressor, resize, crop, speed, reverse. Convert: MP4 to "
             "GIF, GIF to MP4, WebP to GIF, split to frames. Discord presets: "
             "hub, emoji, sticker, banner, avatar.")
    L += backdrop(W, H, p)

    groups = [
        (64, 376, "Edit", [
            ("compress", "GIF compressor", True),
            ("resize", "Resize GIF", True),
            ("crop", "Crop GIF", True),
            ("speed", "GIF speed changer", True),
            ("reverse", "Reverse GIF", True),
        ]),
        (464, 344, "Convert", [
            ("fromfilm", "MP4 → GIF", False),
            ("tofilm", "GIF → MP4", False),
            ("swap", "WebP → GIF", False),
            ("split", "Split to frames", False),
        ]),
        (840, 376, "Discord presets", [
            ("hub", "Preset hub", False),
            ("emoji", "Emoji", False),
            ("sticker", "Sticker", False),
            ("banner", "Banner", False),
            ("avatar", "Avatar", False),
        ]),
    ]

    for gx, gw, title, rows in groups:
        L.append(eyebrow(gx, 68, title, p, p["primary"]))
        L.append(text(gx + gw, 68, f"{len(rows)}", 12, p["muted"], 700, "end"))
        L.append(line(gx, 84, gx + gw, 84, p["border"], 1.25, cap="butt"))
        for i, (kind, label, live) in enumerate(rows):
            ry = 108 + i * 56
            col = p["text"] if live else p["muted"]
            tile = p["primarySoft"] if live else p["inset"]
            edge = p["primary"] if live else p["border"]
            L.append(rect(gx, ry, 40, 40, 11, tile, edge, 1.25))
            L += glyph(kind, gx + 9, ry + 9, p["primary"] if live else p["muted"], p)
            L.append(text(gx + 56, ry + 25, label, 16, col, 600 if live else 450))
            if live:
                L.append(circle(gx + gw - 8, ry + 20, 4.5, p["accentBright"]))
            else:
                L.append(circle(gx + gw - 8, ry + 20, 4.5, "none", p["hairline"], 1.5))

    ly = 418
    L.append(circle(70, ly - 4, 4.5, p["accentBright"]))
    L.append(text(84, ly, "live", 13, p["muted"], 600))
    L.append(circle(140, ly - 4, 4.5, "none", p["hairline"], 1.5))
    L.append(text(154, ly, "route defined, page not yet shipped", 13, p["muted"], 450))
    L.append(text(W - 64, ly, "src/lib/tools/registry.ts is the single source",
                  12.5, p["muted"], 450, "end", MONO))
    return W, H, L


# ── 5. engine ───────────────────────────────────────────────────────────────


def engine(p):
    W, H = 1280, 592
    L = head(W, H, "The PZGIF engine",
             "Video, animated GIF and animated WebP are decoded, handed to an "
             "OffscreenCanvas inside a Web Worker for resize, crop, speed, "
             "reverse and frame selection, then re-encoded by gifski-wasm, "
             "gifenc or a WebCodecs encoder.")
    L += backdrop(W, H, p)
    L.insert(len(L) - 1, "  <defs>")
    for ln in marker("aFlow", p["primary"]):
        L.insert(len(L) - 1, ln)
    for ln in marker("aOut", p["accent"]):
        L.insert(len(L) - 1, ln)
    L.insert(len(L) - 1, "  </defs>")

    cols = [64, 464, 864]
    cw = 352
    centres = [c + cw / 2 for c in cols]

    L.append(eyebrow(64, 52, "input", p, p["muted"]))
    sources = [
        ("Video file", "mediabunny demux → WebCodecs"),
        ("Animated GIF", "modern-gif — every browser"),
        ("Animated WebP", "ImageDecoder, where present"),
    ]
    for x, (title, sub) in zip(cols, sources):
        L.append(rect(x, 72, cw, 96, 14, p["surface"], p["border"], 1.25))
        L.append(text(x + 24, 110, title, 17, p["text"], 650))
        L.append(text(x + 24, 138, sub, 13, p["muted"], 450, font=MONO))
    for c in centres:
        L.append(path(f"M {c},168 L {c},242", p["primary"], 1.8, marker="aFlow"))
    L.append(text(centres[1] + 16, 212, "decoded frames", 12.5, p["primary"],
                  600))

    # the worker
    L.append(rect(64, 248, 1152, 148, 16, p["inset"], p["primary"], 1.5,
                  dash="7 6"))
    L.append(text(96, 288, "Web Worker · OffscreenCanvas", 19, p["text"], 700))
    L.append(text(96, 314, "The main thread never decodes a frame.", 14,
                  p["muted"], 450))
    x = 96
    for op in ("resize", "crop", "speed", "reverse", "frame select"):
        chip, w = pill(x, 338, op, p, 13, p["surface"], p["border"],
                       p["subtext"], 550, 14, 30)
        L += chip
        x += w + 10
    L.append(text(1184, 302, "gifski holds", 12.5, p["muted"], 450, "end", MONO))
    L.append(text(1184, 322, "frames × w × h × 4 × 2", 12.5, p["accent"], 650,
                  "end", MONO))
    L.append(text(1184, 342, "resident — so limits are", 12.5, p["muted"], 450,
                  "end", MONO))
    L.append(text(1184, 362, "computed, never guessed", 12.5, p["muted"], 450,
                  "end", MONO))

    for c in centres:
        L.append(path(f"M {c},396 L {c},452", p["accent"], 1.8, marker="aOut"))
    L.append(text(centres[1] + 16, 428, "RGBA frames", 12.5, p["accent"], 600))

    L.append(eyebrow(64, 440, "output", p, p["muted"]))
    outs = [
        ("gifski-wasm", "optimised GIF — the differentiator", True),
        ("gifenc", "live preview only", False),
        ("WebCodecs encoder", "MP4 · WebM", False),
    ]
    for x, (title, sub, hero_card) in zip(cols, outs):
        L.append(rect(x, 458, cw, 96, 14,
                      p["accentSoft"] if hero_card else p["surface"],
                      p["accent"] if hero_card else p["border"],
                      1.5 if hero_card else 1.25))
        L.append(text(x + 24, 496, title, 17,
                      p["accent"] if hero_card else p["text"], 650))
        L.append(text(x + 24, 524, sub, 13, p["muted"], 450, font=MONO))
    return W, H, L


# ── build ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    for maker in (hero, promise, stats, tools, engine):
        for palette in (LIGHT, DARK):
            w, h, lines = maker(palette)
            write(f"{maker.__name__}-{palette['name']}.svg", lines)
