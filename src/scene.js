// Timeline scene: cards floating at different depths along a year axis,
// rendered with three.js and a bloom pass for the Minority Report glow.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const PX_PER_YEAR = 160;
export const CARD_W = 250, CARD_IMG_H = 156, CARD_H = 236;
const GLOW = new THREE.Color('#5fe8ff');

export class TimelineScene {
  constructor(canvas, data) {
    this.data = data;
    this.year0 = data.range[0]; this.year1 = data.range[1];
    this.trackLen = (this.year1 - this.year0) * PX_PER_YEAR;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#05080d');
    this.scene.fog = new THREE.Fog("#05080d", 700, 2100);
    this.camera = new THREE.PerspectiveCamera(40, 1, 10, 6000);
    this.track = new THREE.Group(); this.scene.add(this.track);
    this.cards = []; this.cardById = new Map();
    this.raycaster = new THREE.Raycaster();
    this.loader = new THREE.TextureLoader();
    this.hoverId = null;
    this._buildAxis(); this._buildCards(); this._buildParticles();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.55, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  resize() {
    const W = this.renderer.domElement.clientWidth || innerWidth, H = this.renderer.domElement.clientHeight || innerHeight;
    this.W = W; this.H = H;
    this.renderer.setSize(W, H, false); this.composer.setSize(W, H);
    this.camera.aspect = W / H; this.camera.updateProjectionMatrix();
    // distance where 1 world unit == 1 css px on the z=0 plane
    this.camDist = (H / 2) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.position.set(0, 0, this.camDist);
  }

  _label(text, { size = 22, color = '#dbeaf5', mono = false, weight = 600, letter = 0 } = {}) {
    const c = document.createElement('canvas'); const g = c.getContext('2d');
    const font = `${weight} ${size}px ${mono ? '"Share Tech Mono", monospace' : 'Rajdhani, sans-serif'}`;
    g.font = font; const w = Math.ceil(g.measureText(text).width + letter * text.length + 8);
    const h = Math.ceil(size * 1.4);
    c.width = w * 2; c.height = h * 2; g.scale(2, 2); g.font = font; g.fillStyle = color; g.textBaseline = 'middle';
    if (letter) g.letterSpacing = letter + 'px';
    g.fillText(text, 4, h / 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter;
    return { tex: t, w, h };
  }
  _sprite(text, opts, scale = 1) {
    const { tex, w, h } = this._label(text, opts);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * scale, h * scale), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    return m;
  }

  _buildAxis() {
    const g = new THREE.Group(); this.track.add(g);
    const lineMat = new THREE.LineBasicMaterial({ color: GLOW, transparent: true, opacity: .35 });
    const pts = [new THREE.Vector3(-400, 0, 0), new THREE.Vector3(this.trackLen + 400, 0, 0)];
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    const tickMat = new THREE.LineBasicMaterial({ color: GLOW, transparent: true, opacity: .5 });
    const tickPts = [];
    for (let y = this.year0; y <= this.year1; y++) {
      const x = (y - this.year0) * PX_PER_YEAR, h = y % 10 === 0 ? 16 : y % 5 === 0 ? 10 : 5;
      tickPts.push(new THREE.Vector3(x, -h, 0), new THREE.Vector3(x, h, 0));
      if (y % 5 === 0) {
        const s = this._sprite(String(y), { size: y % 10 === 0 ? 20 : 15, color: y % 10 === 0 ? '#5fe8ff' : '#6f8aa3', mono: true, weight: 400, letter: 2 });
        s.position.set(x, -34, 0); g.add(s);
      }
    }
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tickPts), tickMat));
  }

  _buildCards() {
    const frameGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(CARD_W, CARD_H));
    const cornerGeo = (() => { // bright L-corners, they bloom
      const s = 14, hw = CARD_W / 2, hh = CARD_H / 2, p = [];
      for (const [sx, sy] of [[-1, 1], [1, -1]]) { p.push(sx * hw, sy * hh, 0, sx * (hw - s), sy * hh, 0, sx * hw, sy * hh, 0, sx * hw, sy * (hh - s), 0); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); return g;
    })();
    const seen = {};
    this.data.entries.forEach((e, i) => {
      const grp = new THREE.Group();
      const n = (seen[e.year] = (seen[e.year] || 0) + 1) - 1;
      const side = i % 2 === 0 ? -1 : 1;
      const depth = 0.15 + ((i * 7) % 5) * 0.17;        // 0.15 .. 0.83, nearer = larger z
      grp.userData = { entry: e, x: (e.year - this.year0) * PX_PER_YEAR + n * 60, y: side * (165 + n * 100), z: depth * 260, depth, hover: 0 };
      grp.position.set(grp.userData.x, grp.userData.y, grp.userData.z);
      // image
      const imgMat = new THREE.MeshBasicMaterial({ color: 0x111820 });
      const img = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_IMG_H), imgMat);
      img.position.y = (CARD_H - CARD_IMG_H) / 2; grp.add(img);
      const src = e.img || `assets/img/${e.id}.jpg`;
      this.loader.load(src, t => { t.colorSpace = THREE.SRGBColorSpace; imgMat.map = t; imgMat.color.set(0xb8c8d8); imgMat.needsUpdate = true; });
      // pane behind label
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H - CARD_IMG_H), new THREE.MeshBasicMaterial({ color: 0x0a1420, transparent: true, opacity: .85 }));
      pane.position.set(0, -CARD_IMG_H / 2, 0); grp.add(pane);
      // labels
      const yr = this._sprite(String(e.year), { size: 13, color: '#5fe8ff', mono: true, weight: 400, letter: 3 });
      yr.position.set(-CARD_W / 2 + yr.geometry.parameters.width / 2 + 12, -CARD_IMG_H / 2 + 26, 1); grp.add(yr);
      const ti = this._sprite(e.title, { size: 22, color: '#9fb6c9', weight: 600 });
      const tw = Math.min(ti.geometry.parameters.width, CARD_W - 24), ts = tw / ti.geometry.parameters.width;
      ti.scale.set(ts, ts, 1); ti.position.set(-CARD_W / 2 + tw / 2 + 12, -CARD_IMG_H / 2 + 2, 1); grp.add(ti);
      const gr = this._sprite(e.group.toUpperCase(), { size: 11, color: '#6f8aa3', weight: 500, letter: 1.5 });
      const gw = Math.min(gr.geometry.parameters.width, CARD_W - 24), gs = gw / gr.geometry.parameters.width;
      gr.scale.set(gs, gs, 1); gr.position.set(-CARD_W / 2 + gw / 2 + 12, -CARD_IMG_H / 2 - 24, 1); grp.add(gr);
      // frame + corners (bloom-bright)
      const frameMat = new THREE.LineBasicMaterial({ color: GLOW.clone().multiplyScalar(.55), transparent: true, opacity: .9 });
      const frame = new THREE.LineSegments(frameGeo, frameMat); frame.position.z = 1; grp.add(frame);
      const cornerMat = new THREE.LineBasicMaterial({ color: GLOW.clone().multiplyScalar(1.4) });
      const corners = new THREE.LineSegments(cornerGeo, cornerMat); corners.position.z = 1.5; grp.add(corners);
      // halo plane behind (additive, for hover glow)
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W + 60, CARD_H + 60), new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.z = -2; grp.add(halo);
      // hit area
      const hit = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W + 20, CARD_H + 20), new THREE.MeshBasicMaterial({ visible: false }));
      hit.userData.card = grp; grp.add(hit);
      grp.userData.parts = { img, imgMat, frameMat, cornerMat, halo, hit };
      this.track.add(grp); this.cards.push(grp); this.cardById.set(e.id, grp);
    });
  }

  _buildParticles() {
    const N = 900, pos = new Float32Array(N * 3), sz = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = Math.random() * (this.trackLen + 1600) - 800; pos[i * 3 + 1] = (Math.random() - .5) * 1400; pos[i * 3 + 2] = (Math.random() - .5) * 900; sz[i] = 1 + Math.random() * 3; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { t: { value: 0 }, c: { value: GLOW } },
      vertexShader: `attribute float size; uniform float t; varying float a;
        void main(){ vec3 p=position; p.y+=sin(t*.4+p.x*.01)*12.0; vec4 mv=modelViewMatrix*vec4(p,1.0);
        gl_PointSize=size*(600.0/-mv.z); a=.25+.35*sin(t*1.3+p.x*.05+p.y*.02); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 c; varying float a; void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard; gl_FragColor=vec4(c,a*(1.0-d*2.0)); }`
    });
    this.particles = new THREE.Points(g, m); this.track.add(this.particles);
  }

  // screen px → card group or null
  pick(x, y) {
    const v = new THREE.Vector2((x / this.W) * 2 - 1, -(y / this.H) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const hits = this.raycaster.intersectObjects(this.cards.map(c => c.userData.parts.hit), false);
    return hits.length ? hits[0].object.userData.card : null;
  }

  // world-space position + scale of a card (for the memory view to grow out of)
  cardWorld(card) { const p = new THREE.Vector3(); card.getWorldPosition(p); return { position: p, scale: this.track.scale.x }; }
  // scroll value that centers a card on screen
  scrollToCenter(card, zoom) { return -card.userData.x * zoom; }
  neighbor(card, dir) { const i = this.cards.indexOf(card) + dir; return this.cards[Math.max(0, Math.min(this.cards.length - 1, i))]; }

  setHover(card) {
    this.hoverId = card ? card.userData.entry.id : null;
  }

  // scroll: px offset of the track (negative = later years), zoom: scale about screen center
  update(dt, t, { scroll, zoom, head, dim = 0 }) {
    this.track.position.x = scroll; this.track.scale.setScalar(zoom);
    this.particles.material.uniforms.t.value = t;
    // subtle head parallax on the timeline; the camera slides sideways and keeps looking at center
    if (dim <= 0) {
      const hx = head.x * 60, hy = head.y * 40;
      this.camera.position.x += (hx - this.camera.position.x) * .08;
      this.camera.position.y += (-hy - this.camera.position.y) * .08;
      this.camera.lookAt(0, 0, 0);
    }
    for (const c of this.cards) {
      const u = c.userData, p = u.parts, target = u.entry.id === this.hoverId ? 1 : 0;
      u.hover += (target - u.hover) * Math.min(1, dt * 10);
      const s = 1 + u.hover * .08; c.scale.setScalar(s);
      p.halo.material.opacity = u.hover * .22;
      p.frameMat.color.copy(GLOW).multiplyScalar(.55 + u.hover * .9);
      p.imgMat.color.setScalar(0.72 + u.hover * .28);
      c.position.z = u.z + u.hover * 60;
    }
    // while a memory is open the timeline recedes into the fog but stays navigable
    this.track.position.z += (-dim * 1100 - this.track.position.z) * .1;
    this.bloom.strength = .9 + dim * .4;
  }

  render() { this.composer.render(); }
}
