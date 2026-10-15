#!/usr/bin/env python3
"""Generate placeholder artwork + depth maps for every entry in data/timeline.json
that has no image yet. Each image is a layered abstract scene (far / mid / near)
so the 2.5D memory view has real depth to show. Replace with real archive photos
and run tools/make_depth.py to get depth maps from them.

Usage: python3 tools/make_placeholders.py
"""
import json, math, random, pathlib
from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
W, H = 960, 600

def hsl(h, s, l):
    import colorsys
    r, g, b = colorsys.hls_to_rgb(h / 360, l, s)
    return (int(r * 255), int(g * 255), int(b * 255))

def scene(hue, seed):
    rnd = random.Random(seed)
    img = Image.new("RGB", (W, H), hsl(hue, .5, .05))
    dep = Image.new("L", (W, H), 20)            # 0 = far, 255 = near
    d = ImageDraw.Draw(img); dd = ImageDraw.Draw(dep)
    # far: horizon glow + grid
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=hsl(hue, .6, .04 + .12 * (1 - abs(t - .55) * 2) ** 2))
    for x in range(0, W, 48):
        d.line([(x, H * .55), (x + (x - W / 2) * .8, H)], fill=hsl(hue, .7, .18), width=1)
    for i in range(6):
        y = H * .55 + (i / 6) ** 2 * H * .45
        d.line([(0, y), (W, y)], fill=hsl(hue, .7, .18), width=1)
    # mid: large soft shapes
    for i in range(4):
        cx, cy = rnd.uniform(.1, .9) * W, rnd.uniform(.2, .7) * H
        r = rnd.uniform(60, 160)
        col = hsl((hue + rnd.uniform(-30, 30)) % 360, .8, rnd.uniform(.3, .5))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=3)
        dd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=90 + i * 15)
    # near: bold slabs + bright nodes
    for i in range(5):
        x = rnd.uniform(0, W); w = rnd.uniform(40, 140); y0 = rnd.uniform(H * .3, H)
        col = hsl((hue + rnd.uniform(-15, 15)) % 360, .9, .55)
        d.rectangle([x, y0, x + w, H], fill=hsl(hue, .6, .12), outline=col, width=2)
        dd.rectangle([x, y0, x + w, H], fill=170 + i * 12)
    for i in range(14):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H); r = rnd.uniform(2, 6)
        d.ellipse([x - r, y - r, x + r, y + r], fill=hsl(hue, 1, .85))
        dd.ellipse([x - r - 4, y - r - 4, x + r + 4, y + r + 4], fill=230)
    img = img.filter(ImageFilter.GaussianBlur(.6))
    dep = dep.filter(ImageFilter.GaussianBlur(2.5))
    return img, dep

def main():
    data = json.loads((ROOT / "data/timeline.json").read_text())
    (ROOT / "assets/img").mkdir(parents=True, exist_ok=True)
    (ROOT / "assets/depth").mkdir(parents=True, exist_ok=True)
    for i, e in enumerate(data["entries"]):
        slug = e["id"]
        ip, dp = ROOT / f"assets/img/{slug}.jpg", ROOT / f"assets/depth/{slug}.png"
        if ip.exists() and dp.exists():
            continue
        img, dep = scene(e.get("hue", 195), i * 7919)
        img.save(ip, quality=82); dep.save(dp)
        print("wrote", ip.name, dp.name)

if __name__ == "__main__":
    main()
