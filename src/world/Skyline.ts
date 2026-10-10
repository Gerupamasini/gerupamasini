import { CanvasTexture, ClampToEdgeWrapping, Color, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';
import { buildHashirimizuSkyline, type ShipMark } from './maps/hashirimizu/skyline';
import { buildHashirimizuLand, type Land } from './maps/hashirimizu/land';
import { buildMankoLand } from './maps/manko/land';

/**
 * The far scenery around the 西のなぎさ, as flat silhouettes standing on the horizon: 富士山 to the west-south-west,
 * 東京スカイツリー and 東京タワー to the north-west, the park's big wheel to the north-east, the Gate Bridge across the
 * bay to the south-west, the city and the park's trees as low bands. Everything sits on a ring ~1.9 km out (inside
 * the sky dome and the camera's far plane, far beyond the flat), follows the camera, ignores the fog and takes the
 * sky's haze by distance: the further, the closer to the horizon colour.
 */
const R = 1900;
const DEG = Math.PI / 180;
/** metres on the backdrop ring for an angle (degrees) seen from the flat */
const ang = (deg: number) => R * Math.tan(deg * DEG);
/** heights are drawn larger than life: the levees and the bank stand a couple of degrees above the flat's eye and would hide the
 * real horizon (the far landmarks get a little more, so some of them shows even from beside a levee) */
const LIFT = 1.9;
/** every picture stands a little above the sea so its foot never dips under the water at high tide */
const FOOT = 3;

interface Mark { mat: MeshBasicMaterial; base: Color; haze: number; night: number }

// deterministic little random for the city and the trees
let seed = 0x9e3779b9;
const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 374761393) >>> 0; return seed / 4294967296; };

export class Skyline {
  readonly group = new Group();
  private readonly marks: Mark[] = [];
  /** ships passing on the horizon (moved by update) */
  private readonly ships: ShipMark[] = [];
  /** the near land around a map that has it: real ground standing still in the world (not riding with the eye) */
  readonly land: Land | null = null;
  private readonly tmp = new Color();

