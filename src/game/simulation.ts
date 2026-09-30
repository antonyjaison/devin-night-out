import {
  COUNTDOWN_SECONDS,
  CRITICAL_INTEGRITY,
  ENERGY,
  IMMINENT_AT,
  METEORS,
  RUN_SECONDS,
  STAGES,
  STORM_WARNING_AT,
  type MeteorKind,
  type Stage,
} from './config';

export type Phase = 'attract' | 'countdown' | 'playing' | 'victory' | 'defeat';

export type SimEvent =
  | { type: 'countdown'; value: number }
  | { type: 'start' }
  | { type: 'spawn'; kind: MeteorKind; travel: number }
  | { type: 'storm' }
  | { type: 'imminent' }
  | { type: 'tick'; second: number }
  | { type: 'critical' }
  | { type: 'victory' }
  | { type: 'defeat' };

export interface RunStats {
  survived: number;
  destroyed: number;
  integrity: number;
  score: number;
}

/** Owns the rules of a run: clock, spawn schedule, integrity and score. */
export class Simulation {
  phase: Phase = 'attract';
  timeLeft = RUN_SECONDS;
  countdown = COUNTDOWN_SECONDS;
  integrity = 100;
  score = 0;
  destroyed = 0;
  active = 0;

  private spawnIn = 0;
  private energyReadyAt = ENERGY.firstAt;
  private lastSecond = RUN_SECONDS;
  private stormFired = false;
  private imminentFired = false;
  private criticalFired = false;
  private events: SimEvent[] = [];

  reset(): void {
    this.phase = 'countdown';
    this.timeLeft = RUN_SECONDS;
    this.countdown = COUNTDOWN_SECONDS;
    this.integrity = 100;
    this.score = 0;
    this.destroyed = 0;
    this.active = 0;
    this.spawnIn = 0.7;
    this.energyReadyAt = ENERGY.firstAt;
    this.lastSecond = RUN_SECONDS;
    this.stormFired = false;
    this.imminentFired = false;
    this.criticalFired = false;
    this.events.length = 0;
    this.emit({ type: 'countdown', value: COUNTDOWN_SECONDS });
  }

  get stage(): Stage {
    return STAGES.find((s) => this.timeLeft > s.until) ?? STAGES[STAGES.length - 1];
  }

  get storm(): boolean {
    return this.phase === 'playing' && this.timeLeft <= STORM_WARNING_AT;
  }

  get critical(): boolean {
    return this.integrity <= CRITICAL_INTEGRITY && this.integrity > 0;
  }

  get stats(): RunStats {
    return {
      survived: RUN_SECONDS - this.timeLeft,
      destroyed: this.destroyed,
      integrity: this.integrity,
      score: this.score,
    };
  }

  update(dt: number): SimEvent[] {
    if (this.phase === 'countdown') this.updateCountdown(dt);
    else if (this.phase === 'playing') this.updatePlaying(dt);
    const out = this.events;
    this.events = [];
    return out;
  }

  meteorDestroyed(kind: MeteorKind): void {
    if (this.phase !== 'playing') return;
    const spec = METEORS[kind];
    this.destroyed += 1;
    this.score += spec.score;
    if (spec.heal > 0) {
      this.integrity = Math.min(100, this.integrity + spec.heal);
      if (!this.critical) this.criticalFired = false;
    }
  }

  meteorImpact(kind: MeteorKind): boolean {
    if (this.phase !== 'playing') return false;
    const damage = METEORS[kind].damage;
    if (damage <= 0) return false;
    this.integrity = Math.max(0, this.integrity - damage);
    if (this.integrity <= 0) {
      this.phase = 'defeat';
      this.emit({ type: 'defeat' });
      return true;
    }
    if (this.critical && !this.criticalFired) {
      this.criticalFired = true;
      this.emit({ type: 'critical' });
    }
    return false;
  }

  private updateCountdown(dt: number): void {
    const before = Math.ceil(this.countdown);
    this.countdown -= dt;
    const after = Math.ceil(this.countdown);
    if (this.countdown <= 0) {
      this.phase = 'playing';
      this.emit({ type: 'start' });
    } else if (after !== before) {
      this.emit({ type: 'countdown', value: after });
    }
  }

  private updatePlaying(dt: number): void {
    this.timeLeft = Math.max(0, this.timeLeft - dt);

    const second = Math.ceil(this.timeLeft);
    if (second !== this.lastSecond) {
      this.lastSecond = second;
      this.emit({ type: 'tick', second });
    }
    if (!this.stormFired && this.timeLeft <= STORM_WARNING_AT) {
      this.stormFired = true;
      this.emit({ type: 'storm' });
    }
    if (!this.imminentFired && this.timeLeft <= IMMINENT_AT) {
      this.imminentFired = true;
      this.emit({ type: 'imminent' });
    }
    if (this.timeLeft <= 0) {
      this.phase = 'victory';
      this.emit({ type: 'victory' });
      return;
    }

    this.spawnIn -= dt;
    if (this.spawnIn > 0 || this.timeLeft < 0.9) return;
    const stage = this.stage;
    if (this.active >= stage.maxActive) {
      this.spawnIn = 0.15;
      return;
    }
    const [lo, hi] = stage.interval;
    this.spawnIn = lo + Math.random() * (hi - lo);
    this.emit({ type: 'spawn', kind: this.pickKind(stage), travel: stage.travel });
  }

  private pickKind(stage: Stage): MeteorKind {
    if (this.timeLeft <= this.energyReadyAt && this.integrity < 100 && Math.random() < ENERGY.chance) {
      this.energyReadyAt = this.timeLeft - ENERGY.cooldown;
      return 'energy';
    }
    return Math.random() < stage.heavyChance ? 'heavy' : 'normal';
  }

  private emit(e: SimEvent): void {
    this.events.push(e);
  }
}
