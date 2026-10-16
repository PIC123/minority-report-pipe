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

Mouse: drag to grab, click to open, wheel to scroll, ctrl+wheel to zoom, mouse position stands in for the head. Keys: `←` `→` `Esc` `f`, `t` for the tuning panel.

### Tuning the feel

Every threshold lives in `src/tune.js` (pose classification, pinch hysteresis, cursor gain and smoothing, dwell time and radius, flick speed, push ratio, head gain). Press `t` or the **Tune** button for sliders that change them live; values persist in `localStorage` and can be forced from the URL (`?pinchOn=0.28&dwellMs=500`). When a set feels right, **copy** prints the changed values as JSON — paste them into the defaults in `tune.js`.

The mirror view (click it to enlarge) draws the hand skeleton, the thumb–index pinch line and a readout per hand: pose, `pinch` distance against the active threshold, `palm` size, and per-finger `curl` ratios (>1 straight, <1 curled), plus push ratio, cursor velocity, dwell progress and tracker fps. All of it is also available from the console as `__portal.snapshot()`.

Hand metrics are measured in aspect-corrected units (frame height = 1), so rotating the hand or changing the camera resolution does not change pinch or palm numbers.

Touch (phones/tablets): swipe, tap, two-finger pinch, swipe down to close. Device tilt stands in for the head until you tap **Head tracking** (front camera, face only).

## Content

Everything lives in `data/timeline.json`. Each entry:

```json
{"id":"tangible-bits","year":1997,"title":"Tangible Bits","group":"Tangible Media · Ishii","hue":150,
 "blurb":"...", "img":"assets/img/tangible-bits.jpg", "depth":"assets/depth/tangible-bits.png",
 "depthScale":0.35, "splat":"assets/splats/tangible-bits.ksplat"}
```

`img`/`depth` default to `assets/img/<id>.jpg` and `assets/depth/<id>.png`. `splat` is optional; if set, the memory opens as a Gaussian splat instead of a depth-displaced photo. The splat is auto-fitted into the window from its (2–98 percentile) bounds; `splatFit` (default 0.9, fraction of the window it fills), `splatScale` (extra multiplier), `splatPosition` (px offset) and `splatRotation` (quaternion `[x,y,z,w]`, default `[1,0,0,0]` = 180° about X because most scans come out y-down) tune placement. `tools/splat-check.html?file=…&rot=…&fit=…` is a bare viewer for finding those values, and `index.html?splat=assets/splats/nike.splat` appends a throwaway card so a splat can be tried in the real UI without editing the content. `credit` is shown nowhere yet but keeps the image attribution with the entry.

The 22 shipped entries were checked against MIT News, media.mit.edu and group pages (each entry carries a `source` URL). Photos are freely licensed (CC BY / CC BY-SA / public domain, mostly from Wikimedia Commons) and listed with author and license in `CREDITS.md`; the `credit` line is shown under the blurb when a memory is open, which CC BY requires. Four milestones (Put-That-There, Things That Think, inFORM, AlterEgo) have no freely licensed photo, so they ship with a typographic placeholder card that says so: drop the Lab's own archive image at `assets/img/<id>.jpg` and rerun the depth script. Photo dates often differ from the milestone year (the people portraits especially); `CREDITS.md` states each one.

### Real photos → depth maps

```
pip install torch transformers pillow
python3 tools/make_depth.py assets/img/*.jpg
```

Uses Depth Anything V2 (small) on CPU, a couple of seconds per image after a one-off model download. The shipped depth maps were made this way. Bigger `depthScale` = deeper window; 0.3–0.5 looks right for most photos, lower for flat ones (screenshots, the placeholder cards).

### Splats

Capture with Polycam / Luma / Scaniverse / Nerfstudio, export `.ply`, then convert to `.ksplat` for faster loading with the converter in `@mkkellogg/gaussian-splats-3d`. Keep each under ~30 MB for the web. `assets/splats/nike.splat` (8.7 MB, from the `cakewalk/splat-data` set on Hugging Face) is the reference file the path was exercised with. Two things learned the hard way, both handled in `memory.js`: the fit scale must be baked into the splat scene's transform (scaling a parent `Object3D` draws nothing), and `gpuAcceleratedSort` must stay off in 0.4.6 (it never uploads centers to the sort worker and draws 0 splats).

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
tools/              placeholder generator, depth-map script, splat-check viewer, headless checks
```

`tools/headless/` drives the page in headless Chromium with a fake webcam (MediaPipe's own hand photos) and with synthetic frames straight into the gesture engine, so the camera path can be regression-tested without a camera. See its README.

## Toward the projector wall

For the three-projector TouchDesigner version: run this page fullscreen in a TD Web Render TOP (or a kiosk Chrome window spanning the blended output), and replace `tracker.js` with an OSC/WebSocket feed from the Azure Kinect body tracking. The gesture engine only needs hand tip positions, a pose label and a head position per frame.

## Deploy

Push to `main`; the GitHub Actions workflow publishes to GitHub Pages. Enable Pages → Source: GitHub Actions in the repo settings once.