  /** `kind`: the map's layout (its own horizon); absent: the 西のなぎさ */
  constructor(kind?: string) {
    this.group.name = 'skyline';
    // 漫湖 is a lake basin: forest all round, the lake's far shore and low hills; no sea horizon, no buildings
    if (kind === 'manko') { this.land = buildMankoLand(); return; }
    if (kind === 'hashirimizu') { buildHashirimizuSkyline(this.plane.bind(this), this.ships); this.land = buildHashirimizuLand(); return; }
    // ---- 富士山: 106 km WSW, 3776 m: a broad flat-topped cone 1.6° high and 12° wide, nearly all haze
    this.plane(253, ang(18), ang(1.65 * 2.4), FOOT, 1024, 160, (c, w, h) => {
      for (let x = 0; x < w; x++) {
        const u = Math.abs(x / (w - 1) - 0.5) * 2;
        const hh = Math.min(1, Math.pow(1 - u, 1.9) * 1.18 + 0.02 * Math.sin(u * 23)) * (h - 4);
        if (hh <= 0) continue;
        c.fillStyle = '#999';
        c.fillRect(x, h - hh, 1, hh);
        // the snow cap, a ragged edge
        const cap = hh - h * (0.26 + 0.05 * Math.sin(x * 0.37) * Math.sin(x * 0.11));
        if (cap > 0) { c.fillStyle = '#f2f2f2'; c.fillRect(x, h - hh, 1, cap); }
      }
    }, new Color(0.5, 0.56, 0.68), 0.72);
    // ---- 東京スカイツリー: 9 km NNW, 634 m: 3.9° tall, two decks and the mast
    this.plane(332, ang(0.5 * LIFT), ang(3.9 * LIFT), FOOT, 96, 640, (c, w, h) => {
      c.fillStyle = '#aaa';
      const deck1 = 0.55, deck2 = 0.71;
      for (let y = 0; y < h; y++) {
        const t = 1 - y / h;   // 0 at the ground, 1 at the tip
        let wd;
        if (t < deck1) wd = 0.5 - 0.32 * (t / deck1);
        else if (t < deck2) wd = 0.17;
        else wd = t < 0.97 ? 0.07 : 0.03;
        c.fillRect(w / 2 - wd * w / 2, y, wd * w, 1);
      }
      c.fillRect(w * 0.2, h * (1 - deck1) - h * 0.012, w * 0.6, h * 0.03);
      c.fillRect(w * 0.27, h * (1 - deck2) - h * 0.01, w * 0.46, h * 0.024);
    }, new Color(0.62, 0.66, 0.72), 0.58);
    // ---- 東京タワー: 10 km WNW, 333 m: 1.9° tall; red-white, but a hazy pink-grey from here
    this.plane(284, ang(0.75 * 2.3), ang(1.9 * 2.3), FOOT, 192, 512, (c, w, h) => {
      c.fillStyle = '#bbb';
      for (let y = 0; y < h; y++) {
        const t = 1 - y / h;
        const wd = t < 0.97 ? Math.pow(1 - t, 1.7) * 0.95 + 0.05 : 0.03;
        c.fillRect(w / 2 - wd * w / 2, y, wd * w, 1);
      }
      c.fillRect(w * 0.2, h * 0.55, w * 0.6, h * 0.04);
      c.fillRect(w * 0.33, h * 0.25, w * 0.34, h * 0.03);
    }, new Color(0.72, 0.4, 0.3), 0.6);
    // ---- the park's big wheel (ダイヤと花の大観覧車): 0.9 km NE, 117 m: 7° across, rim, spokes and gondolas
    this.plane(36, ang(6.9 * 1.3), ang(7.2 * 1.3), FOOT, 640, 660, (c, w, h) => {
      const cx = w / 2, cy = h * 0.48, r = w * 0.46;
      c.strokeStyle = '#e8e8e8'; c.fillStyle = '#e8e8e8';
      c.lineWidth = w * 0.012;
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
      c.lineWidth = w * 0.006;
      c.beginPath(); c.arc(cx, cy, r * 0.9, 0, Math.PI * 2); c.stroke();
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke();
        c.beginPath(); c.arc(cx + Math.cos(a) * r * 1.02, cy + Math.sin(a) * r * 1.02, w * 0.012, 0, Math.PI * 2); c.fill();
      }
      c.beginPath(); c.arc(cx, cy, w * 0.03, 0, Math.PI * 2); c.fill();
      // the A-frame legs
      c.lineWidth = w * 0.018;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx - w * 0.3, h); c.moveTo(cx, cy); c.lineTo(cx + w * 0.3, h); c.stroke();
    }, new Color(0.86, 0.87, 0.9), 0.22);
    // ---- 東京ゲートブリッジ: 4 km SW, 88 m: a long low truss with its two humps, piers below the deck
    this.plane(225, ang(32), ang(1.35 * 2.0), FOOT, 2048, 128, (c, w, h) => {
      c.fillStyle = '#999';
      const deck = h * 0.62;
      c.fillRect(w * 0.02, deck, w * 0.96, h * 0.05);
      for (let k = 0; k < 14; k++) c.fillRect(w * (0.05 + k * 0.068), deck, w * 0.004, h - deck);
      for (const u of [0.33, 0.67]) {
        c.beginPath();
        c.moveTo(w * (u - 0.13), deck); c.lineTo(w * (u - 0.045), h * 0.06); c.lineTo(w * (u + 0.045), h * 0.06); c.lineTo(w * (u + 0.13), deck);
        c.closePath(); c.fill();
      }
      // the truss is open: cut lighter gaps out of the humps
      c.globalCompositeOperation = 'destination-out';
      for (const u of [0.33, 0.67]) for (let k = -3; k <= 3; k++) {
        c.beginPath(); c.moveTo(w * (u + k * 0.036), deck - h * 0.03); c.lineTo(w * (u + k * 0.036 + 0.02), h * 0.14); c.lineTo(w * (u + k * 0.036 + 0.03), h * 0.14); c.lineTo(w * (u + k * 0.036 + 0.01), deck - h * 0.03); c.closePath(); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    }, new Color(0.55, 0.58, 0.64), 0.5);
    // ---- 舞浜 to the east: hotel blocks and a spire, hazy
    this.plane(76, ang(4 * 1.3), ang(1.2 * LIFT), FOOT, 512, 160, (c, w, h) => {
      c.fillStyle = '#c8c8c8';
      for (const [u, ww, hh] of [[0.08, 0.14, 0.45], [0.25, 0.1, 0.6], [0.4, 0.18, 0.5], [0.62, 0.12, 0.7], [0.8, 0.16, 0.42]] as const) c.fillRect(w * u, h * (1 - hh), w * ww, h * hh);
      c.beginPath(); c.moveTo(w * 0.52, h); c.lineTo(w * 0.55, h * 0.05); c.lineTo(w * 0.58, h); c.closePath(); c.fill();
    }, new Color(0.78, 0.76, 0.8), 0.5);
    // ---- the city and the park's trees as bands around the north half, segment by segment
    for (let b = -120; b < 120; b += 15) {
      const bearing = (b + 360) % 360;
      const north = Math.cos(b * DEG);           // 1 facing north, 0 east/west, negative south
      const city = north > -0.2 ? 0.35 + 0.65 * Math.max(0, -Math.sin(b * DEG)) : 0;   // thickest to the west
      const trees = Math.max(0, north - 0.15) / 0.85;
      if (city <= 0 && trees <= 0) continue;
      this.plane(bearing, ang(7.6), ang(2.2 * LIFT), FOOT, 512, 160, (c, w, h) => {
        if (city > 0) {
          c.fillStyle = '#aaa';
          for (let x = 0; x < w;) {
            const ww = 6 + rnd() * 28, hh = h * (0.08 + rnd() * rnd() * 0.3 * city);
            if (rnd() < 0.3 + 0.6 * city) c.fillRect(x, h - hh, ww, hh);
            x += ww + rnd() * 10;
          }
        }
        if (trees > 0) {
          c.fillStyle = '#555';
          for (let x = 0; x < w; x += 3) {
            const hh = h * (0.3 + 0.38 * trees) * (0.75 + 0.25 * Math.sin(x * 0.07 + b) * Math.sin(x * 0.023)) + rnd() * 3;
            c.fillRect(x, h - hh, 4, hh);
          }
        }
      }, new Color(0.3, 0.36, 0.26), trees > 0.3 ? 0.3 : 0.6);
    }
  }

  /** one flat picture standing on the ring at a bearing (degrees clockwise from north), its bottom at `bottomY` metres */
  private plane(bearing: number, width: number, height: number, bottomY: number, cw: number, ch: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, base: Color, haze: number): Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const c = canvas.getContext('2d')!;
    c.clearRect(0, 0, cw, ch);
    draw(c, cw, ch);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = LinearFilter; tex.magFilter = LinearFilter;
    tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, side: DoubleSide });
    const mesh = new Mesh(new PlaneGeometry(width, height), mat);
    const a = bearing * DEG;
    mesh.position.set(Math.sin(a) * R, bottomY + height / 2, -Math.cos(a) * R);
    mesh.lookAt(0, mesh.position.y, 0);
    mesh.frustumCulled = true;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.renderOrder = -10;
    this.group.add(mesh);
    this.marks.push({ mat, base, haze, night: 0.1 });
    return mesh;
  }

  /** Per frame: ride along with the eye and take the sky's haze; at night the land goes dark. */
  update(eye: Vector3, fog: Color, day: number, timeSec = 0): void {
    this.group.position.set(eye.x, 0, eye.z);
    this.land?.setHaze(fog);
    for (const s of this.ships) {
      // along its lane, round and round the sector it can be seen in (it is a different ship next time)
      const span = s.sector[1] - s.sector[0];
      const b = s.sector[0] + ((((s.bearing0 - s.sector[0] + s.degPerSec * timeSec) % span) + span) % span);
      const a = b * DEG;
      s.mesh.position.set(Math.sin(a) * R, s.mesh.position.y, -Math.cos(a) * R);
      s.mesh.lookAt(eye.x, s.mesh.position.y, eye.z);
      s.mesh.scale.x = s.degPerSec > 0 ? 1 : -1;
    }
    for (const m of this.marks) {
      this.tmp.copy(m.base).lerp(fog, m.haze);
      this.tmp.multiplyScalar(m.night + (1 - m.night) * day);
      m.mat.color.copy(this.tmp);
    }
  }

  dispose(): void {
    this.land?.dispose();
    for (const m of this.marks) { m.mat.map?.dispose(); m.mat.dispose(); }
    this.group.traverse((o) => { (o as Mesh).geometry?.dispose(); });
  }
}
