import Phaser from 'phaser';

/** Stable texture keys for every procedurally generated asset. */
export const TEX = {
  earthSurface: 'earth-surface',
  earthClouds: 'earth-clouds',
  earthShade: 'earth-shade',
  atmosphere: 'atmosphere',
  disc: 'disc',
  glow: 'glow',
  dot: 'dot',
  spark: 'spark',
  smoke: 'smoke',
  ring: 'ring',
  starsA: 'stars-a',
  starsB: 'stars-b',
  nebula: 'nebula',
  normal: (i: number) => `meteor-normal-${i}`,
  heavy: (i: number) => `meteor-heavy-${i}`,
  heavyCracked: (i: number) => `meteor-heavy-${i}-cracked`,
  energy: 'meteor-energy',
} as const;

export const NORMAL_VARIANTS = 4;
export const HEAVY_VARIANTS = 3;
/** Radius of the planet disc inside the earthShade / atmosphere textures, as a fraction of texture size. */
export const PLANET_IN_TEX = 0.36;
export const METEOR_TEX = 128;
export const METEOR_BODY = 0.42;

let seed = 1337;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function canvas(scene: Phaser.Scene, key: string, w: number, h: number): CanvasRenderingContext2D {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h)!;
  return tex.getContext();
}

function refresh(scene: Phaser.Scene, key: string): void {
  (scene.textures.get(key) as Phaser.Textures.CanvasTexture).refresh();
}

