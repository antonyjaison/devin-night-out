type Wave = OscillatorType;

const MUTE_KEY = 'stti-muted';

/** Procedural WebAudio sound effects. Created lazily on first user gesture. */
class Sfx {
  muted = localStorage.getItem(MUTE_KEY) === '1';
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private drone: { gain: GainNode; filter: BiquadFilterNode; oscs: OscillatorNode[] } | null = null;

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.bus = this.ctx.createGain();
      this.bus.connect(this.master);
      this.noise = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  /** Restore bus level after a fade-out (e.g. on restart). */
  restoreBus(): void {
    if (!this.ctx || !this.bus) return;
    this.bus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.bus.gain.setTargetAtTime(1, this.ctx.currentTime, 0.05);
  }

  fadeBus(to: number, seconds: number): void {
    if (!this.ctx || !this.bus) return;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(to, t + seconds);
  }

  fire(): void {
    this.tone({ type: 'square', from: 1400, to: 520, dur: 0.06, vol: 0.07 });
  }

  miss(): void {
    this.tone({ type: 'triangle', from: 700, to: 380, dur: 0.05, vol: 0.05 });
  }

  explode(big = false): void {
    this.burst({ dur: big ? 0.55 : 0.32, vol: big ? 0.5 : 0.36, freq: big ? 900 : 1600, q: 0.7 });
    this.tone({ type: 'sine', from: big ? 150 : 210, to: 40, dur: big ? 0.4 : 0.22, vol: big ? 0.5 : 0.34 });
    this.tone({ type: 'triangle', from: 1800, to: 900, dur: 0.05, vol: 0.05, delay: 0.005 });
  }

  heavyHit(): void {
    this.tone({ type: 'square', from: 240, to: 150, dur: 0.12, vol: 0.14 });
    this.tone({ type: 'triangle', from: 2100, to: 1300, dur: 0.1, vol: 0.08 });
    this.burst({ dur: 0.12, vol: 0.2, freq: 3200, q: 2 });
  }

  energy(): void {
    [660, 990, 1320].forEach((f, i) => this.tone({ type: 'sine', from: f, to: f * 1.02, dur: 0.18, vol: 0.12, delay: i * 0.05 }));
  }

  earthImpact(final = false): void {
    this.burst({ dur: final ? 1.4 : 0.7, vol: final ? 0.8 : 0.6, freq: 500, q: 0.5 });
    this.tone({ type: 'sine', from: final ? 110 : 130, to: 28, dur: final ? 1.2 : 0.6, vol: final ? 0.9 : 0.7 });
    this.tone({ type: 'sawtooth', from: 90, to: 35, dur: 0.35, vol: 0.12 });
  }

  click(): void {
    this.tone({ type: 'square', from: 1800, to: 1800, dur: 0.025, vol: 0.05 });
    this.tone({ type: 'sine', from: 900, to: 1200, dur: 0.07, vol: 0.06, delay: 0.02 });
  }

  hover(): void {
    this.tone({ type: 'sine', from: 1500, to: 1700, dur: 0.03, vol: 0.02 });
  }

  countdown(go = false): void {
    if (go) {
      this.tone({ type: 'sawtooth', from: 440, to: 880, dur: 0.35, vol: 0.12 });
      this.tone({ type: 'sine', from: 880, to: 880, dur: 0.4, vol: 0.12 });
    } else {
      this.tone({ type: 'sine', from: 660, to: 660, dur: 0.14, vol: 0.14 });
    }
  }

  beep(pitch = 880, vol = 0.1): void {
    this.tone({ type: 'square', from: pitch, to: pitch, dur: 0.07, vol });
    this.tone({ type: 'sine', from: pitch * 2, to: pitch * 2, dur: 0.05, vol: vol * 0.5 });
  }

  warning(): void {
    for (let i = 0; i < 3; i++) {
      this.tone({ type: 'sawtooth', from: 520, to: 820, dur: 0.22, vol: 0.09, delay: i * 0.46 });
      this.tone({ type: 'sawtooth', from: 820, to: 520, dur: 0.22, vol: 0.09, delay: i * 0.46 + 0.23 });
    }
  }

  critical(): void {
    this.tone({ type: 'square', from: 300, to: 300, dur: 0.1, vol: 0.07 });
    this.tone({ type: 'square', from: 300, to: 300, dur: 0.1, vol: 0.07, delay: 0.16 });
  }

  activation(): void {
    this.tone({ type: 'sawtooth', from: 110, to: 880, dur: 0.9, vol: 0.14 });
    this.burst({ dur: 1.2, vol: 0.28, freq: 2400, q: 0.4, delay: 0.55 });
    this.tone({ type: 'sine', from: 70, to: 30, dur: 1, vol: 0.5, delay: 0.55 });
  }

  victory(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => this.tone({ type: 'triangle', from: f, to: f, dur: 0.5, vol: 0.12, delay: i * 0.1 }));
    [523.25, 783.99, 1046.5].forEach((f) => this.tone({ type: 'sine', from: f, to: f, dur: 1.6, vol: 0.07, delay: 0.55 }));
  }

  gameOver(): void {
    const notes = [392, 349.23, 311.13, 233.08];
    notes.forEach((f, i) => this.tone({ type: 'sawtooth', from: f, to: f * 0.97, dur: 0.5, vol: 0.08, delay: 0.6 + i * 0.32 }));
    this.tone({ type: 'sine', from: 55, to: 45, dur: 2.4, vol: 0.2, delay: 0.6 });
  }

  startDrone(): void {
    if (!this.ctx || !this.bus || this.drone) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    filter.Q.value = 6;
    filter.connect(gain).connect(this.bus);
    const oscs = [55, 55.4, 82.4].map((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      o.connect(filter);
      o.start();
      return o;
    });
    this.drone = { gain, filter, oscs };
    gain.gain.setTargetAtTime(0.1, this.ctx.currentTime, 0.8);
  }

  /** 0 = calm, 1 = full storm. */
  setTension(level: number): void {
    if (!this.ctx || !this.drone) return;
    const t = this.ctx.currentTime;
    this.drone.filter.frequency.setTargetAtTime(260 + level * 1200, t, 0.6);
    this.drone.gain.gain.setTargetAtTime(0.1 + level * 0.08, t, 0.6);
    this.drone.oscs[2].frequency.setTargetAtTime(82.4 + level * 27.6, t, 1.2);
  }

  stopDrone(seconds = 0.6): void {
    if (!this.ctx || !this.drone) return;
    const d = this.drone;
    this.drone = null;
    d.gain.gain.setTargetAtTime(0, this.ctx.currentTime, seconds / 3);
    d.oscs.forEach((o) => o.stop(this.ctx!.currentTime + seconds + 0.5));
  }

  private tone(o: { type: Wave; from: number; to: number; dur: number; vol: number; delay?: number }): void {
    if (!this.ctx || !this.bus || this.muted) return;
    const t = this.ctx.currentTime + (o.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + o.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(this.bus);
    osc.start(t);
    osc.stop(t + o.dur + 0.02);
  }

  private burst(o: { dur: number; vol: number; freq: number; q: number; delay?: number }): void {
    if (!this.ctx || !this.bus || !this.noise || this.muted) return;
    const t = this.ctx.currentTime + (o.delay ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(o.freq, t);
    f.frequency.exponentialRampToValueAtTime(80, t + o.dur);
    f.Q.value = o.q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(o.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.05);
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
}

export const sfx = new Sfx();
