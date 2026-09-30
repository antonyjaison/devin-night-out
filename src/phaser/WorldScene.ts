import Phaser from 'phaser';
import { METEORS, type MeteorKind, type MeteorSpec } from '../game/config';
import { haptics } from '../game/haptics';
import { sfx } from '../game/audio';
import { Simulation, type SimEvent } from '../game/simulation';
import type { Ui } from '../ui/hud';
import { HEAVY_VARIANTS, METEOR_BODY, METEOR_TEX, NORMAL_VARIANTS, PLANET_IN_TEX, TEX, generateTextures } from './textures';

const FONT = '"Chakra Petch", system-ui, sans-serif';
const COLORS = {
  scan: 0x6ff3e4,
  ember: 0xff8b3d,
  alert: 0xff3d3d,
  atmo: 0x5ec8ff,
  atmoHurt: 0xff6a3a,
  phos: 0xb8ff8a,
};

interface Meteor {
  kind: MeteorKind;
  spec: MeteorSpec;
  hp: number;
  variant: number;
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  /** Start position in normalised viewport space (can be outside 0..1). */
  sx: number;
  sy: number;
  /** Direction from Earth's centre to the impact point. */
  angle: number;
  /** Signed curvature of the path, as a fraction of path length. */
  curve: number;
  p: number;
  travel: number;
  radius: number;
  spin: number;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  ambient: boolean;
}

/** Renders the world and adapts Simulation state into sprites, effects, audio and haptics. */
export class WorldScene extends Phaser.Scene {
  readonly sim = new Simulation();
  private ui!: Ui;
  private px = 1;

  private earth = { x: 0, y: 0, r: 100 };
  private earthSurface!: Phaser.GameObjects.TileSprite;
  private earthClouds!: Phaser.GameObjects.TileSprite;
  private earthShade!: Phaser.GameObjects.Image;
  private earthDamage!: Phaser.GameObjects.Image;
  private earthFlash!: Phaser.GameObjects.Image;
  private atmosphere!: Phaser.GameObjects.Image;
  private atmosphereOuter!: Phaser.GameObjects.Image;
  private earthMask!: Phaser.GameObjects.Graphics;
  private shield!: Phaser.GameObjects.Image;
  private shieldFill!: Phaser.GameObjects.Image;
  private starsA!: Phaser.GameObjects.TileSprite;
  private starsB!: Phaser.GameObjects.TileSprite;
  private nebula!: Phaser.GameObjects.Image;

  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private trailHeavy!: Phaser.GameObjects.Particles.ParticleEmitter;
  private trailEnergy!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private cyanSparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private debris!: Phaser.GameObjects.Particles.ParticleEmitter;
  private heavyDebris!: Phaser.GameObjects.Particles.ParticleEmitter;

  private reticle!: Phaser.GameObjects.Container;
  private reticleRing!: Phaser.GameObjects.Graphics;
  private reticleCore!: Phaser.GameObjects.Graphics;
  private lock!: Phaser.GameObjects.Graphics;
  private reticleState = { x: 0, y: 0, tx: 0, ty: 0, focus: 0, kick: 0, visible: false, touch: false, hot: false, spin: 0 };

  private meteors: Meteor[] = [];
  private hovered: Meteor | null = null;
  private worldSpeed = 1;
  private earthSpin = 1;
  private shieldWave = -1;
  private runId = 0;
  private ambientIn = 1;
  private tension = 0;
  private damageLevel = 0;

  constructor() {
    super('world');
  }

  init(data: { ui: Ui; px: number }): void {
    this.ui = data.ui;
    this.px = data.px;
  }

  create(): void {
    generateTextures(this);
    this.createSky();
    this.createEarth();
    this.createEmitters();
    this.createReticle();
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('gameout', () => (this.reticleState.visible = false));
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
  }

  /** Begins a fresh run. Safe to call repeatedly. */
  beginRun(): void {
    this.runId += 1;
    for (const m of this.meteors) this.destroyMeteor(m);
    this.meteors.length = 0;
    this.hovered = null;
    this.worldSpeed = 1;
    this.earthSpin = 1;
    this.shieldWave = -1;
    this.tension = 0;
    this.damageLevel = 0;
    this.tweens.killTweensOf([this.shield, this.shieldFill, this.earthDamage, this.atmosphere, this.atmosphereOuter, this.earthClouds, this.cameras.main]);
    this.shield.setVisible(false);
    this.shieldFill.setVisible(false);
    this.earthDamage.setAlpha(0);
    this.earthClouds.setAlpha(0.85);
    this.atmosphere.setTint(COLORS.atmo).setAlpha(0.9);
    this.atmosphereOuter.setTint(COLORS.atmo).setAlpha(0.35);
    this.cameras.main.setZoom(1);
    this.cameras.main.resetFX();
    this.ui.resetRun();
    sfx.restoreBus();
    sfx.stopDrone(0.2);
    this.sim.reset();
    this.handleEvents(this.sim.update(0));
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.handleEvents(this.sim.update(dt));
    this.sim.active = this.meteors.length;

    this.updateSky(dt);
    this.updateEarth(dt);
    this.updateAmbient(dt);
    this.updateMeteors(dt * this.worldSpeed);
    this.updateShieldWave();
    this.updateReticle(dt);
    this.ui.update(this.sim);
  }

