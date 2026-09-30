export type MeteorKind = 'normal' | 'heavy' | 'energy';

export interface MeteorSpec {
  hp: number;
  damage: number;
  heal: number;
  score: number;
  /** Visual radius as a fraction of the Earth radius. */
  size: number;
  /** Seconds from spawn to impact, multiplied by the phase travel factor. */
  travel: number;
}

export const RUN_SECONDS = 60;
export const COUNTDOWN_SECONDS = 3;
export const STORM_WARNING_AT = 15;
export const IMMINENT_AT = 10;
export const CRITICAL_INTEGRITY = 40;

export const METEORS: Record<MeteorKind, MeteorSpec> = {
  normal: { hp: 1, damage: 20, heal: 0, score: 100, size: 0.26, travel: 1 },
  heavy: { hp: 2, damage: 40, heal: 0, score: 250, size: 0.4, travel: 1.3 },
  energy: { hp: 1, damage: 0, heal: 20, score: 300, size: 0.18, travel: 0.62 },
};

export interface Stage {
  /** Stage applies while timeLeft is above this value. */
  until: number;
  interval: [number, number];
  travel: number;
  heavyChance: number;
  maxActive: number;
}

export const STAGES: Stage[] = [
  { until: 45, interval: [1.4, 1.6], travel: 4.6, heavyChance: 0, maxActive: 4 },
  { until: 30, interval: [1.1, 1.3], travel: 4.1, heavyChance: 0.22, maxActive: 5 },
  { until: 15, interval: [0.8, 1.0], travel: 3.5, heavyChance: 0.26, maxActive: 6 },
  { until: 10, interval: [0.62, 0.74], travel: 3.2, heavyChance: 0.26, maxActive: 7 },
  { until: 0, interval: [0.46, 0.58], travel: 3.0, heavyChance: 0.22, maxActive: 8 },
];

export const ENERGY = {
  firstAt: 42,
  cooldown: 13,
  chance: 0.12,
};
