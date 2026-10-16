// MediaPipe wrapper: hands (21 landmarks each) + face box → normalized, mirrored
// coordinates and a per-hand pose label. Everything downstream is library-agnostic,
// so swapping in Azure Kinect / another tracker later only touches this file.
import { TUNE } from './tune.js';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

export class Tracker {
  constructor(video) { this.video = video; this.hand = null; this.face = null; this.prev = []; this.lastT = -1; this.frame = 0; this.head = null; this.delegate = null; this.fps = 0; this._fpsT = 0; this._fpsN = 0; }

  async start({ hands = true, face = true, facing = 'user' } = {}) {
    const vis = await import('@mediapipe/tasks-vision');
    const files = await vis.FilesetResolver.forVisionTasks(WASM);
    const make = async (delegate) => {
      if (hands) this.hand = await vis.HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .5, minHandPresenceConfidence: .5, minTrackingConfidence: .5 });
      if (face) this.face = await vis.FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: 'VIDEO', minDetectionConfidence: .5 });
      this.delegate = delegate;
    };
    try { await make('GPU'); } catch (e) { console.warn('GPU delegate failed, falling back to CPU', e); await make('CPU'); }
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: facing }, audio: false });
    this.video.srcObject = stream; await this.video.play();
    return this;
  }

  stop() { this.video.srcObject?.getTracks().forEach(t => t.stop()); this.video.srcObject = null; }

  // Returns {hands:[...], head:{x,y,w}|null, aspect} or null when there is no new video frame.
  // Hand fields: lm (mirrored normalized landmarks), pose ('point'|'pinch'|'fist'|'open'|'other'),
  // pinchDist and palm are measured in aspect-corrected units (frame height = 1) so hand rotation
  // and video aspect don't change them; tip/center are normalized 0..1 like lm.
  read(now) {
    const v = this.video;
    if (v.readyState < 2 || v.currentTime === this.lastT) return null;
    this.lastT = v.currentTime; this.frame++;
    if (now - this._fpsT > 1000) { this.fps = this._fpsN; this._fpsN = 0; this._fpsT = now; } this._fpsN++;
    const ar = (v.videoWidth / v.videoHeight) || (16 / 9);
    const dist = (a, b) => Math.hypot((a.x - b.x) * ar, a.y - b.y);
    const hands = [];
    if (this.hand) {
      const res = this.hand.detectForVideo(v, now);
      (res.landmarks || []).forEach((raw, i) => {
        const lm = raw.map(p => ({ x: 1 - p.x, y: p.y, z: p.z }));   // mirror so it matches the viewer
        const palm = dist(lm[0], lm[9]) + 1e-6;                      // wrist → middle finger MCP
        if (palm < TUNE.minPalm) return;                              // too far away / spurious
        const curl = [[8, 6], [12, 10], [16, 14], [20, 18]].map(([tip, pip]) => dist(lm[tip], lm[0]) / (dist(lm[pip], lm[0]) + 1e-6));   // >1 = straight, <1 = curled into the palm
        const extd = curl.map(r => r > TUNE.extRatio);
        const nExt = extd.filter(Boolean).length;
        const pinchDist = dist(lm[4], lm[8]) / palm;
        const label = res.handednesses?.[i]?.[0]?.categoryName === 'Left' ? 'Right' : 'Left'; // mirrored
        // continuity: match the previous frame's hand by position, not by the (flaky) handedness label
        let prev = null, best = .12;
        for (const p of this.prev) { const d = dist(p.center, lm[9]); if (d < best) { best = d; prev = p; } }
        // pinch = thumb and index tips together, but not with the index curled all the way back (that is a fist)
        const pinch = pinchDist < (prev?.pinch ? TUNE.pinchOff : TUNE.pinchOn) && curl[0] > TUNE.pinchCurl;
        let pose = 'other';
        if (pinch) pose = 'pinch';
        else if (nExt === 0) pose = 'fist';
        else if (extd[0] && !extd[1] && !extd[2] && !extd[3]) pose = 'point';
        else if (nExt >= 3) pose = 'open';
        // cursor anchor: fingertip when pointing, otherwise the palm center so pose changes don't jump the cursor
        const tip = pose === 'point' ? lm[8] : lm[9];
        hands.push({ lm, label, pose, pinch, pinchDist, palm, nExt, ext: extd, curl, tip, center: lm[9], t: now });
      });
    }
    this.prev = hands;
    if (this.face && this.frame % 2 === 0) {
      const f = this.face.detectForVideo(v, now).detections?.[0];
      if (f) { const b = f.boundingBox; this.head = { x: 1 - (b.originX + b.width / 2) / v.videoWidth, y: (b.originY + b.height / 2) / v.videoHeight, w: b.width / v.videoWidth }; }
      else this.head = null;
    }
    return { hands, head: this.head, aspect: ar };
  }
}