  // ---------------------------------------------------------------- events

  private handleEvents(events: SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'countdown':
          this.ui.showCount(e.value);
          sfx.countdown(false);
          haptics.light();
          break;
        case 'start':
          this.ui.showCount('go');
          this.ui.setPlaying(true);
          sfx.countdown(true);
          sfx.startDrone();
          haptics.medium();
          break;
        case 'spawn':
          this.spawnMeteor(e.kind, e.travel);
          break;
        case 'storm':
          this.ui.storm();
          sfx.warning();
          haptics.warning();
          this.tension = 0.6;
          sfx.setTension(this.tension);
          break;
        case 'imminent':
          this.ui.imminent();
          this.tension = 0.8;
          sfx.setTension(this.tension);
          break;
        case 'tick':
          if (e.second <= 10 && e.second > 0) {
            this.ui.finalTick(e.second);
            sfx.beep(e.second <= 3 ? 1320 : 880, e.second <= 3 ? 0.16 : 0.1);
            if (e.second <= 3) haptics.medium();
            else haptics.warning();
            if (e.second <= 3) {
              this.tension = 1;
              sfx.setTension(1);
            }
          }
          break;
        case 'critical':
          sfx.critical();
          haptics.warning();
          break;
        case 'victory':
          this.playVictory();
          break;
        case 'defeat':
          break;
      }
    }
  }

  // ---------------------------------------------------------------- setup

  private createSky(): void {
    this.nebula = this.add.image(0, 0, TEX.nebula).setOrigin(0.5).setAlpha(0.9);
    this.starsA = this.add.tileSprite(0, 0, 10, 10, TEX.starsA).setOrigin(0);
    this.starsB = this.add.tileSprite(0, 0, 10, 10, TEX.starsB).setOrigin(0);
  }

  private createEarth(): void {
    this.atmosphereOuter = this.add.image(0, 0, TEX.atmosphere).setTint(COLORS.atmo).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD);
    this.atmosphere = this.add.image(0, 0, TEX.atmosphere).setTint(COLORS.atmo).setAlpha(0.9).setBlendMode(Phaser.BlendModes.ADD);
    this.earthSurface = this.add.tileSprite(0, 0, 10, 10, TEX.earthSurface);
    this.earthClouds = this.add.tileSprite(0, 0, 10, 10, TEX.earthClouds).setAlpha(0.85);
    this.earthMask = this.make.graphics({}, false);
    const mask = this.earthMask.createGeometryMask();
    this.earthSurface.setMask(mask);
    this.earthClouds.setMask(mask);
    this.earthShade = this.add.image(0, 0, TEX.earthShade);
    this.earthDamage = this.add.image(0, 0, TEX.disc).setTint(0x1a0503).setAlpha(0);
    this.earthFlash = this.add.image(0, 0, TEX.disc).setTint(0xffb080).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.shieldFill = this.add.image(0, 0, TEX.glow).setTint(COLORS.scan).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.shield = this.add.image(0, 0, TEX.ring).setTint(COLORS.scan).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }

  private createEmitters(): void {
    const px = this.px;
    const trailBase = {
      lifespan: { min: 260, max: 460 },
      speed: { min: 4 * px, max: 26 * px },
      alpha: { start: 0.85, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    };
    this.trail = this.add.particles(0, 0, TEX.dot, { ...trailBase, scale: { start: 0.75 * px, end: 0 }, tint: [0xffe0a0, 0xff9a40, 0xff5a1a] });
    this.trailHeavy = this.add.particles(0, 0, TEX.dot, { ...trailBase, lifespan: { min: 380, max: 620 }, scale: { start: 1.15 * px, end: 0 }, tint: [0xffb060, 0xff6a20, 0xd03010] });
    this.trailEnergy = this.add.particles(0, 0, TEX.dot, { ...trailBase, scale: { start: 0.6 * px, end: 0 }, tint: [0xffffff, 0x9ff6ff, 0xf5c451] });
    this.smoke = this.add.particles(0, 0, TEX.smoke, {
      lifespan: { min: 600, max: 1000 },
      speed: { min: 6 * px, max: 24 * px },
      scale: { start: 0.5 * px, end: 1.5 * px },
      alpha: { start: 0.28, end: 0 },
      tint: 0x7a6a66,
      rotate: { min: 0, max: 360 },
      emitting: false,
    });
    this.sparks = this.add.particles(0, 0, TEX.spark, {
      lifespan: { min: 260, max: 560 },
      speed: { min: 140 * px, max: 480 * px },
      scale: { start: 0.9 * px, end: 0 },
      alpha: { start: 1, end: 0 },
      rotate: 0,
      tint: [0xffffff, 0xffd080, 0xff8b3d],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.cyanSparks = this.add.particles(0, 0, TEX.spark, {
      lifespan: { min: 300, max: 700 },
      speed: { min: 160 * px, max: 520 * px },
      scale: { start: 0.9 * px, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0x9ff6ff, 0x6ff3e4],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    const debrisBase = {
      lifespan: { min: 380, max: 800 },
      speed: { min: 60 * px, max: 260 * px },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      emitting: false,
    };
    this.debris = this.add.particles(0, 0, TEX.dot, { ...debrisBase, scale: { start: 0.38 * px, end: 0.08 * px }, tint: [0x7a4a30, 0xc98a5a, 0xffa060] });
    this.heavyDebris = this.add.particles(0, 0, TEX.dot, { ...debrisBase, scale: { start: 0.5 * px, end: 0.1 * px }, tint: [0x3b3642, 0x77727f, 0xff7a30] });
    for (const e of [this.sparks, this.cyanSparks]) {
      e.ops.rotate.onEmit = (p?: Phaser.GameObjects.Particles.Particle) => (p ? Phaser.Math.RadToDeg(Math.atan2(p.velocityY, p.velocityX)) : 0);
      e.ops.rotate.onUpdate = (p: Phaser.GameObjects.Particles.Particle) => Phaser.Math.RadToDeg(Math.atan2(p.velocityY, p.velocityX));
    }
  }

  private createReticle(): void {
    this.lock = this.add.graphics().setDepth(900);
    this.reticleRing = this.add.graphics();
    this.reticleCore = this.add.graphics();
    this.reticle = this.add.container(0, 0, [this.reticleRing, this.reticleCore]).setDepth(1000).setVisible(false);
    this.drawReticle(false);
  }

  private drawReticle(hot: boolean): void {
    const s = this.px;
    const color = hot ? COLORS.ember : COLORS.scan;
    const r = 22 * s;
    const g = this.reticleRing;
    g.clear();
    g.lineStyle(2 * s, color, 0.95);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + 0.28;
      g.beginPath();
      g.arc(0, 0, r, a, a + Math.PI / 2 - 0.56);
      g.strokePath();
    }
    g.lineStyle(2 * s, color, 0.8);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      g.lineBetween(Math.cos(a) * (r + 4 * s), Math.sin(a) * (r + 4 * s), Math.cos(a) * (r + 11 * s), Math.sin(a) * (r + 11 * s));
    }
    const c = this.reticleCore;
    c.clear();
    c.fillStyle(0xffffff, 1);
    c.fillCircle(0, 0, 2.2 * s);
    c.lineStyle(1.5 * s, color, 0.7);
    c.strokeCircle(0, 0, 7 * s);
  }

  private layout(): void {
    const { width: w, height: h } = this.scale;
    const portrait = h > w;
    const r = Phaser.Math.Clamp(Math.min(w * (portrait ? 0.26 : 0.16), h * 0.15), 56 * this.px, 170 * this.px);
    this.earth.r = r;
    this.earth.x = w / 2;
    this.earth.y = h - r * (portrait ? 1.45 : 1.18);

    const cover = Math.max(w, h) / 512;
    this.nebula.setPosition(w / 2, h / 2).setScale(cover * 1.3);
    this.starsA.setSize(w, h);
    this.starsB.setSize(w, h);
    this.starsA.setTileScale(this.px);
    this.starsB.setTileScale(this.px);

    const d = r * 2;
    const tileScale = d / 256;
    this.earthSurface.setPosition(this.earth.x, this.earth.y).setSize(d, d).setTileScale(tileScale);
    this.earthClouds.setPosition(this.earth.x, this.earth.y).setSize(d, d).setTileScale(tileScale * 1.02);
    this.earthMask.clear().fillStyle(0xffffff).fillCircle(this.earth.x, this.earth.y, r);
    const texScale = r / (512 * PLANET_IN_TEX);
    for (const img of [this.earthShade, this.earthDamage, this.earthFlash, this.atmosphere]) img.setPosition(this.earth.x, this.earth.y).setScale(texScale);
    this.atmosphereOuter.setPosition(this.earth.x, this.earth.y).setScale(texScale * 1.45);
    this.shield.setPosition(this.earth.x, this.earth.y);
    this.shieldFill.setPosition(this.earth.x, this.earth.y);
  }

  // ---------------------------------------------------------------- per-frame

  private updateSky(dt: number): void {
    const speed = (this.sim.storm ? 26 : 10) * this.px;
    this.starsA.tilePositionY -= (dt * speed) / this.px;
    this.starsB.tilePositionY -= (dt * speed * 1.8) / this.px;
    this.starsB.setAlpha(0.75 + Math.sin(this.time.now / 700) * 0.2);
  }

  private updateEarth(dt: number): void {
    this.earthSurface.tilePositionX += dt * 7 * this.earthSpin;
    this.earthClouds.tilePositionX += dt * 11 * this.earthSpin;
    const breath = Math.sin(this.time.now / 900);
    const base = this.earth.r / (512 * PLANET_IN_TEX);
    this.atmosphere.setScale(base * (1.0 + breath * 0.012));
    this.atmosphereOuter.setScale(base * (1.45 + breath * 0.03));
    if (this.shield.visible && this.shieldWave < 0) {
      const pulse = 1 + Math.sin(this.time.now / 260) * 0.015;
      this.shield.setScale(((this.earth.r * 1.42) / 128) * pulse);
      this.shieldFill.setScale(((this.earth.r * 3.1) / 128) * pulse);
    }
  }

  private updateAmbient(dt: number): void {
    if (this.sim.phase !== 'attract') return;
    this.ambientIn -= dt;
    if (this.ambientIn > 0) return;
    this.ambientIn = 1.4 + Math.random() * 1.6;
    this.spawnMeteor(Math.random() < 0.2 ? 'heavy' : 'normal', 6, true);
  }

  private updateMeteors(dt: number): void {
    const { width: w, height: h } = this.scale;
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.p += dt / m.travel;
      const prevX = m.x;
      const prevY = m.y;
      this.positionMeteor(m, w, h);
      const vx = m.x - prevX;
      const vy = m.y - prevY;
      const len = Math.hypot(vx, vy) || 1;
      m.dirX = vx / len;
      m.dirY = vy / len;
      m.img.rotation += m.spin * dt;
      m.glow.setPosition(m.x - m.dirX * m.radius * 0.35, m.y - m.dirY * m.radius * 0.35);

      const tx = m.x - m.dirX * m.radius * 0.6;
      const ty = m.y - m.dirY * m.radius * 0.6;
      if (m.kind === 'heavy') {
        this.trailHeavy.emitParticleAt(tx, ty, 2);
        if (Math.random() < 0.5) this.smoke.emitParticleAt(tx, ty, 1);
      } else if (m.kind === 'energy') {
        this.trailEnergy.emitParticleAt(tx, ty, 2);
      } else {
        this.trail.emitParticleAt(tx, ty, 1);
        if (Math.random() < 0.5) this.trail.emitParticleAt(tx, ty, 1);
      }

      if (m.p >= 1) {
        this.meteors.splice(i, 1);
        if (m.ambient) this.destroyMeteor(m);
        else this.impact(m);
      }
    }
  }

  private positionMeteor(m: Meteor, w: number, h: number): void {
    const sx = m.sx * w;
    const sy = m.sy * h;
    let ex: number;
    let ey: number;
    if (m.ambient) {
      ex = (1 - m.sx) * w;
      ey = m.sy * h + h * 0.5;
    } else {
      ex = this.earth.x + Math.cos(m.angle) * (this.earth.r * 1.02 + m.radius * 0.2);
      ey = this.earth.y + Math.sin(m.angle) * (this.earth.r * 1.02 + m.radius * 0.2);
    }
    const t = m.p * 0.8 + m.p * m.p * 0.2;
    const dx = ex - sx;
    const dy = ey - sy;
    const bend = Math.sin(t * Math.PI) * m.curve;
    m.x = sx + dx * t - dy * bend;
    m.y = sy + dy * t + dx * bend;
    m.img.setPosition(m.x, m.y);
  }

  private updateShieldWave(): void {
    if (this.shieldWave < 0) return;
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      if (Math.hypot(m.x - this.earth.x, m.y - this.earth.y) < this.shieldWave + m.radius) {
        this.meteors.splice(i, 1);
        this.explode(m, true);
        this.destroyMeteor(m);
      }
    }
  }

  private updateReticle(dt: number): void {
    const st = this.reticleState;
    const active = this.sim.phase === 'playing' || this.sim.phase === 'countdown';
    st.x += (st.tx - st.x) * (1 - Math.exp(-dt * 38));
    st.y += (st.ty - st.y) * (1 - Math.exp(-dt * 38));

    this.hovered = null;
    if (active && !st.touch && st.visible) this.hovered = this.pick(st.tx, st.ty);
    const hot = this.hovered !== null;
    if (hot !== st.hot) {
      st.hot = hot;
      this.drawReticle(hot);
    }
    st.focus += ((hot ? 1 : 0) - st.focus) * (1 - Math.exp(-dt * 18));
    st.kick *= Math.exp(-dt * 14);
    st.spin += dt * (0.7 + st.focus * 3);

    const show = active && (st.touch ? st.kick > 0.05 : st.visible);
    this.reticle.setVisible(show);
    if (show) {
      this.reticle.setPosition(st.x, st.y);
      this.reticle.setScale(1 - st.focus * 0.2 - st.kick * 0.28);
      this.reticleRing.rotation = st.spin;
      this.reticle.setAlpha(st.touch ? Math.min(1, st.kick * 2) : 1);
    }

    this.lock.clear();
    for (const m of this.meteors) {
      m.glow.setAlpha(m === this.hovered ? 1 : m.kind === 'energy' ? 0.85 : 0.6);
    }
    if (this.hovered) {
      const m = this.hovered;
      const s = m.radius * 1.35 + 6 * this.px;
      const len = s * 0.45;
      this.lock.lineStyle(2 * this.px, COLORS.ember, 0.9);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const cx = m.x + sx * s;
        const cy = m.y + sy * s;
        this.lock.beginPath();
        this.lock.moveTo(cx, cy - sy * len);
        this.lock.lineTo(cx, cy);
        this.lock.lineTo(cx - sx * len, cy);
        this.lock.strokePath();
      }
    }
  }

  // ---------------------------------------------------------------- input

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const st = this.reticleState;
    st.touch = pointer.wasTouch;
    st.tx = pointer.x;
    st.ty = pointer.y;
    if (!st.visible) {
      st.x = pointer.x;
      st.y = pointer.y;
    }
    st.visible = true;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const st = this.reticleState;
    st.touch = pointer.wasTouch;
    st.tx = st.x = pointer.x;
    st.ty = st.y = pointer.y;
    st.visible = true;
    if (this.sim.phase !== 'playing') return;

    st.kick = 1;
    sfx.fire();
    const target = this.pick(pointer.x, pointer.y);
    this.muzzle(pointer.x, pointer.y, target !== null);
    if (target) this.hit(target);
    else sfx.miss();
  }

  private pick(x: number, y: number): Meteor | null {
    let best: Meteor | null = null;
    let bestD = Infinity;
    const touch = this.reticleState.touch;
    for (const m of this.meteors) {
      if (m.ambient || m.p < 0.02) continue;
      const hitR = Math.max(m.radius * 1.3, m.radius + (touch ? 20 : 12) * this.px, (touch ? 34 : 26) * this.px);
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < hitR && d - m.radius < bestD) {
        best = m;
        bestD = d - m.radius;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- meteors

  private spawnMeteor(kind: MeteorKind, travel: number, ambient = false): void {
    const spec = METEORS[kind];
    const { width: w, height: h } = this.scale;
    const margin = 0.08;
    let sx: number;
    let sy: number;
    const side = Math.random();
    if (ambient) {
      sx = Math.random() < 0.5 ? -margin : 1 + margin;
      sy = -0.1 + Math.random() * 0.3;
    } else if (side < 0.62) {
      sx = 0.06 + Math.random() * 0.88;
      sy = -margin * (w / h > 1 ? 1.4 : 0.7);
    } else {
      sx = side < 0.81 ? -margin : 1 + margin;
      sy = 0.02 + Math.random() * 0.34;
    }

    const toStart = Math.atan2(sy * h - this.earth.y, sx * w - this.earth.x);
    const angle = toStart + (Math.random() - 0.5) * 0.6;
    const variant = kind === 'heavy' ? Math.floor(Math.random() * HEAVY_VARIANTS) : Math.floor(Math.random() * NORMAL_VARIANTS);
    const key = kind === 'heavy' ? TEX.heavy(variant) : kind === 'energy' ? TEX.energy : TEX.normal(variant);
    const minR = (kind === 'heavy' ? 24 : kind === 'energy' ? 13 : 17) * this.px;
    const radius = Math.max(minR, spec.size * this.earth.r * (0.88 + Math.random() * 0.26)) * (ambient ? 0.55 : 1);
    const scale = radius / (METEOR_TEX * METEOR_BODY);

    const glow = this.add.image(0, 0, TEX.glow)
      .setTint(kind === 'energy' ? 0x6ff3e4 : kind === 'heavy' ? 0xff5a20 : 0xff7a2a)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale((radius * (kind === 'heavy' ? 3.4 : 3)) / 128)
      .setAlpha(ambient ? 0.35 : 0.6);
    const img = this.add.image(-999, -999, key).setScale(scale).setRotation(Math.random() * Math.PI * 2);
    if (ambient) img.setAlpha(0.6);
    img.setDepth(10);
    glow.setDepth(9);

    const m: Meteor = {
      kind,
      spec,
      hp: spec.hp,
      variant,
      img,
      glow,
      sx,
      sy,
      angle,
      curve: (Math.random() - 0.5) * 0.18,
      p: 0,
      travel: travel * spec.travel * (0.92 + Math.random() * 0.16),
      radius,
      spin: (Math.random() - 0.5) * (kind === 'heavy' ? 1.2 : 3),
      x: -999,
      y: -999,
      dirX: 0,
      dirY: 1,
      ambient,
    };
    this.positionMeteor(m, w, h);
    this.meteors.push(m);
  }

  private destroyMeteor(m: Meteor): void {
    this.tweens.killTweensOf(m.img);
    m.img.destroy();
    m.glow.destroy();
    if (this.hovered === m) this.hovered = null;
  }

  private hit(m: Meteor): void {
    m.hp -= 1;
    if (m.hp > 0) {
      m.img.setTexture(TEX.heavyCracked(m.variant));
      m.img.setTintFill(0xffffff);
      this.time.delayedCall(55, () => m.img.active && m.img.clearTint());
      this.tweens.killTweensOf(m.img);
      const base = m.radius / (METEOR_TEX * METEOR_BODY);
      m.radius *= 0.94;
      m.img.setScale(base * 1.22);
      this.tweens.add({ targets: m.img, scale: base * 0.94, duration: 180, ease: 'Back.Out' });
      m.p = Math.max(0, m.p - 0.045);
      m.spin *= -1.8;
      this.sparks.emitParticleAt(m.x, m.y, 14);
      this.heavyDebris.emitParticleAt(m.x, m.y, 6);
      this.ring(m.x, m.y, m.radius * 0.8, m.radius * 2.2, 0xffb070, 220);
      this.floatText(m.x, m.y - m.radius, 'CRACKED', '#ffb070', 0.75);
      sfx.heavyHit();
      haptics.medium();
      return;
    }
    const idx = this.meteors.indexOf(m);
    if (idx >= 0) this.meteors.splice(idx, 1);
    this.sim.meteorDestroyed(m.kind);
    this.explode(m, false);
    if (m.kind === 'energy') {
      this.floatText(m.x, m.y - m.radius, `+${m.spec.heal}% INTEGRITY`, '#9ff6ff', 1);
      this.floatText(m.x, m.y - m.radius + 26 * this.px, `+${m.spec.score}`, '#f5c451', 0.8);
      this.earthPulse(COLORS.scan, 0.5);
      sfx.energy();
      haptics.medium();
    } else {
      this.floatText(m.x, m.y - m.radius, `+${m.spec.score}`, m.kind === 'heavy' ? '#ffd080' : '#ffffff', m.kind === 'heavy' ? 1.2 : 1);
      sfx.explode(m.kind === 'heavy');
      if (m.kind === 'heavy') {
        haptics.medium();
        this.cameras.main.shake(110, 0.0035);
      } else {
        haptics.light();
      }
    }
    this.destroyMeteor(m);
  }

  private explode(m: Meteor, byShield: boolean): void {
    const heavy = m.kind === 'heavy';
    const energy = m.kind === 'energy';
    const cyan = byShield || energy;
    const r = m.radius;
    this.flashAt(m.x, m.y, r * (heavy ? 5 : 4), cyan ? 0xbffcff : 0xffe6b0, heavy ? 200 : 150);
    this.ring(m.x, m.y, r * 0.6, r * (heavy ? 3.6 : 2.8), cyan ? COLORS.scan : 0xffa050, heavy ? 340 : 280);
    (cyan ? this.cyanSparks : this.sparks).emitParticleAt(m.x, m.y, heavy ? 28 : 16);
    (heavy ? this.heavyDebris : this.debris).emitParticleAt(m.x, m.y, heavy ? 14 : 8);
    if (!energy) this.smoke.emitParticleAt(m.x, m.y, heavy ? 6 : 3);
  }

  private impact(m: Meteor): void {
    if (m.kind === 'energy') {
      this.cyanSparks.emitParticleAt(m.x, m.y, 8);
      this.destroyMeteor(m);
      return;
    }
    const heavy = m.kind === 'heavy';
    const defeated = this.sim.meteorImpact(m.kind);
    const nx = Math.cos(m.angle);
    const ny = Math.sin(m.angle);
    const angleDeg = Phaser.Math.RadToDeg(m.angle);
    this.flashAt(m.x, m.y, m.radius * (defeated ? 12 : heavy ? 7 : 5.5), 0xffd0a0, defeated ? 500 : 260);
    this.ring(m.x, m.y, m.radius, m.radius * (defeated ? 9 : 4.5), 0xff7040, defeated ? 700 : 380);
    this.sparks.emitParticleAt(m.x, m.y, defeated ? 60 : heavy ? 34 : 22);
    this.sparks.setEmitterAngle({ min: angleDeg - 70, max: angleDeg + 70 });
    this.sparks.emitParticleAt(m.x + nx * 4, m.y + ny * 4, defeated ? 40 : 16);
    this.sparks.setEmitterAngle({ min: 0, max: 360 });
    this.smoke.emitParticleAt(m.x, m.y, defeated ? 18 : 8);
    (heavy ? this.heavyDebris : this.debris).emitParticleAt(m.x, m.y, 12);
    this.destroyMeteor(m);

    this.earthFlash.setAlpha(defeated ? 0.9 : heavy ? 0.6 : 0.42);
    this.tweens.killTweensOf(this.earthFlash);
    this.tweens.add({ targets: this.earthFlash, alpha: 0, duration: defeated ? 700 : 280, ease: 'Quad.Out' });

    const lost = 100 - this.sim.integrity;
    this.damageLevel = Math.min(1, lost / 100);
    this.tweens.killTweensOf([this.earthDamage, this.atmosphere, this.atmosphereOuter]);
    this.tweens.add({ targets: this.earthDamage, alpha: this.damageLevel * 0.45, duration: 400 });
    const hurt = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(COLORS.atmo),
      Phaser.Display.Color.ValueToColor(COLORS.atmoHurt),
      100,
      Math.round(this.damageLevel * 80),
    );
    const tint = Phaser.Display.Color.GetColor(hurt.r, hurt.g, hurt.b);
    this.atmosphere.setTint(tint);
    this.atmosphereOuter.setTint(tint);

    this.ui.damagePulse(defeated);
    if (defeated) {
      this.playDefeat();
      return;
    }
    this.cameras.main.shake(heavy ? 260 : 190, heavy ? 0.011 : 0.007);
    sfx.earthImpact(false);
    haptics.heavy();
  }

  // ---------------------------------------------------------------- fx helpers

  private flashAt(x: number, y: number, size: number, tint: number, duration: number): void {
    const img = this.add.image(x, y, TEX.glow).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(20);
    img.setScale((size * 0.5) / 64);
    this.tweens.add({ targets: img, scale: size / 64, alpha: 0, duration, ease: 'Quad.Out', onComplete: () => img.destroy() });
  }

  private ring(x: number, y: number, from: number, to: number, tint: number, duration: number): void {
    const img = this.add.image(x, y, TEX.ring).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(20);
    img.setScale(from / 128).setAlpha(0.9);
    this.tweens.add({ targets: img, scale: to / 128, alpha: 0, duration, ease: 'Cubic.Out', onComplete: () => img.destroy() });
  }

  private muzzle(x: number, y: number, hitSomething: boolean): void {
    const img = this.add.image(x, y, TEX.glow).setTint(hitSomething ? 0xfff0c0 : COLORS.scan).setBlendMode(Phaser.BlendModes.ADD).setDepth(950);
    img.setScale((18 * this.px) / 64).setAlpha(0.9);
    this.tweens.add({ targets: img, scale: (6 * this.px) / 64, alpha: 0, duration: 110, onComplete: () => img.destroy() });
  }

  private floatText(x: number, y: number, text: string, color: string, size: number): void {
    const t = this.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontStyle: '700',
        fontSize: `${Math.round(20 * size * this.px)}px`,
        color,
        stroke: '#1a0a02',
        strokeThickness: 3 * this.px,
      })
      .setOrigin(0.5)
      .setDepth(800)
      .setScale(1.5)
      .setShadow(0, 0, color, 10 * this.px, false, true);
    this.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.Out' });
    this.tweens.add({ targets: t, y: y - 42 * this.px, alpha: 0, duration: 760, delay: 180, ease: 'Quad.In', onComplete: () => t.destroy() });
  }

  private earthPulse(tint: number, strength: number): void {
    const img = this.add.image(this.earth.x, this.earth.y, TEX.atmosphere).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(5);
    const base = this.earth.r / (512 * PLANET_IN_TEX);
    img.setScale(base).setAlpha(strength);
    this.tweens.add({ targets: img, scale: base * 1.6, alpha: 0, duration: 700, ease: 'Cubic.Out', onComplete: () => img.destroy() });
  }

  // ---------------------------------------------------------------- endings

  private playVictory(): void {
    const run = this.runId;
    this.ui.endRun();
    this.reticleState.kick = 0;
    sfx.stopDrone(0.3);
    sfx.activation();
    this.tweens.addCounter({ from: 1, to: 0.12, duration: 260, onUpdate: (tw) => (this.worldSpeed = tw.getValue() ?? 1) });

    this.time.delayedCall(520, () => {
      if (run !== this.runId) return;
      this.ui.flash('cyan');
      this.earthPulse(COLORS.scan, 1);
      this.earthPulse(0xffffff, 0.6);
      this.cameras.main.shake(180, 0.006);
      this.cameras.main.zoomTo(1.04, 140, Phaser.Math.Easing.Quadratic.Out, true);
      this.time.delayedCall(160, () => run === this.runId && this.cameras.main.zoomTo(1, 700, Phaser.Math.Easing.Cubic.Out, true));
      haptics.success();

      this.shieldWave = this.earth.r;
      const maxR = Math.hypot(this.scale.width, this.scale.height);
      const wave = this.add.image(this.earth.x, this.earth.y, TEX.ring).setTint(COLORS.scan).setBlendMode(Phaser.BlendModes.ADD).setDepth(30);
      wave.setScale(this.earth.r / 128);
      this.tweens.addCounter({
        from: this.earth.r,
        to: maxR,
        duration: 900,
        ease: 'Cubic.Out',
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          this.shieldWave = v;
          wave.setScale(v / 128).setAlpha(1 - (v - this.earth.r) / maxR);
        },
        onComplete: () => {
          wave.destroy();
          this.shieldWave = -1;
          this.worldSpeed = 1;
        },
      });

      this.shield.setVisible(true).setAlpha(0).setScale(this.earth.r / 128);
      this.shieldFill.setVisible(true).setAlpha(0).setScale(this.earth.r / 128);
      this.tweens.add({ targets: this.shield, alpha: 0.85, scale: (this.earth.r * 1.42) / 128, duration: 500, ease: 'Back.Out' });
      this.tweens.add({ targets: this.shieldFill, alpha: 0.22, scale: (this.earth.r * 3.1) / 128, duration: 600, ease: 'Cubic.Out' });
      this.tweens.add({ targets: [this.atmosphere, this.atmosphereOuter], alpha: 1, duration: 400 });
      this.atmosphere.setTint(0x7ff4ff);
      this.atmosphereOuter.setTint(0x7ff4ff);
      this.tweens.add({ targets: this.earthDamage, alpha: 0, duration: 900 });
    });

    this.time.delayedCall(1250, () => run === this.runId && sfx.victory());
    this.time.delayedCall(2000, () => {
      if (run !== this.runId) return;
      this.ui.showVictory(this.sim.stats);
    });
  }

  private playDefeat(): void {
    const run = this.runId;
    this.ui.endRun();
    this.ui.flash('white');
    this.cameras.main.shake(520, 0.022);
    sfx.earthImpact(true);
    sfx.stopDrone(0.8);
    sfx.fadeBus(0.55, 1.2);
    sfx.gameOver();
    haptics.error();
    this.worldSpeed = 0.25;

    for (const m of this.meteors) {
      this.tweens.add({ targets: [m.img, m.glow], alpha: 0, duration: 700 });
    }
    this.tweens.addCounter({ from: 1, to: 0.15, duration: 1500, onUpdate: (tw) => (this.earthSpin = tw.getValue() ?? 1) });
    this.tweens.add({ targets: this.earthDamage, alpha: 0.72, duration: 1200 });
    this.tweens.add({ targets: this.earthClouds, alpha: 0.25, duration: 1200 });
    this.tweens.add({ targets: [this.atmosphere, this.atmosphereOuter], alpha: 0.25, duration: 1400 });
    this.atmosphere.setTint(0xff4a2a);
    this.atmosphereOuter.setTint(0xff4a2a);

    for (let i = 0; i < 5; i++) {
      this.time.delayedCall(150 + i * 170, () => {
        if (run !== this.runId) return;
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const x = this.earth.x + Math.cos(a) * this.earth.r * 0.92;
        const y = this.earth.y + Math.sin(a) * this.earth.r * 0.92;
        this.flashAt(x, y, this.earth.r * 0.7, 0xff9060, 360);
        this.smoke.emitParticleAt(x, y, 6);
        this.sparks.emitParticleAt(x, y, 10);
      });
    }

    this.time.delayedCall(1000, () => {
      if (run !== this.runId) return;
      for (const m of this.meteors) this.destroyMeteor(m);
      this.meteors.length = 0;
    });
    this.time.delayedCall(1800, () => {
      if (run !== this.runId) return;
      this.ui.showDefeat(this.sim.stats);
    });
  }
}
