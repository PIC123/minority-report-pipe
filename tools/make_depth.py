#!/usr/bin/env python3
"""Make depth maps for real photos with Depth Anything V2 (runs on CPU, ~2s/image).

  pip install torch transformers pillow
  python3 tools/make_depth.py assets/img/*.jpg

Writes assets/depth/<name>.png (8-bit, white = near). Then set "depth" in
data/timeline.json, or leave it out and the app will look for the matching
filename automatically.
"""
import sys, pathlib
from PIL import Image

def main(paths):
    from transformers import pipeline
    pipe = pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Small-hf")
    out = pathlib.Path("assets/depth"); out.mkdir(parents=True, exist_ok=True)
    for p in paths:
        p = pathlib.Path(p)
        img = Image.open(p).convert("RGB")
        depth = pipe(img)["depth"]            # PIL image, near = bright
        depth = depth.resize(img.size)
        dst = out / (p.stem + ".png")
        depth.save(dst); print("wrote", dst)

if __name__ == "__main__":
    if len(sys.argv) < 2: print(__doc__); sys.exit(1)
    main(sys.argv[1:])