// Draw hand skeletons, face box and a numeric readout into the picture-in-picture canvas.
// Coordinates are already mirrored, matching the CSS-mirrored video underneath.
const CONN = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const COL = { pinch: 'rgba(255,180,92,.95)', fist: 'rgba(179,136,255,.95)', point: 'rgba(255,255,255,.95)', open: 'rgba(95,232,255,.9)', other: 'rgba(120,140,160,.8)' };
export function drawDebug(ctx, w, h, frame, extra = {}) {
  ctx.clearRect(0, 0, w, h); if (!frame) return;
  const u = w / 640;                                   // scale everything with the canvas so it reads at any PiP size
  ctx.lineWidth = 2 * u;
  for (const hd of frame.hands) {
    ctx.strokeStyle = COL[hd.pose] || COL.other;
    ctx.beginPath(); for (const [a, b] of CONN) { ctx.moveTo(hd.lm[a].x * w, hd.lm[a].y * h); ctx.lineTo(hd.lm[b].x * w, hd.lm[b].y * h); } ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(hd.tip.x * w, hd.tip.y * h, 6 * u, 0, 6.283); ctx.fill();
    // thumb–index pinch line, coloured by how close it is to the threshold
    ctx.strokeStyle = hd.pinch ? COL.pinch : 'rgba(255,255,255,.35)'; ctx.setLineDash([4 * u, 4 * u]);
    ctx.beginPath(); ctx.moveTo(hd.lm[4].x * w, hd.lm[4].y * h); ctx.lineTo(hd.lm[8].x * w, hd.lm[8].y * h); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = `${13 * u}px "Share Tech Mono", monospace`; ctx.fillStyle = COL[hd.pose] || COL.other;
    ctx.fillText(hd.pose, hd.lm[0].x * w - 14 * u, hd.lm[0].y * h + 18 * u);
  }
  if (frame.head) { const f = frame.head; ctx.strokeStyle = 'rgba(95,232,255,.5)'; ctx.lineWidth = 1.5 * u; const bw = f.w * w; ctx.strokeRect(f.x * w - bw / 2, f.y * h - bw * .65, bw, bw * 1.3); }
  // readout panel
  const lines = [];
  for (const hd of frame.hands) lines.push(`${hd.label[0]} ${hd.pose.padEnd(5)} pinch ${hd.pinchDist.toFixed(2)}/${(hd.pinch ? TUNE.pinchOff : TUNE.pinchOn).toFixed(2)} palm ${hd.palm.toFixed(3)} curl ${hd.curl.map(r => r.toFixed(2)).join(' ')}`);
  if (!frame.hands.length) lines.push('no hands');
  if (frame.head) lines.push(`head ${frame.head.x.toFixed(2)},${frame.head.y.toFixed(2)} w ${frame.head.w.toFixed(2)}`);
  if (extra.push) lines.push(`push ${extra.push.toFixed(2)}/${TUNE.pushRatio}  vx ${Math.round(extra.vx || 0)}  dwell ${(extra.dwell || 0).toFixed(2)}`);
  if (extra.fps != null) lines.push(`${extra.fps} fps · ${extra.delegate || ''}`);
  ctx.font = `${12 * u}px "Share Tech Mono", monospace`;
  const lh = 15 * u, pw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 12 * u;
  ctx.fillStyle = 'rgba(5,8,13,.72)'; ctx.fillRect(0, 0, pw, lines.length * lh + 8 * u);
  ctx.fillStyle = '#dbeaf5'; lines.forEach((l, i) => ctx.fillText(l, 6 * u, (i + 1) * lh));
}
