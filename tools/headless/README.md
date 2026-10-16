# Headless checks (no webcam needed)

Playwright + Chromium drive the page with a fake camera so the tracking path can be
exercised on a machine with no webcam, in CI, or inside a container.

```
npm i -g playwright && npx playwright install chromium    # once
python3 -m http.server 8000                                # in the repo root
export NODE_PATH=$(npm root -g)

# load the page, click "Start camera", feed a looping clip as the webcam, print pose readouts
node tools/headless/run.js --url http://127.0.0.1:8000/ --camera --video hand.y4m --wait 12000 --shot out.png

# synthetic frames straight into the gesture engine: dwell-select, drag, flick, push, two-hand zoom
node tools/headless/gestures.js

# open a Gaussian splat through memory.js and report the viewer's state (slow under software GL; use a small viewport)
VW=800 VH=450 node tools/headless/splat.js '{"id":"x","year":2024,"title":"x","group":"x","splat":"assets/splats/nike.splat"}' 12000 splat.png

# phone layout
node tools/headless/run.js --mobile "iPhone 13" --shot phone.png
```

Make a fake-webcam clip from a still (Chromium wants y4m or mjpeg):

```
ffmpeg -loop 1 -i hand.jpg -t 3 -r 15 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -pix_fmt yuv420p hand.y4m
```

MediaPipe's own test photos work well: `https://storage.googleapis.com/mediapipe-assets/{fist,pointing_up,victory,thumb_up,right_hands}.jpg`.

Everything the scripts read comes from `window.__portal.snapshot()` in `src/main.js`, which is also handy in the browser console.
