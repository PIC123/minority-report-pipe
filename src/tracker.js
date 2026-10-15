// MediaPipe wrapper: hands (21 landmarks each) + face box → normalized, mirrored
// coordinates and a per-hand pose label. Everything downstream is library-agnostic,
// so swapping in Azure Kinect / another tracker later only touches this file.
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Tracker {
  constructor(video) { this.video = video; this.hand = null; this.face = null; this.prev = []; this.lastT = -1; this.frame = 0; this.head = null; }

  async start({ hands = true, face = true, facing = 'user' } = {}) {
    const vis = await import('@mediapipe/tasks-vision');
    const files = await vis.FilesetResolver.forVisionTasks(WASM);
    const make = async (delegate) => {
      if (hands) this.hand = await vis.HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .5, minTrackingConfidence: .5 });
      if (face) this.face = await vis.FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: 'VIDEO', minDetectionConfidence: .5 });
    };
    try { await make('GPU'); } catch (e) { console.warn('GPU delegate failed, falling back to CPU', e); await make('CPU'); }
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: facing }, audio: false });
    this.video.srcObject = stream; await this.video.play();
    return this;
  }

  stop() { this.video.srcObject?.getTracks().forEach(t => t.stop()); this.video.srcObject = null; }

  // Returns {hands:[...], head:{x,y,w}|null} or null when there is no new video frame.
  read(now) {
    const v = this.video;
    if (v.readyState < 2 || v.currentTime === this.lastT) return null;
    this.lastT = v.currentTime; this.frame++;
    const hands = [];
    if (this.hand) {
      const res = this.hand.detectForVideo(v, now);
      (res.landmarks || []).forEach((raw, i) => {
        const lm = raw.map(p => ({ x: 1 - p.x, y: p.y, z: p.z }));   // mirror so it matches the viewer
        const palm = dist(lm[0], lm[9]) + 1e-6;
        const ext = [[8, 6], [12, 10], [16, 14], [20, 18]].map(([tip, pip]) => dist(lm[tip], lm[0]) > dist(lm[pip], lm[0]) * 1.12);
        const nExt = ext.filter(Boolean).length;
        const pinchDist = dist(lm[4], lm[8]) / palm;
        const label = res.handednesses?.[i]?.[0]?.categoryName === 'Left' ? 'Right' : 'Left'; // mirrored
        const prev = this.prev.find(h => h.label === label);
        const pinch = pinchDist < (prev?.pinch ? 0.45 : 0.32);
        let pose = 'other';
        if (pinch) pose = 'pinch';
        else if (nExt === 0) pose = 'fist';
        else if (ext[0] && !ext[1] && !ext[2] && !ext[3]) pose = 'point';
        else if (nExt >= 4) pose = 'open';
        else if (nExt >= 3) pose = 'open';
        const tip = pose === 'pinch' ? { x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 } : pose === 'point' ? lm[8] : lm[9];
        const h = { lm, label, pose, pinch, pinchDist, palm, tip, center: lm[9], t: now };
        // light smoothing against the previous frame of the same hand
        if (prev) { const k = .55; h.tip = { x: prev.tip.x + (tip.x - prev.tip.x) * k, y: prev.tip.y + (tip.y - prev.tip.y) * k }; }
        hands.push(h);
      });
    }
    this.prev = hands;
    if (this.face && this.frame % 2 === 0) {
      const f = this.face.detectForVideo(v, now).detections?.[0];
      if (f) { const b = f.boundingBox; this.head = { x: 1 - (b.originX + b.width / 2) / v.videoWidth, y: (b.originY + b.height / 2) / v.videoHeight, w: b.width / v.videoWidth }; }
      else this.head = null;
    }
    return { hands, head: this.head };
  }
}

// Draw hand skeletons + face box into the picture-in-picture canvas (expects a mirrored canvas transform already applied by CSS on the video; we draw mirrored too).
const CONN = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
export function drawDebug(ctx, w, h, frame) {
  ctx.clearRect(0, 0, w, h); if (!frame) return;
  ctx.lineWidth = 3;
  for (const hd of frame.hands) {
    ctx.strokeStyle = hd.pose === 'pinch' ? 'rgba(255,180,92,.95)' : hd.pose === 'fist' ? 'rgba(179,136,255,.95)' : hd.pose === 'point' ? 'rgba(255,255,255,.95)' : 'rgba(95,232,255,.9)';
    ctx.beginPath(); for (const [a, b] of CONN) { ctx.moveTo(hd.lm[a].x * w, hd.lm[a].y * h); ctx.lineTo(hd.lm[b].x * w, hd.lm[b].y * h); } ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(hd.tip.x * w, hd.tip.y * h, 10, 0, 6.283); ctx.fill();
    ctx.font = '16px "Share Tech Mono", monospace'; ctx.fillText(hd.pose, hd.lm[0].x * w - 20, hd.lm[0].y * h + 24);
  }
  if (frame.head) { const f = frame.head; ctx.strokeStyle = 'rgba(95,232,255,.5)'; ctx.lineWidth = 2; const bw = f.w * w; ctx.strokeRect(f.x * w - bw / 2, f.y * h - bw * .65, bw, bw * 1.3); }
}
