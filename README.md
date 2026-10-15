# Portal Wall

A Minority Report-style wall for exploring 40 years of the MIT Media Lab. Memories float along a timeline at different depths; you grab, flick and stretch time with your hands, point at a memory to open it, and move your head to look *into* it. Runs entirely in the browser.

**Stack:** three.js (bloom post-processing) · MediaPipe Tasks Vision (hands + face) · optional Gaussian splats via `@mkkellogg/gaussian-splats-3d`. No build step: ES modules + an import map, served as static files.

## Run it

```
python3 -m http.server 8000      # any static server works
open http://localhost:8000
```

The camera needs a secure context: `localhost` is fine, so is GitHub Pages (`https`). On a phone you need the Pages URL, not a LAN IP.

Click **Start camera**, stand about an arm's length back, keep your hand inside the mirror view in the corner.

## Gestures

| Gesture | What it does |
|---|---|
| **Point** (index only) and hold ~0.6s | Open the memory under your finger. Point again anywhere to close. |
| **Pinch** or **fist** + move | Grab the timeline and drag it |
| **Open hand**, fast sideways sweep | Flick through the years with momentum |
| **Two hands** moving apart / together | Stretch or compress time (zoom) |
| **Palm push** toward the camera | Close the open memory |
| Head moves | Parallax. Subtle on the timeline, strong inside an open memory |
| While a memory is open: pinch-drag or flick | Previous / next memory |

Mouse: drag to grab, click to open, wheel to scroll, ctrl+wheel to zoom, mouse position stands in for the head. Keys: `←` `→` `Esc` `f`.

Touch (phones/tablets): swipe, tap, two-finger pinch, swipe down to close. Device tilt stands in for the head until you tap **Head tracking** (front camera, face only).

## Content

Everything lives in `data/timeline.json`. Each entry:

```json
{"id":"tangible-bits","year":1997,"title":"Tangible Bits","group":"Tangible Media · Ishii","hue":150,
 "blurb":"...", "img":"assets/img/tangible-bits.jpg", "depth":"assets/depth/tangible-bits.png",
 "depthScale":0.35, "splat":"assets/splats/tangible-bits.ksplat"}
```

`img`/`depth` default to `assets/img/<id>.jpg` and `assets/depth/<id>.png`. `splat` is optional; if set, the memory opens as a Gaussian splat instead of a depth-displaced photo (`splatPosition`/`splatRotation`/`splatScale` tune placement). `hue` only tints the placeholder art.

**The shipped entries are placeholders.** Dates, names and attributions were sketched quickly for the prototype and need checking against the Lab's own archive before anyone sees this.

### Real photos → depth maps

```
pip install torch transformers pillow
python3 tools/make_depth.py assets/img/*.jpg
```

Uses Depth Anything V2 (small) on CPU, a couple of seconds per image. Bigger `depthScale` = deeper window; 0.3–0.5 looks right for most photos, lower for flat ones.

### Splats

Capture with Polycam / Luma / Scaniverse / Nerfstudio, export `.ply`, then convert to `.ksplat` for faster loading with the converter in `@mkkellogg/gaussian-splats-3d`. Keep each under ~30 MB for the web. The splat path is wired but not yet exercised with a real file.

## Layout

```
index.html          page shell + import map
src/main.js         state, intent wiring, loop
src/scene.js        three.js timeline: cards, axis, particles, bloom
src/memory.js       open memory: depth mesh shader / splat, off-axis head camera
src/tracker.js      MediaPipe hands + face → poses (swap for Kinect here)
src/gestures.js     poses → intents (select, drag, flick, zoom, push)
src/input-touch.js  mouse / touch / tilt producing the same intents
src/hud.js          cursor, dwell ring, gesture flashes
data/timeline.json  content
tools/              placeholder generator, depth-map script
```

## Toward the projector wall

For the three-projector TouchDesigner version: run this page fullscreen in a TD Web Render TOP (or a kiosk Chrome window spanning the blended output), and replace `tracker.js` with an OSC/WebSocket feed from the Azure Kinect body tracking. The gesture engine only needs hand tip positions, a pose label and a head position per frame.

## Deploy

Push to `main`; the GitHub Actions workflow publishes to GitHub Pages. Enable Pages → Source: GitHub Actions in the repo settings once.