/** Periodic-in-x value noise with fractal octaves. */
function makeNoise(period: number) {
  const size = 256;
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const at = (x: number, y: number, p: number) => grid[(((y % size) + size) % size) * size + (((x % p) + p) % p)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const sample = (x: number, y: number, p: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = smooth(x - xi);
    const ty = smooth(y - yi);
    const a = at(xi, yi, p);
    const b = at(xi + 1, yi, p);
    const c = at(xi, yi + 1, p);
    const d = at(xi + 1, yi + 1, p);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  return (u: number, v: number, octaves = 5) => {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const p = period * freq;
      sum += amp * sample(u * p, v * p, p);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function mix(c1: number[], c2: number[], t: number) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

function earth(scene: Phaser.Scene): void {
  const W = 512;
  const H = 256;
  const land = makeNoise(6);
  const detail = makeNoise(20);
  const ctx = canvas(scene, TEX.earthSurface, W, H);
  const img = ctx.createImageData(W, H);
  const deep = [6, 30, 78];
  const shallow = [22, 104, 178];
  const coast = [52, 150, 190];
  const green = [44, 118, 72];
  const olive = [110, 136, 66];
  const desert = [176, 148, 96];
  const ice = [226, 238, 246];
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const lat = Math.abs(v - 0.5) * 2;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const n = land(u, v * 0.5) + (detail(u, v * 0.5, 3) - 0.5) * 0.18;
      let c: number[];
      if (n < 0.5) {
        c = mix(deep, shallow, Math.pow(n / 0.5, 2.2));
        if (n > 0.47) c = mix(c, coast, (n - 0.47) / 0.03);
      } else {
        const t = Math.min(1, (n - 0.5) / 0.18);
        const dry = detail(u + 0.3, v * 0.5, 2);
        c = mix(green, dry > 0.52 ? desert : olive, t * (0.5 + dry * 0.5));
      }
      if (lat > 0.8) c = mix(c, ice, Math.min(1, (lat - 0.8) / 0.08));
      const i = (y * W + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  refresh(scene, TEX.earthSurface);

  const cloudNoise = makeNoise(5);
  const cctx = canvas(scene, TEX.earthClouds, W, H);
  const cimg = cctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = cloudNoise(x / W, (y / H) * 0.6, 6);
      const a = Math.max(0, Math.min(1, (n - 0.52) / 0.16));
      const i = (y * W + x) * 4;
      cimg.data[i] = 245;
      cimg.data[i + 1] = 250;
      cimg.data[i + 2] = 255;
      cimg.data[i + 3] = a * 220;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  refresh(scene, TEX.earthClouds);

  const S = 512;
  const r = S * PLANET_IN_TEX;
  const c = S / 2;
  const sctx = canvas(scene, TEX.earthShade, S, S);
  sctx.save();
  sctx.beginPath();
  sctx.arc(c, c, r, 0, Math.PI * 2);
  sctx.clip();
  const light = sctx.createRadialGradient(c - r * 0.45, c - r * 0.5, 0, c - r * 0.2, c - r * 0.2, r * 1.6);
  light.addColorStop(0, 'rgba(255,255,255,0.16)');
  light.addColorStop(0.35, 'rgba(0,0,0,0)');
  light.addColorStop(0.7, 'rgba(2,8,28,0.55)');
  light.addColorStop(1, 'rgba(1,3,12,0.92)');
  sctx.fillStyle = light;
  sctx.fillRect(0, 0, S, S);
  const limb = sctx.createRadialGradient(c, c, r * 0.7, c, c, r);
  limb.addColorStop(0, 'rgba(0,0,0,0)');
  limb.addColorStop(1, 'rgba(10,40,90,0.55)');
  sctx.fillStyle = limb;
  sctx.fillRect(0, 0, S, S);
  sctx.restore();
  const rim = sctx.createLinearGradient(c - r, c - r, c + r * 0.4, c + r * 0.4);
  rim.addColorStop(0, 'rgba(170,230,255,0.95)');
  rim.addColorStop(0.55, 'rgba(120,200,255,0.25)');
  rim.addColorStop(1, 'rgba(120,200,255,0)');
  sctx.strokeStyle = rim;
  sctx.lineWidth = 3;
  sctx.beginPath();
  sctx.arc(c, c, r - 1.5, 0, Math.PI * 2);
  sctx.stroke();
  refresh(scene, TEX.earthShade);

  const actx = canvas(scene, TEX.atmosphere, S, S);
  const atmo = actx.createRadialGradient(c, c, r * 0.9, c, c, S / 2);
  atmo.addColorStop(0, 'rgba(255,255,255,0)');
  atmo.addColorStop(0.08, 'rgba(255,255,255,0.9)');
  atmo.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  atmo.addColorStop(0.6, 'rgba(255,255,255,0.08)');
  atmo.addColorStop(1, 'rgba(255,255,255,0)');
  actx.fillStyle = atmo;
  actx.fillRect(0, 0, S, S);
  refresh(scene, TEX.atmosphere);

  const dctx = canvas(scene, TEX.disc, S, S);
  dctx.fillStyle = '#fff';
  dctx.beginPath();
  dctx.arc(c, c, r, 0, Math.PI * 2);
  dctx.fill();
  refresh(scene, TEX.disc);
}

function particles(scene: Phaser.Scene): void {
  const g = canvas(scene, TEX.glow, 128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  refresh(scene, TEX.glow);

  const d = canvas(scene, TEX.dot, 32, 32);
  const dg = d.createRadialGradient(16, 16, 0, 16, 16, 16);
  dg.addColorStop(0, 'rgba(255,255,255,1)');
  dg.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  dg.addColorStop(1, 'rgba(255,255,255,0)');
  d.fillStyle = dg;
  d.fillRect(0, 0, 32, 32);
  refresh(scene, TEX.dot);

  const s = canvas(scene, TEX.spark, 48, 12);
  const sg = s.createLinearGradient(0, 0, 48, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0)');
  sg.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  sg.addColorStop(1, 'rgba(255,255,255,1)');
  s.fillStyle = sg;
  s.beginPath();
  s.ellipse(24, 6, 24, 3, 0, 0, Math.PI * 2);
  s.fill();
  refresh(scene, TEX.spark);

  const sm = canvas(scene, TEX.smoke, 64, 64);
  for (let i = 0; i < 6; i++) {
    const x = 20 + rand() * 24;
    const y = 20 + rand() * 24;
    const rg = sm.createRadialGradient(x, y, 0, x, y, 20);
    rg.addColorStop(0, 'rgba(255,255,255,0.35)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    sm.fillStyle = rg;
    sm.fillRect(0, 0, 64, 64);
  }
  refresh(scene, TEX.smoke);

  const r = canvas(scene, TEX.ring, 256, 256);
  const rg = r.createRadialGradient(128, 128, 96, 128, 128, 128);
  rg.addColorStop(0, 'rgba(255,255,255,0)');
  rg.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  rg.addColorStop(0.85, 'rgba(255,255,255,0.4)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  r.fillStyle = rg;
  r.fillRect(0, 0, 256, 256);
  refresh(scene, TEX.ring);
}

function sky(scene: Phaser.Scene): void {
  const drawStars = (key: string, count: number, maxR: number, bright: number) => {
    const ctx = canvas(scene, key, 512, 512);
    for (let i = 0; i < count; i++) {
      const x = rand() * 512;
      const y = rand() * 512;
      const rr = 0.3 + Math.pow(rand(), 3) * maxR;
      const a = 0.25 + rand() * bright;
      const hue = rand();
      ctx.fillStyle = hue > 0.85 ? `rgba(255,214,170,${a})` : hue > 0.65 ? `rgba(170,210,255,${a})` : `rgba(235,242,255,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
      if (rr > maxR * 0.6) {
        const gg = ctx.createRadialGradient(x, y, 0, x, y, rr * 5);
        gg.addColorStop(0, `rgba(180,220,255,${a * 0.35})`);
        gg.addColorStop(1, 'rgba(180,220,255,0)');
        ctx.fillStyle = gg;
        ctx.fillRect(x - rr * 5, y - rr * 5, rr * 10, rr * 10);
      }
    }
    refresh(scene, key);
  };
  drawStars(TEX.starsA, 420, 1.1, 0.5);
  drawStars(TEX.starsB, 60, 2, 0.7);

  const ctx = canvas(scene, TEX.nebula, 512, 512);
  const blobs: [number, number, number, string][] = [
    [140, 120, 240, 'rgba(40,70,160,0.30)'],
    [380, 90, 200, 'rgba(90,40,140,0.20)'],
    [300, 330, 260, 'rgba(20,90,150,0.22)'],
    [80, 400, 180, 'rgba(110,40,90,0.14)'],
  ];
  for (const [x, y, rr, col] of blobs) {
    const gg = ctx.createRadialGradient(x, y, 0, x, y, rr);
    gg.addColorStop(0, col);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, 512, 512);
  }
  refresh(scene, TEX.nebula);
}

type Palette = { light: string; mid: string; dark: string; crater: string; edge: string };

function rockShape(points: number, roughness: number): [number, number][] {
  const out: [number, number][] = [];
  const bumps = 2 + Math.floor(rand() * 3);
  const phase = rand() * Math.PI * 2;
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = 1 - roughness * 0.5 + Math.sin(a * bumps + phase) * roughness * 0.25 + (rand() - 0.5) * roughness * 0.5;
    out.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return out;
}

function drawRock(ctx: CanvasRenderingContext2D, shape: [number, number][], pal: Palette, craters: [number, number, number][]): void {
  const S = METEOR_TEX;
  const c = S / 2;
  const R = S * METEOR_BODY;
  ctx.save();
  ctx.beginPath();
  shape.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(c + x * R, c + y * R) : ctx.lineTo(c + x * R, c + y * R)));
  ctx.closePath();
  const fill = ctx.createRadialGradient(c - R * 0.4, c - R * 0.45, R * 0.1, c, c, R * 1.1);
  fill.addColorStop(0, pal.light);
  fill.addColorStop(0.5, pal.mid);
  fill.addColorStop(1, pal.dark);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.clip();
  for (const [x, y, rr] of craters) {
    const cx = c + x * R;
    const cy = c + y * R;
    const cr = rr * R;
    ctx.fillStyle = pal.crater;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,200,0.18)';
    ctx.lineWidth = Math.max(1, cr * 0.25);
    ctx.beginPath();
    ctx.arc(cx + cr * 0.15, cy + cr * 0.15, cr, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = pal.edge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  shape.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(c + x * R, c + y * R) : ctx.lineTo(c + x * R, c + y * R)));
  ctx.closePath();
  ctx.stroke();
}

function makeCraters(n: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) out.push([(rand() - 0.5) * 1.2, (rand() - 0.5) * 1.2, 0.08 + rand() * 0.16]);
  return out;
}

function drawCracks(ctx: CanvasRenderingContext2D): void {
  const S = METEOR_TEX;
  const c = S / 2;
  const R = S * METEOR_BODY;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const paths: [number, number][][] = [];
  for (let k = 0; k < 4; k++) {
    let a = rand() * Math.PI * 2;
    let x = c + (rand() - 0.5) * R * 0.3;
    let y = c + (rand() - 0.5) * R * 0.3;
    const path: [number, number][] = [[x, y]];
    for (let s = 0; s < 5; s++) {
      a += (rand() - 0.5) * 1.2;
      const len = R * (0.16 + rand() * 0.12);
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      path.push([x, y]);
    }
    paths.push(path);
  }
  const stroke = (color: string, width: number, blur: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowColor = '#ff7a1a';
    ctx.shadowBlur = blur;
    for (const p of paths) {
      ctx.beginPath();
      p.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
    }
  };
  stroke('rgba(255,110,30,0.9)', 5, 10);
  stroke('rgba(255,230,160,1)', 1.8, 4);
  ctx.restore();
}

function meteors(scene: Phaser.Scene): void {
  const normalPal: Palette = { light: '#c98a5a', mid: '#7a4a30', dark: '#2a160e', crater: 'rgba(40,20,12,0.55)', edge: 'rgba(255,170,100,0.35)' };
  const heavyPal: Palette = { light: '#77727f', mid: '#3b3642', dark: '#121016', crater: 'rgba(8,6,10,0.6)', edge: 'rgba(255,120,60,0.3)' };
  for (let i = 0; i < NORMAL_VARIANTS; i++) {
    const shape = rockShape(16, 0.42);
    const ctx = canvas(scene, TEX.normal(i), METEOR_TEX, METEOR_TEX);
    drawRock(ctx, shape, normalPal, makeCraters(4));
    refresh(scene, TEX.normal(i));
  }
  for (let i = 0; i < HEAVY_VARIANTS; i++) {
    const shape = rockShape(20, 0.32);
    const craters = makeCraters(6);
    const ctx = canvas(scene, TEX.heavy(i), METEOR_TEX, METEOR_TEX);
    drawRock(ctx, shape, heavyPal, craters);
    refresh(scene, TEX.heavy(i));
    const cctx = canvas(scene, TEX.heavyCracked(i), METEOR_TEX, METEOR_TEX);
    drawRock(cctx, shape, heavyPal, craters);
    drawCracks(cctx);
    refresh(scene, TEX.heavyCracked(i));
  }

  const S = METEOR_TEX;
  const c = S / 2;
  const R = S * METEOR_BODY * 0.9;
  const ctx = canvas(scene, TEX.energy, S, S);
  const pts: [number, number][] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? 1 : 0.72;
    pts.push([c + Math.cos(a) * R * rr, c + Math.sin(a) * R * rr]);
  }
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  const eg = ctx.createRadialGradient(c - R * 0.2, c - R * 0.3, 0, c, c, R);
  eg.addColorStop(0, '#ffffff');
  eg.addColorStop(0.35, '#9ff6ff');
  eg.addColorStop(0.75, '#2fb8d8');
  eg.addColorStop(1, '#f5c451');
  ctx.fillStyle = eg;
  ctx.shadowColor = '#7ff4ff';
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,236,170,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  refresh(scene, TEX.energy);
}

export function generateTextures(scene: Phaser.Scene): void {
  seed = 1337;
  earth(scene);
  particles(scene);
  sky(scene);
  meteors(scene);
}
