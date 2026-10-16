// The "look into it" view. An opened memory becomes a depth-displaced mesh
// (photo + depth map) and the camera moves off-axis with the viewer's head, so
// the picture reads as a window with real depth. Entries with a `splat` field
// load a Gaussian splat instead (lazy-loaded library).
import * as THREE from 'three';

const VERT = `
uniform sampler2D depthMap; uniform float amount; uniform float reveal;
varying vec2 vUv; varying float vD;
void main(){
  vUv = uv; float d = texture2D(depthMap, uv).r; vD = d;
  vec3 p = position; p.z += (d - 0.5) * amount * reveal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FRAG = `
uniform sampler2D map; uniform float reveal; uniform float t;
varying vec2 vUv; varying float vD;
void main(){
  vec4 c = texture2D(map, vUv);
  // scanline shimmer while it resolves, then a faint depth haze toward the back
  float scan = 0.5 + 0.5 * sin((vUv.y * 180.0) - t * 6.0);
  vec3 col = mix(c.rgb, c.rgb * (0.6 + 0.8 * scan) + vec3(0.2, 0.6, 0.7) * (1.0 - reveal) * 0.35, 1.0 - reveal);
  col = mix(col, col * 0.78 + vec3(0.02, 0.06, 0.09), (1.0 - vD) * 0.45);
  float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(0.0, 0.06, 1.0 - vUv.x) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(0.0, 0.08, 1.0 - vUv.y);
  gl_FragColor = vec4(col, (0.25 + 0.75 * edge) * min(1.0, reveal * 3.0));
}`;

export class MemoryView {
  constructor(scene, loader) {
    this.scene = scene; this.loader = loader;
    this.group = new THREE.Group(); this.group.visible = false; scene.scene.add(this.group);
    this.entry = null; this.mesh = null; this.splat = null; this.t = 0; this.state = 'closed'; this.progress = 0; // 0 closed → 1 open
    this.from = new THREE.Vector3(); this.fromScale = 1;
    this.orbit = { x: 0, y: 0 };    // extra look offset from touch drag / device tilt (-1..1)
    this._buildFrame(); this._buildDust();
  }

  _buildFrame() {
    const m = new THREE.LineBasicMaterial({ color: new THREE.Color('#5fe8ff').multiplyScalar(1.3), transparent: true, opacity: .9 });
    this.frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), m); this.group.add(this.frame);
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const rg = g.createRadialGradient(128, 128, 20, 128, 128, 128); rg.addColorStop(0, 'rgba(95,232,255,1)'); rg.addColorStop(.6, 'rgba(95,232,255,.25)'); rg.addColorStop(1, 'rgba(95,232,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    const glow = new THREE.CanvasTexture(c);
    this.backplate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glow, color: '#5fe8ff', transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.backplate.position.z = -40; this.group.add(this.backplate);
  }
  _buildDust() {
    const N = 160, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - .5) * 1.4; pos[i * 3 + 1] = (Math.random() - .5) * 1.4; pos[i * 3 + 2] = Math.random() * 1.2 + .1; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: '#9ff3ff', size: 3, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    this.group.add(this.dust);
  }

  get isOpen() { return this.state !== 'closed'; }

  // entry: timeline entry; from: world-space position/scale of the card it grows out of
  async open(entry, from) {
    if (this.entry?.id === entry.id && this.state === 'open') return;
    this._dispose();
    const wasOpen = this.state === 'open' || this.state === 'opening';
    this.entry = entry; this.group.visible = true; this.revealT = 0;
    if (!wasOpen) { this.state = 'opening'; this.progress = 0; if (from) { this.from.copy(from.position); this.fromScale = from.scale; } else { this.from.set(0, 0, 0); this.fromScale = .3; } }
    else this.state = 'open';   // switching memories: stay in place, just re-reveal
    const W = this.scene.W, H = this.scene.H;
    const maxW = Math.min(W * .74, 1100), maxH = Math.min(H * .55, H - 330);   // leave room for the caption below
    if (entry.splat) { await this._openSplat(entry, maxW, maxH); return; }
    await this._openImage(entry, maxW, maxH);
  }

  async _openImage(entry, maxW, maxH) {
    const imgSrc = entry.img || `assets/img/${entry.id}.jpg`, depSrc = entry.depth || `assets/depth/${entry.id}.png`;
    const [map, depth] = await Promise.all([this._tex(imgSrc, true), this._tex(depSrc, false).catch(() => null)]);
    if (this.entry !== entry) return;                       // superseded
    const aspect = map.image.width / map.image.height;
    let w = maxW, h = w / aspect; if (h > maxH) { h = maxH; w = h * aspect; }
    this.size = { w, h };
    const geo = new THREE.PlaneGeometry(w, h, 240, Math.round(240 / aspect));
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true,
      uniforms: { map: { value: map }, depthMap: { value: depth || this._flatDepth() }, amount: { value: (entry.depthScale ?? .35) * w * .45 }, reveal: { value: 0 }, t: { value: 0 } } });
    this.mesh = new THREE.Mesh(geo, mat); this.group.add(this.mesh);
    this.frame.scale.set(w + 24, h + 24, 1); this.backplate.scale.set(w * 1.9, h * 2.2, 1); this.dust.scale.set(w, h, w * .5);
  }

  async _openSplat(entry, maxW, maxH) {
    try {
      const GS = await import('@mkkellogg/gaussian-splats-3d');
      // gpuAcceleratedSort stays off: with it on, 0.4.6 never uploads splat centers to the sort worker and draws 0 splats.
      const viewer = new GS.DropInViewer({ gpuAcceleratedSort: false, sharedMemoryForWorkers: false, showLoadingUI: false, sphericalHarmonicsDegree: 0 });
      const v = viewer.viewer, format = GS.LoaderUtils.sceneFormatFromPath(entry.splat);
      if (format == null) throw new Error('unknown splat format: ' + entry.splat);
      // preflight: a 404 inside the library surfaces as an uncaught error while its promise never settles
      const head = await fetch(entry.splat, { method: 'HEAD' }).catch(() => null);
      if (!head || !head.ok) throw new Error(`splat not reachable (${head ? head.status : 'network'}): ${entry.splat}`);
      // The library's AbortablePromise does not reject through await, so wrap it (and give up after 60 s)
      const buffer = await new Promise((res, rej) => { const ap = v.downloadSplatSceneToSplatBuffer(entry.splat, 5, undefined, false, undefined, format); ap.then(res); ap.catch(rej); setTimeout(() => rej(new Error('splat download timed out')), 60000); });
      if (this.entry !== entry) { viewer.dispose(); return; }
      const w = Math.min(maxW, maxH * 1.6), h = w / 1.6; this.size = { w, h };
      // The scene is in pixel units (1 unit = 1 css px at z=0) and a scan is in metres, so fit the splat into the
      // window. The fit has to be baked into the splat scene's own transform: scaling a parent Object3D renders nothing.
      // Most scans (Polycam / Luma / COLMAP) come out y-down, so default to a 180° flip about X (splatRotation overrides).
      const rot = entry.splatRotation || [1, 0, 0, 0], q = new THREE.Quaternion(...rot), c = new THREE.Vector3();
      const n = buffer.getSplatCount(), step = Math.max(1, Math.floor(n / 20000)), ax = [[], [], []];
      for (let i = 0; i < n; i += step) { buffer.getSplatCenter(i, c); c.applyQuaternion(q); ax[0].push(c.x); ax[1].push(c.y); ax[2].push(c.z); }
      const pct = (a, p) => a[Math.floor((a.length - 1) * p)]; ax.forEach(a => a.sort((x, y) => x - y));
      const lo = ax.map(a => pct(a, .02)), hi = ax.map(a => pct(a, .98));            // 2..98 % bounds ignore floaters
      const size = hi.map((x, i) => x - lo[i]), center = hi.map((x, i) => (x + lo[i]) / 2);
      const user = Array.isArray(entry.splatScale) ? entry.splatScale[0] : (entry.splatScale ?? 1);
      const fit = (entry.splatFit ?? .9) * h / Math.max(1e-6, size[1], size[0] * h / w, size[2] * .5) * user;
      const pos = center.map((x, i) => -x * fit + (entry.splatPosition?.[i] || 0));
      await Promise.race([v.addSplatBuffers([buffer], [{ rotation: rot, position: pos, scale: [fit, fit, fit], splatAlphaRemovalThreshold: 5 }], true, false, false, false, false, true), new Promise((_, rej) => setTimeout(() => rej(new Error('splat build timed out')), 60000))]);
      if (this.entry !== entry) { viewer.dispose(); return; }
      console.info(`splat ${entry.id}: ${n} splats, bounds ${size.map(x => x.toFixed(2))} → scale ${fit.toFixed(1)}`);
      this.splat = viewer; this.group.add(viewer);
      this.frame.scale.set(w + 24, h + 24, 1); this.backplate.scale.set(w * 1.9, h * 2.2, 1); this.dust.scale.set(w, h, w * .5);
    } catch (e) { console.error('splat load failed, falling back to image', e); if (this.entry === entry) return this._openImage(entry, maxW, maxH); }
  }

  _tex(src, srgb) { return new Promise((res, rej) => this.loader.load(src, t => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; res(t); }, undefined, rej)); }
  _flatDepth() { const d = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); d.needsUpdate = true; return d; }

  close() { if (this.state === 'closed') return; this.state = 'closing'; }

  _dispose() {
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh = null; }
    if (this.splat) { const v = this.splat; this.group.remove(v); this.splat = null; Promise.resolve(v.dispose()).catch(e => console.warn('splat dispose', e)); }
  }

  // head: {x,y} in -1..1 ; returns the timeline dim amount (0..1)
  update(dt, head) {
    if (this.state === 'closed') return 0;
    this.t += dt;
    const speed = dt * 2.2;
    if (this.state === 'opening') { this.progress = Math.min(1, this.progress + speed); if (this.progress >= 1) this.state = 'open'; }
    if (this.state === 'closing') { this.progress = Math.max(0, this.progress - speed * 1.4); if (this.progress <= 0) { this.state = 'closed'; this.group.visible = false; this._dispose(); return 0; } }
    const e = this.progress < .5 ? 2 * this.progress * this.progress : 1 - Math.pow(-2 * this.progress + 2, 2) / 2;  // easeInOutQuad
    // grow out of the card's spot toward screen center, z slightly toward the camera
    this.group.position.lerpVectors(this.from, new THREE.Vector3(0, 100, 120), e);   // sits above screen centre; the camera keeps aiming at y=0 so the caption fits below
    const s = THREE.MathUtils.lerp(this.fromScale * .5, 1, e); this.group.scale.setScalar(s);
    this.revealT = (this.revealT || 0) + dt;
    if (this.mesh) { this.mesh.material.uniforms.reveal.value = Math.min(1, Math.max(0, (this.progress - .35) / .65), this.revealT * 1.4); this.mesh.material.uniforms.t.value = this.t; }
    this.dust.rotation.z = this.t * .03; this.dust.material.opacity = .5 * e;
    this.frame.material.opacity = .9 * e; this.backplate.material.opacity = .12 * e;
    // off-axis camera: the viewer's head moves, the camera moves with it and keeps aiming at the memory
    const cam = this.scene.camera, hx = (head.x + this.orbit.x) * 320 * e, hy = (-head.y + this.orbit.y) * 200 * e;
    cam.position.x += (hx - cam.position.x) * .1; cam.position.y += (hy - cam.position.y) * .1;
    cam.lookAt(0, 0, 60);
    return e;
  }
}
