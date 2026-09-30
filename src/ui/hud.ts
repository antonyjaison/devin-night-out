import { RUN_SECONDS } from '../game/config';
import type { RunStats, Simulation } from '../game/simulation';

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element ${sel}`);
  return el;
};

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function restartAnimation(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export interface UiHandlers {
  start(): void;
  restart(): void;
  toggleSound(): boolean;
  press(): void;
}

/** DOM HUD, menus and screen-space effects layered over the canvas. */
export class Ui {
  private body = document.body;
  private integrityValue = $('[data-integrity]');
  private integrityFill = $('.integrity-fill');
  private integrityTrail = $('.integrity-trail');
  private integrityBar = $('.integrity-bar');
  private timer = $('[data-timer]');
  private rebootFill = $('.reboot-fill');
  private threats = $('[data-threats]');
  private score = $('[data-score]');
  private stormBanner = $('.storm-banner');
  private finalCount = $('.final-count');
  private countdownEl = $('.countdown');
  private damage = $('.fx-damage');
  private flashEl = $('.fx-flash');
  private start = $('#screen-start');
  private victory = $('#screen-victory');
  private defeat = $('#screen-defeat');
  private soundBtn = $<HTMLButtonElement>('.sound-toggle');

  private shown = { integrity: -1, second: -1, threats: -1, score: -1 };

  constructor(private handlers: UiHandlers, muted: boolean) {
    this.soundBtn.setAttribute('aria-pressed', String(!muted));
    document.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'sound') {
        const on = this.handlers.toggleSound();
        this.soundBtn.setAttribute('aria-pressed', String(on));
        return;
      }
      this.handlers.press();
      if (action === 'start') this.handlers.start();
      if (action === 'restart') this.handlers.restart();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (!this.start.hidden) {
        e.preventDefault();
        $<HTMLButtonElement>('[data-action="start"]').click();
      }
    });
  }

  hideScreens(): void {
    this.start.hidden = true;
    this.victory.hidden = true;
    this.defeat.hidden = true;
  }

  resetRun(): void {
    this.hideScreens();
    this.body.classList.remove('storm', 'imminent', 'critical', 'playing', 'hud-on');
    this.damage.className = 'fx fx-damage';
    this.stormBanner.classList.remove('show');
    this.finalCount.className = 'final-count';
    this.finalCount.textContent = '';
    this.shown = { integrity: -1, second: -1, threats: -1, score: -1 };
  }

  showCount(value: number | 'go'): void {
    this.countdownEl.textContent = value === 'go' ? 'DEFEND EARTH' : String(value);
    this.countdownEl.classList.toggle('go', value === 'go');
    restartAnimation(this.countdownEl, 'show');
  }

  setPlaying(on: boolean): void {
    this.body.classList.toggle('playing', on);
    if (on) this.body.classList.add('hud-on');
  }

  showHud(on: boolean): void {
    this.body.classList.toggle('hud-on', on);
  }

  update(sim: Simulation): void {
    const integrity = Math.round(sim.integrity);
    if (integrity !== this.shown.integrity) {
      const first = this.shown.integrity < 0;
      this.shown.integrity = integrity;
      this.integrityValue.textContent = String(integrity);
      const scale = `scaleX(${integrity / 100})`;
      this.integrityFill.style.transform = scale;
      this.integrityTrail.style.transform = scale;
      if (first) {
        this.integrityTrail.style.transition = 'none';
        void this.integrityTrail.offsetWidth;
        this.integrityTrail.style.transition = '';
      }
      this.integrityBar.setAttribute('aria-valuenow', String(integrity));
      this.body.classList.toggle('critical', sim.critical);
    }

    const second = Math.ceil(sim.timeLeft);
    if (second !== this.shown.second) {
      this.shown.second = second;
      this.timer.innerHTML = formatClock(second)
        .split('')
        .map((ch) => (ch === ':' ? '<span class="c">:</span>' : `<span class="d">${ch}</span>`))
        .join('');
      this.rebootFill.style.transform = `scaleX(${(RUN_SECONDS - sim.timeLeft) / RUN_SECONDS})`;
    }

    if (sim.destroyed !== this.shown.threats) {
      this.shown.threats = sim.destroyed;
      this.threats.textContent = String(sim.destroyed);
    }
    if (sim.score !== this.shown.score) {
      const bump = this.shown.score >= 0 && sim.score > this.shown.score;
      this.shown.score = sim.score;
      this.score.textContent = sim.score.toLocaleString('en-US');
      if (bump) restartAnimation(this.score, 'bump');
    }
  }

  storm(): void {
    this.body.classList.add('storm');
    restartAnimation(this.stormBanner, 'show');
  }

  imminent(): void {
    this.body.classList.add('imminent');
  }

  finalTick(second: number): void {
    if (second <= 0) return;
    this.finalCount.textContent = String(second);
    this.finalCount.classList.toggle('peak', second <= 3);
    restartAnimation(this.finalCount, 'tick');
    restartAnimation(this.timer, 'punch');
  }

  damagePulse(final: boolean): void {
    if (final) {
      this.damage.className = 'fx fx-damage final';
    } else {
      restartAnimation(this.damage, 'hit');
    }
  }

  flash(kind: 'white' | 'cyan' = 'white'): void {
    this.flashEl.classList.toggle('cyan', kind === 'cyan');
    restartAnimation(this.flashEl, 'on');
  }

  endRun(): void {
    this.body.classList.remove('playing', 'imminent', 'storm');
    this.finalCount.className = 'final-count';
    this.stormBanner.classList.remove('show');
  }

  showVictory(stats: RunStats): void {
    this.showHud(false);
    this.fillStats(this.victory, stats);
    this.victory.hidden = false;
    this.focusButton(this.victory);
  }

  showDefeat(stats: RunStats): void {
    this.showHud(false);
    this.body.classList.remove('critical');
    this.fillStats(this.defeat, stats);
    this.defeat.hidden = false;
    this.focusButton(this.defeat);
  }

  private focusButton(screen: HTMLElement): void {
    window.setTimeout(() => screen.querySelector<HTMLButtonElement>('.btn')?.focus({ preventScroll: true }), 800);
  }

  private fillStats(root: HTMLElement, s: RunStats): void {
    const set = (key: string, value: string) => {
      const el = root.querySelector<HTMLElement>(`[data-stat="${key}"]`);
      if (el) el.textContent = value;
    };
    set('destroyed', String(s.destroyed));
    set('integrity', `${Math.round(s.integrity)}%`);
    set('score', s.score.toLocaleString('en-US'));
    set('survived', formatClock(Math.floor(s.survived)));
  }
}
